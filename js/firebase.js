/**
 * The Eternal Dread — Firebase & Cloudinary Initialization
 * 
 * This file ONLY handles:
 *  - Firebase app initialization
 *  - Firebase Authentication initialization
 *  - Firestore initialization
 *  - Cloudinary configuration
 *
 * Do NOT add application logic here. All app logic belongs in:
 *   - js/auth.js      (authentication flows)
 *   - js/app.js       (Firestore CRUD, chat, posts, etc.)
 *   - js/main.js      (common UI)
 *   - js/profile.js   (profile logic)
 *   - js/admin.js     (admin logic)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ════════════════════════════════════════════════════════════════
 * 1. FIREBASE CONFIG
 * ════════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyBHciJkETgSNMv6R2aqmbDNz77NIwgF_uM",
  authDomain: "the-eternal-dread.firebaseapp.com",
  projectId: "the-eternal-dread",
  storageBucket: "the-eternal-dread.firebasestorage.app",
  messagingSenderId: "489008497572",
  appId: "1:489008497572:web:b7289908cd99fe05403731",
  measurementId: "G-GJWTVXR1TR"
};

/* ════════════════════════════════════════════════════════════════
 * 2. CLOUDINARY CONFIG
 * ════════════════════════════════════════════════════════════════
 * Get your Cloud Name from the Cloudinary Dashboard.
 * Get your preset name from Settings → Upload → Upload presets.
 * The preset MUST be Unsigned (client-side uploads).
 */
const cloudinaryConfig = {
  cloudName: "en22xets", // Your Cloud Name
  uploadPreset: "ted_unsigned", // Your Unsigned Preset
  folder: "the-eternal-dread" // Optional organizing folder
};

// The API endpoint for unsigned uploads
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`;

/* ════════════════════════════════════════════════════════════════
 * 3. INITIALIZE FIREBASE
 * ════════════════════════════════════════════════════════════════ */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Persist sessions across browser refreshes
try {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[firebase.js] Could not set auth persistence:", err);
  });
} catch (err) {
  console.warn("[firebase.js] setPersistence threw:", err);
}

const db = getFirestore(app);

/* ════════════════════════════════════════════════════════════════
 * 4. EXPORTS
 * ════════════════════════════════════════════════════════════════ */
export {
  app,
  auth,
  db,
  firebaseConfig,
  cloudinaryConfig,
  CLOUDINARY_UPLOAD_URL
};

/**
 * Friendly log message
 */
console.log(
  "%cThe Eternal Dread · Firebase & Cloudinary ready",
  "color:#0b1220;background:#f1f5f9;padding:4px 8px;border-radius:6px;font-weight:600;font-size:11px;letter-spacing:.5px;"
);