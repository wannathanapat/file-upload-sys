const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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
  const { doc, getDoc } = require('firebase/firestore');
  const prefRef = doc(db, 'app_config', 'gdrive_preferences');
  const prefSnap = await getDoc(prefRef);

  if (!prefSnap.exists()) {
    throw new Error('No GDrive prefs found');
  }

  const prefs = prefSnap.data();
  const { clientId, clientSecret, refreshToken, accessToken, tokenExpiresAt } = prefs;

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

  const refreshData = await refreshRes.json();
  return refreshData.access_token;
}

async function searchSubmission() {
  try {
    const q = query(collection(db, 'submissions'), where('order_no', '==', '8000561401'));
    let snap = await getDocs(q);
    if (snap.empty) {
      // Try by job_id
      const q2 = query(collection(db, 'submissions'), where('job_id', '==', '8000561401'));
      snap = await getDocs(q2);
    }
    if (snap.empty) {
      console.log('No submission found with order_no/job_id 8000561401. Let us list the latest submissions containing "ธนารี่"');
      const q3 = query(collection(db, 'submissions'));
      const all = await getDocs(q3);
      all.forEach(doc => {
        const data = doc.data();
        if (data.file_name && data.file_name.includes('ธนารี่')) {
          console.log('Match by file_name:', data.file_name, 'URL:', data.file_url);
          checkGDrive(data.file_url);
        }
      });
      return;
    }

    snap.forEach(doc => {
      const data = doc.data();
      console.log('Submission:', doc.id);
      console.log('File Name:', data.file_name);
      console.log('File URL:', data.file_url);
      checkGDrive(data.file_url);
    });
  } catch (err) {
    console.error(err);
  }
}

async function checkGDrive(fileUrl) {
  const match = fileUrl.match(/[?&]id=([^&]+)/) || fileUrl.match(/\/d\/(.+?)\//);
  if (!match || !match[1]) {
    console.log('No file ID in URL:', fileUrl);
    return;
  }
  const fileId = match[1];
  try {
    const token = await getValidAccessTokenServer();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meta = await res.json();
    console.log('GDrive Metadata for', fileId, ':', meta);
  } catch (err) {
    console.error('Error fetching GDrive info:', err);
  }
}

searchSubmission();
