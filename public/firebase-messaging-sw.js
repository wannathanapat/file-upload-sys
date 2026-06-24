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
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/coway-logo-new.png',
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click to focus or open the page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Retrieve the url from payload data or fallback to dashboard
  const clickAction = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open at the dashboard, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(clickAction) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(clickAction);
      }
    })
  );
});
