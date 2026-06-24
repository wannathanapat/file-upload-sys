import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

// Get or create a named Firebase Admin app using the given service account JSON string
function getAdminApp(serviceAccountJson: string, appName: string): App {
  const existing = getApps().find(a => a.name === appName);
  if (existing) return existing;

  const serviceAccount = JSON.parse(serviceAccountJson);
  return initializeApp({ credential: cert(serviceAccount) }, appName);
}

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
    // Step 1: Resolve serviceAccountJson
    // Priority: body > Firestore (via env-based default admin app)
    // ----------------------------------------------------------------
    let resolvedServiceAccountJson: string = bodyServiceAccountJson?.trim() ?? '';

    if (!resolvedServiceAccountJson) {
      // Try reading from Firestore via a default admin app (env-based credentials)
      // This works on Firebase Hosting / Cloud Run where ADC is set up automatically
      try {
        const defaultApps = getApps();
        const defaultApp = defaultApps.find(a => a.name === '[DEFAULT]');
        if (!defaultApp) {
          return NextResponse.json(
            {
              error:
                'No service account credentials provided. ' +
                'Pass serviceAccountJson in the request body, or configure GOOGLE_APPLICATION_CREDENTIALS.',
            },
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
        resolvedServiceAccountJson = settings.push_service_account ?? '';

        if (settings.push_status !== 'enabled') {
          return NextResponse.json({ message: 'Push notification is disabled', successCount: 0 });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: `Cannot load service account from Firestore: ${msg}` },
          { status: 500 }
        );
      }
    }

    if (!resolvedServiceAccountJson) {
      return NextResponse.json(
        { error: 'push_service_account is empty. Please configure it in Settings → Push Notification.' },
        { status: 500 }
      );
    }

    // ----------------------------------------------------------------
    // Step 2: Init dedicated push admin app + read all FCM tokens
    // ----------------------------------------------------------------
    let pushApp: App;
    try {
      pushApp = getAdminApp(resolvedServiceAccountJson, 'push-notify-admin');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `Invalid Service Account JSON: ${msg}` },
        { status: 500 }
      );
    }

    const pushFirestore = getFirestore(pushApp);
    const pushMessaging = getMessaging(pushApp);

    const tokensSnap = await pushFirestore.collection('notification_tokens').get();

    if (tokensSnap.empty) {
      return NextResponse.json({ message: 'No registered devices yet. Please open the app on a device first.', successCount: 0 });
    }

    const tokens: string[] = tokensSnap.docs
      .map(d => d.data().token as string)
      .filter(Boolean);

    if (tokens.length === 0) {
      return NextResponse.json({ message: 'No valid tokens', successCount: 0 });
    }

    // ----------------------------------------------------------------
    // Step 3: Send notifications in batches of 500 (FCM limit)
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
          },
          fcmOptions: {
            link: url ?? '/dashboard',
          },
        },
      };

      const response = await pushMessaging.sendEachForMulticast(message);
      successCount += response.successCount;

      // Collect stale / invalid tokens for cleanup
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
    // Step 4: Auto-clean stale tokens
    // ----------------------------------------------------------------
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
