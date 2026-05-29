import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function envNameForConfigKey(key: string): string {
  return `NEXT_PUBLIC_FIREBASE_${key
    .replace(/[A-Z]/g, (match) => `_${match}`)
    .toUpperCase()}`;
}

function assertFirebaseConfig() {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => envNameForConfigKey(key));

  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missingKeys.join(", ")}`);
  }
}

export function getFirebaseApp(): FirebaseApp {
  assertFirebaseConfig();
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
