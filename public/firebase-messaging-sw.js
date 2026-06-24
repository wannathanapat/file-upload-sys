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
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || 'แจ้งเตือนระบบส่งงาน';
  const clickUrl = payload.fcmOptions?.link || payload.data?.url || '/notifications';

  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/coway-logo-new.png',
    badge: '/coway-logo-new.png',
    tag: 'job-alert',          // replaces previous notification of same tag (no stacking)
    renotify: true,
    requireInteraction: true,  // keeps notification visible until user dismisses
    data: { url: clickUrl },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click → open/focus /notifications page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window that is already on the target path
      for (const client of windowClients) {
        if (client.url.includes(clickUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If any window is open at all, navigate it to the target
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
