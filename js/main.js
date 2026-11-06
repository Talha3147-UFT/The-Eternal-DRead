/**
 * The Eternal Dread — Common UI Utilities
 * ───────────────────────────────────────────────────────────────
 * This file handles all shared UI concerns used across pages:
 *   • Toast notifications
 *   • Modal helpers
 *   • Time / date formatting
 *   • Mobile nav / sidebar toggles
 *   • Loading indicators
 *   • Common event wiring (Escape key, outside click)
 *   • Tiny DOM helpers
 *
 * No Firestore, no Firebase imports. Pure UI.
 */

/* ════════════════════════════════════════════════════════════════
 * TOAST SYSTEM
 * ════════════════════════════════════════════════════════════════ */

let toastWrapEl = null;

function ensureToastWrap() {
  if (toastWrapEl && document.body.contains(toastWrapEl)) return toastWrapEl;
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  toastWrapEl = wrap;
  return wrap;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 3200) {
  const wrap = ensureToastWrap();
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'info' ? '' : type);
  toast.setAttribute('role', 'status');

  const icon = type === 'success'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
    : type === 'error'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `${icon}<span>${escapeHtml(String(message || ''))}</span>`;
  wrap.appendChild(toast);

  // Auto-dismiss
  const remove = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 240);
  };
  toast.addEventListener('click', remove);
  setTimeout(remove, duration);
}

/* ════════════════════════════════════════════════════════════════
 * DATE / TIME FORMATTING
 * ════════════════════════════════════════════════════════════════ */

/**
 * Human-readable time from a Firestore Timestamp, Date, or ISO string.
 * Examples: "just now", "5m ago", "3h ago", "Yesterday", "Mar 4, 2024"
 */
export function formatTime(ts) {
  if (!ts) return '';
  let date;
  try {
    date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  } catch { return ''; }
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;

  if (diff < 45) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return 'Today';

  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === yest.toDateString()) return 'Yesterday';

  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';

  return date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/** Returns "HH:MM AM/PM". */
export function formatClock(ts) {
  if (!ts) return '';
  let date;
  try {
    date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  } catch { return ''; }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Returns "Monday, March 4, 2024". */
export function formatFullDate(ts) {
  if (!ts) return '';
  let date;
  try {
    date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
  } catch { return ''; }
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

/* ════════════════════════════════════════════════════════════════
 * MOBILE SIDEBAR / NAV
 * ════════════════════════════════════════════════════════════════ */

/**
 * Wires up a mobile sidebar with hamburger + overlay.
 * Expects elements with IDs: `sidebar`, `overlay`, `hamburger`.
 */
export function initMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const hamburger = document.getElementById('hamburger');
  if (!sidebar || !hamburger) return;

  const open = () => {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
  };
  const toggle = () => sidebar.classList.contains('open') ? close() : open();

  hamburger.addEventListener('click', toggle);
  if (overlay) overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
  });

  // Auto-close on nav link click (mobile)
  sidebar.querySelectorAll('.nav-item, a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 760) close();
    });
  });

  // Auto-close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 760 && sidebar.classList.contains('open')) close();
  });
}

/* ════════════════════════════════════════════════════════════════
 * MODAL HELPERS
 * ════════════════════════════════════════════════════════════════ */

/**
 * Open a modal by element or id.
 * Adds `.open` class + locks scroll.
 * @param {HTMLElement|string} modalOrId
 */
export function openModal(modalOrId) {
  const el = typeof modalOrId === 'string'
    ? document.getElementById(modalOrId)
    : modalOrId;
  if (!el) return;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Close a modal. */
export function closeModal(modalOrId) {
  const el = typeof modalOrId === 'string'
    ? document.getElementById(modalOrId)
    : modalOrId;
  if (!el) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
}

/**
 * Wire a modal so clicking the backdrop or Escape closes it.
 * @param {string} modalId
 * @param {string[]} closeBtnIds  e.g. ['closeModalBtn', 'cancelBtn']
 */
export function bindModalDismiss(modalId, closeBtnIds = []) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });

  closeBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => closeModal(modal));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeModal(modal);
    }
  });
}

/* ════════════════════════════════════════════════════════════════
 * LOADING INDICATORS
 * ════════════════════════════════════════════════════════════════ */

/**
 * Put a button in a loading state.
 * Saves its original HTML so you can restore it later.
 * @param {HTMLButtonElement|string} btnOrId
 * @param {string} [loadingText='Loading…']
 */
export function setButtonLoading(btnOrId, loadingText = 'Loading…') {
  const btn = typeof btnOrId === 'string'
    ? document.getElementById(btnOrId)
    : btnOrId;
  if (!btn) return;
  if (!btn.dataset.originalHtml) {
    btn.dataset.originalHtml = btn.innerHTML;
  }
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:tedSpin .7s linear infinite;vertical-align:middle;margin-right:6px"></span>${escapeHtml(loadingText)}`;
}

/** Restore a loading button to its original state. */
export function clearButtonLoading(btnOrId) {
  const btn = typeof btnOrId === 'string'
    ? document.getElementById(btnOrId)
    : btnOrId;
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
    delete btn.dataset.originalHtml;
  }
}

/* ════════════════════════════════════════════════════════════════
 * SMALL DOM HELPERS
 * ════════════════════════════════════════════════════════════════ */

/** Escape user-provided strings before injecting into HTML. */
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shortcut querySelector. */
export function qs(sel, root = document) { return root.querySelector(sel); }

/** Shortcut querySelectorAll → Array. */
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** Debounce a function. */
export function debounce(fn, wait = 220) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Simple unique id generator (not cryptographic). */
export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

/* ════════════════════════════════════════════════════════════════
 * COMMON UI INIT
 * ════════════════════════════════════════════════════════════════ */

let commonInitialized = false;

/**
 * Called once per page. Sets up shared behaviours:
 *   • Injects a keyframe style for spinner (once)
 *   • Mobile sidebar (if the page has one)
 *   • Auto-dismiss notice for `[data-autohide]` elements
 *   • Global keyboard: Escape closes any open modal
 */
export function initCommonUI() {
  if (commonInitialized) return;
  commonInitialized = true;

  // 1. Spinner keyframes (injected once)
  if (!document.getElementById('tedCommonStyles')) {
    const style = document.createElement('style');
    style.id = 'tedCommonStyles';
    style.textContent = `
      @keyframes tedSpin { to { transform: rotate(360deg); } }
      .ted-hidden { display: none !important; }
      .ted-visible { display: block !important; }
    `;
    document.head.appendChild(style);
  }

  // 2. Mobile sidebar (safe if elements missing)
  initMobileSidebar();

  // 3. Global Escape handler: close any open modals
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
    });
    document.body.style.overflow = '';
  });

  // 4. Auto-hide elements marked with data-autohide
  qsa('[data-autohide]').forEach(el => {
    const delay = parseInt(el.getAttribute('data-autohide'), 10) || 3000;
    setTimeout(() => {
      el.style.transition = 'opacity .3s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, delay);
  });
}