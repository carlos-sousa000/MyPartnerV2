import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const config = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDOoReQ-Z8HBSA12DtpIe4jMIbZrlBkEzI",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "my-partner-0001.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "my-partner-0001",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "my-partner-0001.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "672940595068",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:672940595068:web:21d20dcb48dae9c36b36f9",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-RFJBZ8PGYW",
};

export const firebaseConfigured = Object.values(config).every(Boolean);
export const firebaseApp = firebaseConfigured
  ? getApps().length
    ? getApps()[0]
    : initializeApp(config)
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

// Analytics only runs in the browser. Firebase Storage is intentionally not initialized.
export const analyticsPromise =
  firebaseApp && typeof window !== "undefined"
    ? isSupported().then((supported) =>
        supported ? getAnalytics(firebaseApp) : null,
      )
    : Promise.resolve(null);
