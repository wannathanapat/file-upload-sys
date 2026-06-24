import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

// ---------------------------------------------------------------------------
// Module-level singleton  — keyed by project_id from the service account
// Prevents duplicate Firebase Admin app initialization across requests
// ---------------------------------------------------------------------------
const adminAppCache = new Map<string, App>();

function getPushAdminApp(serviceAccountJson: string): { app: App; projectId: string } {
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('Service Account JSON ไม่ถูกต้อง — ตรวจสอบว่า copy ครบทั้ง JSON block นะครับ');
  }

  const projectId = serviceAccount.project_id as string;
  if (!projectId) throw new Error('Service Account JSON ไม่มี project_id');

  const cacheKey = `push-notify-${projectId}`;

  const cached = adminAppCache.get(cacheKey);
  if (cached) return { app: cached, projectId };

  const existing = getApps().find(a => a.name === cacheKey);
  if (existing) {
    adminAppCache.set(cacheKey, existing);
    return { app: existing, projectId };
  }

  const app = initializeApp({ credential: cert(serviceAccount as any) }, cacheKey);
  adminAppCache.set(cacheKey, app);
  return { app, projectId };
}

// ---------------------------------------------------------------------------
// POST /api/push-notify
//
// Body:
//   title             string    (required)
//   body              string?
//   url               string?
//   serviceAccountJson string   (required)
//   tokens            string[]  (required — read client-side by the caller)
//   notifId           string?   (optional Firestore doc ID to mark as sent)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      body: msgBody,
      url,
      serviceAccountJson,
      tokens,
      notifId,
    } = body as {
      title: string;
      body?: string;
      url?: string;
      serviceAccountJson?: string;
      tokens?: string[];
      notifId?: string;
    };

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!serviceAccountJson?.trim()) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่า Service Account JSON — กรุณาตั้งค่าในหน้า Settings → Push Notification' },
        { status: 400 }
      );
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        message: 'ยังไม่มีอุปกรณ์ลงทะเบียนรับแจ้งเตือน — กรุณารีเฟรชหน้าเว็บแล้วกด Allow เมื่อเบราว์เซอร์ขอสิทธิ์ครับ',
        successCount: 0,
      });
    }

    // ----------------------------------------------------------------
    // 1. Init (or reuse) Firebase Admin app
    // ----------------------------------------------------------------
    let app: App;
    try {
      ({ app } = getPushAdminApp(serviceAccountJson.trim()));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Service Account JSON ผิดพลาด: ${msg}` }, { status: 500 });
    }

    const pushMessaging = getMessaging(app);

    // ----------------------------------------------------------------
    // 2. Send FCM in batches of 500 (FCM multicast limit)
    // ----------------------------------------------------------------
    const BATCH_SIZE = 500;
    let successCount = 0;
    const staleTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);

      const message: MulticastMessage = {
        tokens: batch,
        notification: {
          title,
          body: msgBody ?? '',
        },
        webpush: {
          notification: {
            icon: '/coway-logo-new.png',
            badge: '/coway-logo-new.png',
            requireInteraction: true,
          },
          fcmOptions: {
            link: url ?? '/notifications',
          },
        },
      };

      let response;
      try {
        response = await pushMessaging.sendEachForMulticast(message);
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e);
        if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('Quota')) {
          return NextResponse.json(
            { error: 'FCM API quota เต็มชั่วคราว (RESOURCE_EXHAUSTED) ลองอีกครั้งในสักครู่นะครับ' },
            { status: 429 }
          );
        }
        throw e;
      }

      successCount += response.successCount;

      response.responses.forEach((res, idx: number) => {
        if (!res.success) {
          const errCode = (res.error as any)?.code ?? '';
          if (
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/invalid-registration-token'
          ) {
            staleTokens.push(batch[idx]);
          }
        }
      });
    }

    // ----------------------------------------------------------------
    // 3. Mark notification as sent in Firestore (write-only, no read)
    // ----------------------------------------------------------------
    if (notifId && successCount > 0) {
      try {
        const db = getFirestore(app);
        await db.collection('notifications').doc(notifId).update({
          sent: true,
          sent_count: successCount,
          sent_at: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // Non-critical — don't fail the whole request
        console.warn('[push-notify] Could not update notification sent status:', e);
      }
    }

    return NextResponse.json({
      message: successCount > 0 ? 'ส่งแจ้งเตือนสำเร็จ' : 'ส่งแจ้งเตือนไม่สำเร็จ (token อาจหมดอายุ)',
      successCount,
      totalTokens: tokens.length,
      staleTokens,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[push-notify] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
