/**
 * The Eternal Dread — Main Application Logic (CLEAN FINAL)
 */

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, onSnapshot,
  increment, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db, cloudinaryConfig, CLOUDINARY_UPLOAD_URL } from './firebase.js';

const USERS = 'users';
const POSTS = 'posts';
const COMMENTS = 'comments';
const MESSAGES = 'messages';
const EVENTS = 'events';
const NOTIFICATIONS = 'notifications';
const REPORTS = 'reports';

/* ════════════════════════════════════════════════════════════════
 * HELPERS
 * ════════════════════════════════════════════════════════════════ */
function snapToDoc(snap) { return snap.exists() ? { id: snap.id, ...snap.data() } : null; }
function docsToArray(snap) { return snap.docs.map(d => ({ id: d.id, ...d.data() })); }

/* ════════════════════════════════════════════════════════════════
 * CLOUDINARY IMAGE UPLOAD
 * ════════════════════════════════════════════════════════════════ */
export async function uploadImage(file, opts = {}) {
  if (!file) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image is too large (max 10 MB).');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);
  if (opts.folder || cloudinaryConfig.folder) formData.append('folder', opts.folder || cloudinaryConfig.folder);

  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch {}
    throw new Error(detail || 'Image upload failed.');
  }
  const data = await res.json();
  return data.secure_url;
}

export async function uploadProfileImage(file) {
  return uploadImage(file, { folder: 'the-eternal-dread/profiles' });
}

export async function uploadPostImage(file) {
  return uploadImage(file, { folder: 'the-eternal-dread/posts' });
}

/* ════════════════════════════════════════════════════════════════
 * LOCALSTORAGE HELPERS
 * ════════════════════════════════════════════════════════════════ */
export const localStore = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
};

/* ════════════════════════════════════════════════════════════════
 * USERS
 * ════════════════════════════════════════════════════════════════ */
export async function getUserDoc(uid) {
  if (!uid) return null;
  return snapToDoc(await getDoc(doc(db, USERS, uid)));
}

export async function updateUserProfile(uid, patch) {
  const clean = { ...patch }; delete clean.role; delete clean.createdAt;
  await updateDoc(doc(db, USERS, uid), clean);
}

export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, USERS, uid), { role });
}

export async function deleteUserRecord(uid) {
  await deleteDoc(doc(db, USERS, uid));
}

export async function getAllMembers({ excludeUid = null } = {}) {
  let list = docsToArray(await getDocs(collection(db, USERS)));
  if (excludeUid) list = list.filter(u => u.id !== excludeUid);
  return list;
}

export function listenToAllMembers({ excludeUid = null } = {}, callback) {
  return onSnapshot(collection(db, USERS), (snap) => {
    let list = docsToArray(snap);
    if (excludeUid) list = list.filter(u => u.id !== excludeUid);
    callback(list);
  });
}

export async function getFriends(uid, { limit: lim = 100 } = {}) {
  const all = await getAllMembers({ excludeUid: uid });
  all.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  return all.slice(0, lim);
}

export function listenToUserDoc(uid, callback) {
  return onSnapshot(doc(db, USERS, uid), (snap) => callback(snapToDoc(snap)));
}

/* ════════════════════════════════════════════════════════════════
 * POSTS
 * ════════════════════════════════════════════════════════════════ */
async function enrichPost(post, currentUserId) {
  if (!post) return post;
  let author = null;
  try { author = await getUserDoc(post.userId); } catch { /* noop */ }
  return {
    ...post,
    author: author ? { 
      name: author.name || 'Member', 
      nickname: author.nickname || '', 
      profileImageBase64: author.profileImageBase64 || '' 
    } : { name: 'Member', profileImageBase64: '' },
    likedByCurrentUser: currentUserId ? (post.likedBy || []).includes(currentUserId) : false
  };
}

