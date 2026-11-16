// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from 'firebase/functions';
// analytics is optional and may throw in non-browser environments
let getAnalyticsFn = null;
try {
  // dynamic require-ish import to avoid bundlers failing in some envs
  // eslint-disable-next-line import/no-unresolved
  // Note: keep as import statement compatible with ESM bundlers
  // We'll call getAnalytics only when window is present.
  // Import at runtime to avoid issues in SSR/test.
  getAnalyticsFn = (await import('firebase/analytics')).getAnalytics;
} catch (e) {
  getAnalyticsFn = null;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCTsIL7-dEUE3rBDaVqCNTye0ul1ZHAcEk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "capstone-d5b64.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://capstone-d5b64-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "capstone-d5b64",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "capstone-d5b64.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1004711599459",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1004711599459:web:fe744e4e3cc13f120ac756",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-R8Y72PYJXL"
};

const app = initializeApp(firebaseConfig);
let analytics = null;
if (typeof window !== 'undefined' && getAnalyticsFn) {
  try {
    analytics = getAnalyticsFn(app);
  } catch (e) {
    // ignore analytics initialization errors (e.g., missing measurementId)
    analytics = null;
  }
}

export const auth = getAuth(app);
export const database = getDatabase(app);
// Default functions region: prefer env override, otherwise use asia-southeast1 to match RTDB
const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-southeast1';
export const functions = getFunctions(app, FUNCTIONS_REGION);
export { analytics, app };

// Optional prefix to scope DB reads/writes (useful for staging)
// Set VITE_DB_PREFIX to a path like '/staging' in your .env or in the dev server env.
export const DB_PREFIX = import.meta.env.VITE_DB_PREFIX || '';

/**
 * Get a fully-qualified database ref path with optional prefix.
 * Example: dbRef('users') -> '/staging/users' when VITE_DB_PREFIX='/staging'
 */
export function dbRef(path) {
  if (!path) return DB_PREFIX || '/';
  const p = String(path).replace(/^\//, '');
  if (!DB_PREFIX) return `/${p}`;
  const prefix = DB_PREFIX.endsWith('/') ? DB_PREFIX.slice(0, -1) : DB_PREFIX;
  return `${prefix}/${p}`;
}
