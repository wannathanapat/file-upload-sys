import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

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
  const docRef = doc(db, 'app_config', 'system_settings');
  await updateDoc(docRef, {
    app_name: "ระบบส่งงาน AS INS",
    app_subtitle: "COWAY AS & INSTALLATION SYSTEM"
  });
  console.log("Database records for app_name and app_subtitle successfully repaired!");
} catch (e) {
  console.error("Error repairing doc:", e);
}
process.exit(0);
