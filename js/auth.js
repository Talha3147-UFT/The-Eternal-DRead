/**
 * The Eternal Dread — Authentication Module (Fixed)
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from './firebase.js';

/* ════════════════════════════════════════════════════════════════
 * REGISTRATION GUARD
 * ════════════════════════════════════════════════════════════════ */
let registrationInProgress = false;

/* ════════════════════════════════════════════════════════════════
 * REGISTER
 * ════════════════════════════════════════════════════════════════ */
export async function register({
  name, nickname, email, phone, password, photoBase64 = ''
}) {
  if (!name || !nickname || !email || !password) {
    throw new Error('Missing required registration fields.');
  }

  registrationInProgress = true;
  try {
    // 1) Create the Firebase Auth user
    console.log("Auth: Creating user in Firebase Authentication...");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    // 2) Update the Auth display name
    try {
      await updateAuthProfile(user, { displayName: name });
    } catch (e) {
      console.warn('[auth.js] Could not set displayName:', e);
    }

    // 3) Create the Firestore user doc
    console.log("Auth: User created in Auth. Now writing to Firestore...");
    const userDoc = {
      name,
      nickname,
      email,
      phone: phone || '',
      profileImageBase64: photoBase64 || '',
      bio: '',
      birthday: null,
      address: '',
      role: 'user',
      status: 'online',
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), userDoc);
      console.log("✅ Auth: User document successfully written to Firestore!");
    } catch (err) {
      console.error("❌ Auth: Firestore write failed!", err);
      throw new Error(
        err.code === 'permission-denied' 
          ? 'Firestore Rules are blocking writes. Please update them in the Firebase Console.'
          : 'Could not save your profile. Please try again.'
      );
    }

    return { user, userDoc };
  } finally {
    registrationInProgress = false;
  }
}

/* ════════════════════════════════════════════════════════════════
 * LOGIN
 * ════════════════════════════════════════════════════════════════ */
export async function login(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }
  
  console.log("Auth: Attempting login...");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  // Ensure a Firestore doc exists (defensive)
  let userDoc = null;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      userDoc = { id: snap.id, ...snap.data() };
      await updateDoc(ref, {
        status: 'online',
        lastSeen: serverTimestamp()
      }).catch(() => {});
    } else {
      // Auto-create a minimal profile if it doesn't exist
      userDoc = {
        name: user.displayName || email.split('@')[0],
        nickname: email.split('@')[0],
        email,
        phone: '',
        profileImageBase64: '',
        bio: '',
        birthday: null,
        address: '',
        role: 'user',
        status: 'online',
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      await setDoc(ref, userDoc);
    }
  } catch (e) {
    console.warn('[auth.js] Could not read/create user doc during login:', e);
  }

  return { user, userDoc };
}

/* ════════════════════════════════════════════════════════════════
 * LOGOUT (Only happens when user clicks the logout button)
 * ════════════════════════════════════════════════════════════════ */
export async function logout() {
  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        status: 'offline',
        lastSeen: serverTimestamp()
      });
    } catch (e) {
      // Silently ignore
    }
  }
  await signOut(auth);
}

/* ════════════════════════════════════════════════════════════════
 * PASSWORD RESET
 * ════════════════════════════════════════════════════════════════ */
export async function resetPassword(email) {
  if (!email) throw new Error('Email is required.');
  await sendPasswordResetEmail(auth, email);
}

/* ════════════════════════════════════════════════════════════════
 * AUTH STATE
 * ════════════════════════════════════════════════════════════════ */
export function getAuthState(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (registrationInProgress) return;
    callback(user);
  });
}

/* ════════════════════════════════════════════════════════════════
 * PAGE GUARDS (With 1-Second Delay to prevent auto-logout)
 * ════════════════════════════════════════════════════════════════ */

export function requireAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (registrationInProgress) return;
    
    if (!user) {
      // Wait 1 second to check if it's just a page transition
      setTimeout(() => {
        if (!auth.currentUser) {
          location.replace('login.html');
        }
      }, 1000);
      return;
    }
    
    bindStatusTracking();
    try { 
      if (typeof callback === 'function') await callback(user); 
    } catch (err) {
      console.error('[auth.js] requireAuth callback error:', err);
    }
  });
}

export function requireAdminAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (registrationInProgress) return;
    
    if (!user) {
      setTimeout(() => {
        if (!auth.currentUser) location.replace('index.html');
      }, 1000);
      return;
    }

    let userDoc = null;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) userDoc = { id: snap.id, ...snap.data() };
    } catch (err) {
      console.error('[auth.js] admin role lookup failed:', err);
    }

    // If not admin, redirect to dashboard. Do NOT log them out.
    if (!userDoc || userDoc.role !== 'admin') {
      setTimeout(() => {
        // Only redirect if they are still logged in (to avoid double redirects)
        if (auth.currentUser) location.replace('../dashboard.html');
      }, 500);
      return;
    }
    
    bindStatusTracking();
    try { 
      if (typeof callback === 'function') await callback(user, userDoc); 
    } catch (err) {
      console.error('[auth.js] requireAdminAuth callback error:', err);
    }
  });
}

/* ════════════════════════════════════════════════════════════════
 * ONLINE / OFFLINE STATUS TRACKING
 * ════════════════════════════════════════════════════════════════ */
let statusBound = false;
function bindStatusTracking() {
  if (statusBound) return;
  statusBound = true;
  const setOnline = () => setStatus('online');
  const setOffline = () => setStatus('offline');
  
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOffline);
  window.addEventListener('beforeunload', setOffline);
  
  document.addEventListener('visibilitychange', () => {
    document.visibilityState === 'visible' ? setOnline() : setOffline();
  });
  
  setInterval(() => { 
    if (auth.currentUser && document.visibilityState === 'visible') setStatus('online'); 
  }, 120000);
  
  if (auth.currentUser) setStatus('online');
}

async function setStatus(status) {
  const user = auth.currentUser;
  if (!user) return;
  try { 
    await updateDoc(doc(db, 'users', user.uid), { status, lastSeen: serverTimestamp() }); 
  } catch {}
}

/* ════════════════════════════════════════════════════════════════
 * HELPERS
 * ════════════════════════════════════════════════════════════════ */
export function currentAuthUser() {
  return auth.currentUser;
}

export function consumeRedirect() {
  try {
    const url = sessionStorage.getItem('ted_redirect');
    if (url) sessionStorage.removeItem('ted_redirect');
    return url;
  } catch {
    return null;
  }
}