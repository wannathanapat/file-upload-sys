import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, deleteApp, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

// ---------------------------------------------------------------------------
// Module-level singleton map  — persists across Next.js requests in the same
// Node.js process, preventing duplicate gRPC channel creation (RESOURCE_EXHAUSTED)
// ---------------------------------------------------------------------------
const adminAppCache = new Map<string, App>();

function getPushAdminApp(serviceAccountJson: string): App {
  // Use project_id as stable cache key
  let projectId: string;
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    projectId = serviceAccount.project_id as string;
  } catch {
    throw new Error('Service Account JSON ไม่ถูกต้อง ตรวจสอบว่า copy ครบทั้ง JSON block ครับ');
  }

  if (!projectId) {
    throw new Error('Service Account JSON ไม่มี project_id');
  }

  const cacheKey = `push-notify-${projectId}`;

  const cached = adminAppCache.get(cacheKey);
  if (cached) return cached;

  // Also check getApps() registry (in case of HMR re-imports)
  const existing = getApps().find(a => a.name === cacheKey);
  if (existing) {
    adminAppCache.set(cacheKey, existing);
    return existing;
  }

  const app = initializeApp({ credential: cert(serviceAccount as any) }, cacheKey);
  adminAppCache.set(cacheKey, app);
  return app;
}

// ---------------------------------------------------------------------------
// POST /api/push-notify
// Body: { title, body?, url?, serviceAccountJson? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      body: msgBody,
      url,
      serviceAccountJson: bodyServiceAccountJson,
    } = body as {
      title: string;
      body?: string;
      url?: string;
      serviceAccountJson?: string;
    };

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // ----------------------------------------------------------------
    // 1. Resolve serviceAccountJson — body takes priority over Firestore
    // ----------------------------------------------------------------
    let resolvedServiceAccountJson: string = bodyServiceAccountJson?.trim() ?? '';

    if (!resolvedServiceAccountJson) {
      // Fallback: read from Firestore via default admin app (env-based / Cloud Run ADC)
      const defaultApp = getApps().find(a => a.name === '[DEFAULT]');
      if (!defaultApp) {
        return NextResponse.json(
          { error: 'ไม่พบ Service Account JSON กรุณาส่ง serviceAccountJson ใน request หรือตั้งค่า GOOGLE_APPLICATION_CREDENTIALS' },
          { status: 500 }
        );
      }
      try {
        const settingsDoc = await getFirestore(defaultApp)
          .collection('app_config')
          .doc('system_settings')
          .get();

        const settings = settingsDoc.data() ?? {};
        if (settings.push_status !== 'enabled') {
          return NextResponse.json({ message: 'Push notification ปิดอยู่', successCount: 0 });
        }
        resolvedServiceAccountJson = settings.push_service_account ?? '';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `อ่าน service account จาก Firestore ไม่ได้: ${msg}` }, { status: 500 });
      }
    }

    if (!resolvedServiceAccountJson) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่า Service Account JSON กรุณาตั้งค่าในหน้า Settings → Push Notification' },
        { status: 500 }
      );
    }

    // ----------------------------------------------------------------
    // 2. Init (or reuse) Firebase Admin app
    // ----------------------------------------------------------------
    let pushApp: App;
    try {
      pushApp = getPushAdminApp(resolvedServiceAccountJson);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Service Account JSON ผิดพลาด: ${msg}` }, { status: 500 });
    }

    // ----------------------------------------------------------------
    // 3. Read FCM tokens from Firestore
    // ----------------------------------------------------------------
    const pushFirestore = getFirestore(pushApp);
    let tokensSnap;
    try {
      tokensSnap = await pushFirestore.collection('notification_tokens').get();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      // Friendlier message for quota / permission errors
      if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('Quota')) {
        return NextResponse.json(
          { error: 'Firebase Firestore quota เต็มชั่วคราว (RESOURCE_EXHAUSTED) ลองอีกครั้งในสักครู่นะครับ หรือตรวจสอบ Firestore Usage ใน Firebase Console' },
          { status: 429 }
        );
      }
      if (raw.includes('PERMISSION_DENIED')) {
        return NextResponse.json(
          { error: 'Service Account ไม่มีสิทธิ์อ่าน Firestore — กรุณาตรวจสอบ IAM Role ของ Service Account ให้มี Cloud Datastore User หรือ Firebase Admin SDK Administrator Service Agent' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: `Firestore error: ${raw}` }, { status: 500 });
    }

    if (tokensSnap.empty) {
      return NextResponse.json({
        message: 'ยังไม่มีอุปกรณ์ลงทะเบียนแจ้งเตือน — กรุณาเปิดแอปในเบราว์เซอร์แล้วกด "Allow" เมื่อขอสิทธิ์แจ้งเตือนก่อนนะครับ',
        successCount: 0,
      });
    }

    const tokens: string[] = tokensSnap.docs
      .map(d => d.data().token as string)
      .filter(Boolean);

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'ไม่พบ Token ที่ใช้ได้', successCount: 0 });
    }

    // ----------------------------------------------------------------
    // 4. Send in batches of 500 (FCM limit)
    // ----------------------------------------------------------------
    const pushMessaging = getMessaging(pushApp);
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
          },
          fcmOptions: {
            link: url ?? '/dashboard',
          },
        },
      };

      const response = await pushMessaging.sendEachForMulticast(message);
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
    // 5. Clean up stale tokens automatically
    // ----------------------------------------------------------------
    if (staleTokens.length > 0) {
      const cleanupBatch = pushFirestore.batch();
      for (const t of staleTokens) {
        cleanupBatch.delete(pushFirestore.collection('notification_tokens').doc(t));
      }
      await cleanupBatch.commit();
      console.log(`[push-notify] Cleaned up ${staleTokens.length} stale token(s)`);
    }

    return NextResponse.json({
      message: 'ส่งแจ้งเตือนสำเร็จ',
      successCount,
      totalTokens: tokens.length,
      staleTokensCleaned: staleTokens.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[push-notify] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