export async function getFeed({ limit: lim = 8, startAfter: cursor = null, userId = null, countOnly = false } = {}) {
  let q;
  if (userId) {
    if (countOnly) return (await getDocs(query(collection(db, POSTS), where('userId', '==', userId)))).size;
    q = query(collection(db, POSTS), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(lim));
  } else {
    if (countOnly) return (await getDocs(collection(db, POSTS))).size;
    q = query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(lim));
  }
  if (cursor) q = query(q, startAfter(cursor));
  
  const snap = await getDocs(q);
  const me = auth.currentUser ? auth.currentUser.uid : null;
  return { 
    posts: await Promise.all(docsToArray(snap).map(p => enrichPost(p, me))), 
    lastDoc: snap.docs[snap.docs.length - 1] || null 
  };
}

export async function getRecentPosts(opts = {}) { 
  return getFeed(opts); 
}

export function listenToFeed({ limit: lim = 8 } = {}, callback) {
  return onSnapshot(query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(lim)), async (snap) => {
    const me = auth.currentUser ? auth.currentUser.uid : null;
    callback(await Promise.all(docsToArray(snap).map(p => enrichPost(p, me))));
  });
}

export async function createPost({ userId, text = '', imageBase64 = '' }) {
  return (await addDoc(collection(db, POSTS), { 
    userId, 
    text: text.slice(0, 5000), 
    imageBase64, 
    likesCount: 0, 
    commentsCount: 0, 
    likedBy: [], 
    createdAt: serverTimestamp() 
  })).id;
}

export async function updatePost(postId, patch) {
  const clean = { ...patch }; 
  delete clean.userId; delete clean.createdAt; delete clean.likesCount; delete clean.commentsCount; delete clean.likedBy;
  await updateDoc(doc(db, POSTS, postId), clean);
}

export async function deletePost(postId) {
  try { 
    (await getDocs(query(collection(db, COMMENTS), where('postId', '==', postId)))).docs.forEach(d => deleteDoc(d.ref)); 
  } catch { /* ignore */ }
  await deleteDoc(doc(db, POSTS, postId));
}

