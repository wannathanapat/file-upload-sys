import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

// Initialize a dedicated Firebase Admin app for push notifications
function getPushAdminApp(serviceAccountJson: string): App {
  const appName = 'push-notify-admin';
  const existing = getApps().find(a => a.name === appName);
  if (existing) return existing;

  const serviceAccount = JSON.parse(serviceAccountJson);
  return initializeApp({ credential: cert(serviceAccount) }, appName);
}

// Shared default app (for reading system_settings without a service account)
function getDefaultAdminApp(): App {
  const existing = getApps().find(a => a.name === '[DEFAULT]');
  if (existing) return existing;
  // No env credentials available — return null and handle gracefully below
  return initializeApp();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, body: msgBody, url } = body as { title: string; body?: string; url?: string };

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // --- 1. Read system_settings from Firestore ---
    // We use the default Admin app which is initialized automatically on Firebase Hosting/Cloud Run.
    // For local dev, we bootstrap with service account after we read it once from the client-side
    // stored value (passed in the request body if available) or from env.
    let defaultApp: App;
    try {
      defaultApp = getDefaultAdminApp();
    } catch {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized. Set up GOOGLE_APPLICATION_CREDENTIALS or run on Firebase hosting.' },
        { status: 500 }
      );
    }

    const settingsDoc = await getFirestore(defaultApp)
      .collection('app_config')
      .doc('system_settings')
      .get();

    if (!settingsDoc.exists) {
      return NextResponse.json({ error: 'system_settings not found in Firestore' }, { status: 500 });
    }

    const settings = settingsDoc.data()!;
    const pushStatus: string = settings.push_status ?? 'disabled';
    const pushServiceAccount: string = settings.push_service_account ?? '';

    if (pushStatus !== 'enabled') {
      return NextResponse.json({ message: 'Push notification is disabled', successCount: 0 });
    }

    if (!pushServiceAccount) {
      return NextResponse.json(
        { error: 'push_service_account not configured in system settings' },
        { status: 500 }
      );
    }

    // --- 2. Initialize dedicated push app with service account from Firestore ---
    const pushApp = getPushAdminApp(pushServiceAccount);
    const pushMessaging = getMessaging(pushApp);
    const pushFirestore = getFirestore(pushApp);

    // --- 3. Load all registered tokens ---
    const tokensSnap = await pushFirestore.collection('notification_tokens').get();

    if (tokensSnap.empty) {
      return NextResponse.json({ message: 'No registered devices', successCount: 0 });
    }

    const tokens: string[] = tokensSnap.docs
      .map(d => (d.data().token as string))
      .filter(Boolean);

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'No valid tokens', successCount: 0 });
    }

    // --- 4. Send in batches of 500 (FCM limit) ---
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
          imageUrl: undefined,
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

      // Collect stale/invalid tokens
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

    // --- 5. Auto-clean stale tokens ---
    if (staleTokens.length > 0) {
      const cleanupBatch = pushFirestore.batch();
      for (const staleToken of staleTokens) {
        cleanupBatch.delete(pushFirestore.collection('notification_tokens').doc(staleToken));
      }
      await cleanupBatch.commit();
      console.log(`[push-notify] Cleaned up ${staleTokens.length} stale token(s)`);
    }

    return NextResponse.json({
      message: 'Notifications sent',
      successCount,
      totalTokens: tokens.length,
      staleTokensCleaned: staleTokens.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[push-notify] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
