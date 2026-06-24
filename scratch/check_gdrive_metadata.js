const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const defaultFirebaseConfig = {
  apiKey: "AIzaSyCn3Sthueb9jTqYt3xSbZUdsihuKRmSdtk",
  authDomain: "coway-upload-sys.firebaseapp.com",
  projectId: "coway-upload-sys",
  storageBucket: "coway-upload-sys.firebasestorage.app",
  messagingSenderId: "1033387119671",
  appId: "1:1033387119671:web:cad71a2ce09102e03d5bb2"
};

const app = initializeApp(defaultFirebaseConfig);
const db = getFirestore(app);

async function getValidAccessTokenServer() {
  const prefRef = doc(db, 'app_config', 'gdrive_preferences');
  const prefSnap = await getDoc(prefRef);

  if (!prefSnap.exists()) {
    throw new Error('No GDrive prefs found');
  }

  const prefs = prefSnap.data();
  const { clientId, clientSecret, refreshToken, accessToken, tokenExpiresAt } = prefs;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing credentials in stored prefs');
  }

  const now = Date.now();
  if (accessToken && tokenExpiresAt && now < tokenExpiresAt - 120000) {
    return accessToken;
  }

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!refreshRes.ok) {
    const errText = await refreshRes.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const refreshData = await refreshRes.json();
  return refreshData.access_token;
}

async function checkMetadata(fileId) {
  try {
    const token = await getValidAccessTokenServer();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      console.error(`Error fetching ${fileId}:`, res.status, await res.text());
      return;
    }
    const data = await res.json();
    console.log(`Metadata for ${fileId}:`, data);
  } catch (err) {
    console.error(`Error for ${fileId}:`, err);
  }
}

async function main() {
  await checkMetadata('1Zc0bKaCiHoYh8W9T71d5HKsyJkP1wfTi');
  await checkMetadata('12qLIWNoTrClvE4zKQdYYZM5Ae8h_NNXF');
}

main();
