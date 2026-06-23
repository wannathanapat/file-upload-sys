import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCn3Sthueb9jTqYt3xSbZUdsihuKRmSdtk",
  authDomain: "coway-upload-sys.firebaseapp.com",
  projectId: "coway-upload-sys",
  storageBucket: "coway-upload-sys.firebasestorage.app",
  messagingSenderId: "1033387119671",
  appId: "1:1033387119671:web:cad71a2ce09102e03d5bb2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try {
  const snap = await getDoc(doc(db, 'app_config', 'system_settings'));
  if (snap.exists()) {
    console.log("SETTINGS_DATA:" + JSON.stringify(snap.data()));
  } else {
    console.log("No document found!");
  }
} catch (e) {
  console.error("Error reading doc:", e);
}
process.exit(0);