export async function toggleLike(postId, uid) {
  const ref = doc(db, POSTS, postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Post not found.');
  const data = snap.data();
  const liked = (data.likedBy || []).includes(uid);
  await updateDoc(ref, { likedBy: liked ? arrayRemove(uid) : arrayUnion(uid), likesCount: increment(liked ? -1 : 1) });
  return { liked: !liked, count: Math.max(0, (data.likesCount || 0) + (liked ? -1 : 1)) };
}

export async function getUserPostsCount(uid) { 
  return (await getDocs(query(collection(db, POSTS), where('userId', '==', uid)))).size; 
}

export async function getUserLikesCount(uid) {
  let total = 0; 
  (await getDocs(query(collection(db, POSTS), where('userId', '==', uid)))).docs.forEach(d => { total += (d.data().likesCount || 0); });
  return total;
}

/* ════════════════════════════════════════════════════════════════
 * COMMENTS
 * ════════════════════════════════════════════════════════════════ */
async function enrichComment(c) {
  let author = null;
  try { author = await getUserDoc(c.userId); } catch { /* noop */ }
  return { 
    ...c, 
    author: author ? { name: author.name || 'Member', profileImageBase64: author.profileImageBase64 || '' } : { name: 'Member', profileImageBase64: '' } 
  };
}

export async function getComments(postId) {
  const snap = await getDocs(query(collection(db, COMMENTS), where('postId', '==', postId), orderBy('createdAt', 'asc')));
  return Promise.all(docsToArray(snap).map(enrichComment));
}

export function listenToComments(postId, callback) {
  return onSnapshot(query(collection(db, COMMENTS), where('postId', '==', postId), orderBy('createdAt', 'asc')), async (snap) => {
    callback(await Promise.all(docsToArray(snap).map(enrichComment)));
  });
}

export async function addComment(postId, { userId, text }) {
  await addDoc(collection(db, COMMENTS), { postId, userId, text: text.slice(0, 2000), createdAt: serverTimestamp() });
  try { await updateDoc(doc(db, POSTS, postId), { commentsCount: increment(1) }); } catch { /* ignore */ }
}

export async function deleteComment(commentId) {
  const ref = doc(db, COMMENTS, commentId);
  const snap = await getDoc(ref);
  const postId = snap.exists() ? snap.data().postId : null;
  await deleteDoc(ref);
  if (postId) { try { await updateDoc(doc(db, POSTS, postId), { commentsCount: increment(-1) }); } catch { /* ignore */ } }
}

export async function getUserCommentsCount(uid) { 
  return (await getDocs(query(collection(db, COMMENTS), where('userId', '==', uid)))).size; 
}

/* ════════════════════════════════════════════════════════════════
 * MESSAGES
 * ════════════════════════════════════════════════════════════════ */
export async function sendMessage({ senderId, receiverId, text, type = 'text' }) {
  return (await addDoc(collection(db, MESSAGES), { senderId, receiverId, text: text.slice(0, 2000), type, createdAt: serverTimestamp() })).id;
}

export function listenToConversation(uidA, uidB, callback) {
  const combined = new Map();
  const emit = () => {
    const arr = Array.from(combined.values());
    arr.sort((a, b) => (a.createdAt?.toDate()?.getTime() || 0) - (b.createdAt?.toDate()?.getTime() || 0));
    callback(arr);
  };
  const apply = (snap) => {
    snap.docChanges().forEach(change => {
      const m = { id: change.doc.id, ...change.doc.data() };
      if (m.receiverId !== 'group' && !((m.senderId === uidA && m.receiverId === uidB) || (m.senderId === uidB && m.receiverId === uidA))) return;
      if (change.type === 'removed') combined.delete(m.id); else combined.set(m.id, m);
    });
    emit();
  };
  const u1 = onSnapshot(query(collection(db, MESSAGES), where('senderId', 'in', [uidA, uidB])), apply);
  const u2 = onSnapshot(query(collection(db, MESSAGES), where('receiverId', 'in', [uidA, uidB])), apply);
  return () => { u1(); u2(); };
}

export async function markConversationAsRead(uid, peerUid) {
  try {
    (await getDocs(query(collection(db, NOTIFICATIONS), where('userId', '==', uid), where('type', '==', 'message'), where('from', '==', peerUid), where('read', '==', false)))).docs.forEach(d => updateDoc(d.ref, { read: true }));
  } catch { /* ignore */ }
}

export async function getUnreadCounts(uid) {
  const map = {};
  try { 
    (await getDocs(query(collection(db, NOTIFICATIONS), where('userId', '==', uid), where('read', '==', false)))).docs.forEach(d => { 
      const n = d.data(); if (n.type === 'message' && n.from) map[n.from] = (map[n.from] || 0) + 1; 
    }); 
  } catch { /* ignore */ }
  return map;
}

export async function getUserMessagesCount(uid) { 
  return (await getDocs(query(collection(db, MESSAGES), where('senderId', '==', uid)))).size; 
}

/* ════════════════════════════════════════════════════════════════
 * EVENTS
 * ════════════════════════════════════════════════════════════════ */
export async function getEvents() { 
  return docsToArray(await getDocs(query(collection(db, EVENTS), orderBy('date', 'asc')))); 
}

export async function getAllEventsAdmin() { 
  return getEvents(); 
}

export async function getUpcomingEvents(lim = 4) {
  return (await getEvents()).filter(e => (e.date?.toDate ? e.date.toDate() : new Date(e.date)) >= new Date()).slice(0, lim);
}

export function listenToEvents(callback) {
  return onSnapshot(query(collection(db, EVENTS), orderBy('date', 'asc')), snap => callback(docsToArray(snap)));
}

export async function createEvent(payload) {
  return (await addDoc(collection(db, EVENTS), { 
    title: payload.title, 
    description: payload.description || '', 
    date: payload.date, 
    time: payload.time, 
    location: payload.location || '', 
    createdBy: payload.createdBy, 
    createdAt: serverTimestamp() 
  })).id;
}

export async function updateEvent(eventId, patch) {
  const clean = { ...patch }; delete clean.createdBy; delete clean.createdAt;
  await updateDoc(doc(db, EVENTS, eventId), clean);
}

export async function deleteEvent(eventId) { 
  await deleteDoc(doc(db, EVENTS, eventId)); 
}

/* ════════════════════════════════════════════════════════════════
 * NOTIFICATIONS
 * ════════════════════════════════════════════════════════════════ */
export async function addNotification(userId, { title, message, type = 'general', from = null }) {
  await addDoc(collection(db, NOTIFICATIONS), { 
    userId, 
    title, 
    message, 
    type, 
    from: from || auth.currentUser?.uid || null, 
    read: false, 
    createdAt: serverTimestamp() 
  });
}

export async function getNotifications(uid, { limit: lim = 20 } = {}) {
  return docsToArray(await getDocs(query(collection(db, NOTIFICATIONS), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(lim))));
}

export async function getUnreadNotificationCount(uid) {
  return (await getDocs(query(collection(db, NOTIFICATIONS), where('userId', '==', uid), where('read', '==', false)))).size;
}

export function listenToNotifications(uid, callback) {
  return onSnapshot(query(collection(db, NOTIFICATIONS), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(20)), snap => callback(docsToArray(snap)));
}

/* ════════════════════════════════════════════════════════════════
 * REPORTS
 * ════════════════════════════════════════════════════════════════ */
export async function createReport({ reporterId, targetType, targetId, reason }) {
  await addDoc(collection(db, REPORTS), { reporterId, targetType, targetId, reason: reason || '', status: 'open', createdAt: serverTimestamp() });
}

export async function getAllReportsAdmin() { 
  return docsToArray(await getDocs(query(collection(db, REPORTS), orderBy('createdAt', 'desc')))); 
}

export async function updateReportStatus(reportId, status) { 
  await updateDoc(doc(db, REPORTS, reportId), { status }); 
}

/* ════════════════════════════════════════════════════════════════
 * ADMIN COMPOSITE
 * ════════════════════════════════════════════════════════════════ */
export async function getAllPostsAdmin() {
  const raw = docsToArray(await getDocs(query(collection(db, POSTS), orderBy('createdAt', 'desc'))));
  return Promise.all(raw.map(p => enrichPost(p, null)));
}

export async function getAllCommentsAdmin() {
  const raw = docsToArray(await getDocs(query(collection(db, COMMENTS), orderBy('createdAt', 'desc'))));
  return Promise.all(raw.map(enrichComment));
}

/* ════════════════════════════════════════════════════════════════
 * DEBUG / OPTIONAL WINDOW BINDING
 * ════════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  window.TED_APP = {
    getUserDoc, updateUserProfile, updateUserRole, deleteUserRecord,
    getAllMembers, listenToAllMembers, getFriends, listenToUserDoc,
    getFeed, getRecentPosts, listenToFeed, createPost, updatePost, deletePost, toggleLike,
    getUserPostsCount, getUserLikesCount,
    getComments, listenToComments, addComment, deleteComment, getUserCommentsCount,
    sendMessage, listenToConversation, markConversationAsRead, getUnreadCounts, getUserMessagesCount,
    getEvents, getAllEventsAdmin, getUpcomingEvents, listenToEvents, createEvent, updateEvent, deleteEvent,
    addNotification, getNotifications, getUnreadNotificationCount, listenToNotifications,
    createReport, getAllReportsAdmin, updateReportStatus,
    getAllPostsAdmin, getAllCommentsAdmin,
    uploadImage, uploadProfileImage, uploadPostImage,
    localStore
  };
}