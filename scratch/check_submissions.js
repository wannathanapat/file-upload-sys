const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, limit, query, orderBy } = require('firebase/firestore');

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

async function checkSubmissions() {
  try {
    const q = query(collection(db, 'submissions'), orderBy('submission_date', 'desc'), limit(5));
    const snap = await getDocs(q);
    snap.forEach(doc => {
      const data = doc.data();
      console.log('--- Submission:', doc.id, '---');
      console.log('Status:', data.status);
      console.log('Work Type:', data.work_type);
      console.log('File Name:', data.file_name);
      console.log('File URL:', data.file_url);
      console.log('Video Name:', data.video_name);
      console.log('Video URL:', data.video_url);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSubmissions();
