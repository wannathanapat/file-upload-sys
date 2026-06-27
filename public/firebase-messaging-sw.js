// Give the service worker access to Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker.
firebase.initializeApp({
  apiKey: "AIzaSyCn3Sthueb9jTqYt3xSbZUdsihuKRmSdtk",
  authDomain: "coway-upload-sys.firebaseapp.com",
  projectId: "coway-upload-sys",
  storageBucket: "coway-upload-sys.firebasestorage.app",
  messagingSenderId: "1033387119671",
  appId: "1:1033387119671:web:cad71a2ce09102e03d5bb2"
});

// Retrieve an instance of Firebase Messaging to handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message', payload);

  // Title and body come from payload.data (data-only message) to avoid
  // the double-notification bug where the FCM SDK also auto-displays
  // a notification when a top-level `notification` field is present.
  const notificationTitle = payload.data?.title || payload.notification?.title || 'แจ้งเตือนระบบส่งงาน';

  // Build the destination URL: prefer /notifications?id=xxx if notifId is present
  const notifId = payload.data?.notifId || '';
  const baseUrl = payload.fcmOptions?.link || payload.data?.url || '/notifications';
  const clickUrl = notifId ? `/notifications?id=${notifId}` : baseUrl;

  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || '',
    icon: '/coway-logo-new.png',
    badge: '/coway-logo-new.png',
    tag: 'job-alert',          // replaces previous same-tag notification
    renotify: true,
    requireInteraction: true,  // keeps visible until dismissed
    data: { url: clickUrl, notifId },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click → open/focus the target URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus a window already showing /notifications
      for (const client of windowClients) {
        if (client.url.includes('/notifications') && 'focus' in client) {
          // Navigate it to the specific item if needed
          if ('navigate' in client) {
            return client.navigate(clickUrl).then(c => c && c.focus());
          }
          return client.focus();
        }
      }
      // Navigate any existing window to the target
      for (const client of windowClients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(clickUrl).then(c => c && c.focus());
        }
      }
      // Otherwise open a brand-new window
      if (clients.openWindow) {
        return clients.openWindow(clickUrl);
      }
    })
  );
});
