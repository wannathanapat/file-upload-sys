import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';

const defaultFirebaseConfig = {
  apiKey: "AIzaSyCn3Sthueb9jTqYt3xSbZUdsihuKRmSdtk",
  authDomain: "coway-upload-sys.firebaseapp.com",
  projectId: "coway-upload-sys",
  storageBucket: "coway-upload-sys.firebasestorage.app",
  messagingSenderId: "1033387119671",
  appId: "1:1033387119671:web:cad71a2ce09102e03d5bb2"
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseConfig() {
  if (typeof window === 'undefined') return defaultFirebaseConfig;
  try {
    const cached = localStorage.getItem('cfg_firebase_config');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error("Failed to parse firebase config from cache", e);
  }
  return defaultFirebaseConfig;
}

export function initFirebase() {
  if (db && app) return { app, db };
  
  const config = getFirebaseConfig();
  try {
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    
    // Enable offline persistence on client side
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn("Firestore persistence failed-precondition: multiple tabs open.");
        } else if (err.code === 'unimplemented') {
          console.warn("Firestore persistence unimplemented in this browser.");
        }
      });
    }
  } catch (e) {
    console.error("Firebase initialization failed", e);
  }
  return { app, db };
}

// Helper to get db reference safely
export function getDb(): Firestore {
  if (!db) {
    const res = initFirebase();
    return res.db!;
  }
  return db;
}

// Helper to get Firebase app instance safely
export function getFirebaseApp(): FirebaseApp {
  if (!app) initFirebase();
  return app!;
}
