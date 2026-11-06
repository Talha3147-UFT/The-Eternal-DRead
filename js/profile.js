/**
 * The Eternal Dread — Profile Page Logic
 * ───────────────────────────────────────────────────────────────
 * Focused helpers specific to profile.html:
 *   • Load profile view (own or other user)
 *   • Load profile statistics
 *   • Handle profile edit form submission
 *   • Handle profile image change (Base64 compress)
 *   • Live profile listener
 *
 * Firestore CRUD lives in app.js. Auth lives in auth.js.
 */

import {
  getUserDoc, updateUserProfile, getRecentPosts,
  getFriends, getUserPostsCount, getUserLikesCount, getUserCommentsCount,
  listenToUserDoc, compressImageToBase64
} from './app.js';

import { auth } from './firebase.js';

/* ════════════════════════════════════════════════════════════════
 * LOAD PROFILE
 * ════════════════════════════════════════════════════════════════ */

/**
 * Loads a profile by uid, then calls `onReady` with the result.
 * If `uid` is null, loads the current user's profile.
 *
 * @param {string|null} uid
 * @param {(data: {
 *   userDoc: Object,
 *   isSelf: boolean,
 *   stats: { posts: number, friends: number, likes: number, comments: number },
 *   recentPosts: Array
 * }) => void} onReady
 *
 * @returns {Promise<() => void>} unsubscribe function (live listener)
 */
export async function loadProfile(uid, onReady) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in.');

  const targetUid = uid || me.uid;
  const isSelf = targetUid === me.uid;

  const userDoc = await getUserDoc(targetUid);
  if (!userDoc) throw new Error('User not found.');

  // Parallel stats + recent posts
  const [posts, friends, likes, comments, recent] = await Promise.all([
    getUserPostsCount(targetUid).catch(() => 0),
    isSelf ? getFriends(targetUid).catch(() => []) : Promise.resolve([]),
    getUserLikesCount(targetUid).catch(() => 0),
    getUserCommentsCount(targetUid).catch(() => 0),
    getRecentPosts({ userId: targetUid, limit: 5 }).catch(() => ({ posts: [] }))
  ]);

  const stats = {
    posts,
    friends: Array.isArray(friends) ? friends.length : 0,
    likes,
    comments
  };

  const recentPosts = (recent && recent.posts) ? recent.posts : [];

  if (typeof onReady === 'function') {
    onReady({ userDoc, isSelf, stats, recentPosts });
  }

  // Realtime updates on own profile only
  if (isSelf) {
    const unsub = listenToUserDoc(targetUid, (updated) => {
      if (updated && typeof onReady === 'function') {
        // Fire stats + recent update too
        Promise.all([
          getUserPostsCount(targetUid).catch(() => 0),
          getUserLikesCount(targetUid).catch(() => 0),
          getUserCommentsCount(targetUid).catch(() => 0),
          getRecentPosts({ userId: targetUid, limit: 5 }).catch(() => ({ posts: [] }))
        ]).then(([p, l, c, r]) => {
          onReady({
            userDoc: updated,
            isSelf: true,
            stats: { ...stats, posts: p, likes: l, comments: c },
            recentPosts: (r && r.posts) || []
          });
        });
      }
    });
    return unsub;
  }

  return () => {};
}

/* ════════════════════════════════════════════════════════════════
 * EDIT PROFILE
 * ════════════════════════════════════════════════════════════════ */

/**
 * Save the profile edit form.
 *
 * @param {Object} payload
 * @param {string} payload.name
 * @param {string} payload.nickname
 * @param {string} [payload.bio]
 * @param {string} [payload.phone]
 * @param {string} [payload.address]
 * @param {string|Date|null} [payload.birthday]
 * @param {string} [payload.profileImageBase64]  Only include if changed
 *
 * @returns {Promise<Object>} Updated profile fields (partial)
 */
export async function saveProfile(payload) {
  const me = auth.currentUser;
  if (!me) throw new Error('Not signed in.');

  if (!payload.name || !payload.nickname) {
    throw new Error('Name and nickname are required.');
  }

  const patch = {
    name: payload.name.trim(),
    nickname: payload.nickname.trim(),
    bio: (payload.bio || '').trim(),
    phone: (payload.phone || '').trim(),
    address: (payload.address || '').trim()
  };

  // Birthday — accept Date, string, or null
  if (payload.birthday === null) {
    patch.birthday = null;
  } else if (payload.birthday instanceof Date) {
    patch.birthday = payload.birthday;
  } else if (typeof payload.birthday === 'string' && payload.birthday.trim()) {
    const d = new Date(payload.birthday);
    if (!isNaN(d.getTime())) patch.birthday = d;
  }

  // Only include image if provided (avoid wiping)
  if (payload.profileImageBase64) {
    patch.profileImageBase64 = payload.profileImageBase64;
  }

  await updateUserProfile(me.uid, patch);
  return patch;
}

/* ════════════════════════════════════════════════════════════════
 * PROFILE IMAGE HANDLING
 * ════════════════════════════════════════════════════════════════ */

/**
 * Read a File → compressed Base64 data URL (max 320×320, JPEG q=0.82).
 * Reasonable size to store inside a Firestore document.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function processProfileImage(file) {
  if (!file) throw new Error('No file.');
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image is too large (max 8 MB).');
  }
  return compressImageToBase64(file, 320, 320, 0.82);
}

/**
 * Apply a Base64 image to a preview element with graceful fallback.
 * @param {HTMLElement} previewEl
 * @param {string|null} dataUrl
 * @param {string} initial  Fallback letter when no image
 */
export function renderProfilePreview(previewEl, dataUrl, initial = '?') {
  if (!previewEl) return;
  if (dataUrl) {
    previewEl.innerHTML = `<img src="${dataUrl}" alt="Profile photo" />`;
  } else {
    previewEl.innerHTML = `<span>${escapeLetter(initial)}</span>`;
  }
}

function escapeLetter(s) {
  if (!s) return '?';
  const c = String(s).charAt(0).toUpperCase();
  if (!/[A-Z0-9]/.test(c)) return '?';
  return c;
}

/* ════════════════════════════════════════════════════════════════
 * DISPLAY HELPERS
 * ════════════════════════════════════════════════════════════════ */

/**
 * Format birthday from Firestore value.
 * Accepts Timestamp, Date, ISO string, or null.
 */
export function formatBirthday(value) {
  if (!value) return '—';
  let d;
  try {
    d = value.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
  } catch { return '—'; }
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

/** Format join date (same input types). */
export function formatJoinedDate(value) {
  if (!value) return '—';
  let d;
  try {
    d = value.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
  } catch { return '—'; }
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

/** Prepare a date string suitable for `<input type="date">`. */
export function toDateInputValue(value) {
  if (!value) return '';
  let d;
  try {
    d = value.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
  } catch { return ''; }
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Compute a display role label. */
export function roleLabel(role) {
  return role === 'admin' ? 'Administrator' : 'Member';
}