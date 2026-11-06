/**
 * The Eternal Dread — Admin UI Module
 * ───────────────────────────────────────────────────────────────
 * Shared admin-panel UI helpers used across all 8 admin pages:
 *   • initAdminUI()  — sidebar toggle, overlay, ESC, page title
 *   • showToast()    — re-exported from main.js for convenience
 *   • initAdminSidebar() — mobile sidebar with hamburger + overlay
 *   • bindAdminLogout()  — attaches logout to #logoutBtn if present
 *   • renderAdminAvatar() — paints the top-right avatar
 *   • confirmDialog()     — reusable destructive-action dialog
 *   • refreshAdminStats() — helper for dashboard refresh
 *
 * No Firestore writes here — those live in app.js.
 */

import { showToast } from './main.js';
import { logout } from './auth.js';
import { getUserDoc } from './app.js';

/* ════════════════════════════════════════════════════════════════
 * RE-EXPORT for convenience
 * ════════════════════════════════════════════════════════════════ */
export { showToast };

/* ════════════════════════════════════════════════════════════════
 * INIT — called once per admin page
 * ════════════════════════════════════════════════════════════════ */

let adminInitialized = false;

export function initAdminUI() {
  if (adminInitialized) return;
  adminInitialized = true;

  // Spinner + shared styles (injected once)
  if (!document.getElementById('adminSharedStyles')) {
    const s = document.createElement('style');
    s.id = 'adminSharedStyles';
    s.textContent = `
      @keyframes adminSpin { to { transform: rotate(360deg); } }
      .admin-spinner {
        display:inline-block;
        width:14px; height:14px;
        border:2px solid currentColor;
        border-top-color: transparent;
        border-radius:50%;
        animation: adminSpin .7s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }
    `;
    document.head.appendChild(s);
  }

  // Wire up mobile sidebar
  initAdminSidebar();

  // Global Escape handler
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
    });
    document.body.style.overflow = '';
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
}

/* ════════════════════════════════════════════════════════════════
 * MOBILE SIDEBAR
 * ════════════════════════════════════════════════════════════════ */

export function initAdminSidebar() {
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

  // Auto-close when navigating
  sidebar.querySelectorAll('.nav-item, a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 760) close();
    });
  });

  // Auto-close on desktop resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 760 && sidebar.classList.contains('open')) close();
  });
}

/* ════════════════════════════════════════════════════════════════
 * ADMIN AVATAR
 * ════════════════════════════════════════════════════════════════ */

/**
 * Render the top-right admin avatar from a userDoc.
 * @param {Object} userDoc — { name, profileImageBase64 }
 * @param {string} [containerId='adminAvatar']
 */
export function renderAdminAvatar(userDoc, containerId = 'adminAvatar') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const name = (userDoc && userDoc.name) || 'Admin';
  const photo = (userDoc && userDoc.profileImageBase64) || '';
  if (photo) {
    el.innerHTML = `<img src="${photo}" alt="Admin" />`;
  } else {
    el.innerHTML = `<span>${escapeLetter(name)}</span>`;
  }
}

function escapeLetter(name) {
  const c = (name || 'A').charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : 'A';
}

/* ════════════════════════════════════════════════════════════════
 * LOGOUT
 * ════════════════════════════════════════════════════════════════ */

/**
 * Binds a logout handler to a button, with confirm.
 * @param {string} [btnId='logoutBtn']
 */
export function bindAdminLogout(btnId = 'logoutBtn') {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Log out of admin?',
      text: 'You will need to sign in again to access the admin panel.',
      okText: 'Log Out'
    });
    if (!confirmed) return;

    try {
      await logout();
      location.href = 'index.html';
    } catch (err) {
      console.error('[admin.js] logout failed:', err);
      showToast('Could not log out.', 'error');
    }
  });
}

/* ════════════════════════════════════════════════════════════════
 * CONFIRM DIALOG
 * ════════════════════════════════════════════════════════════════ */

/**
 * Show a confirm dialog. Uses an existing modal if `modalId` is provided,
 * otherwise creates a lightweight one on the fly.
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.text
 * @param {string} [opts.okText='Confirm']
 * @param {string} [opts.cancelText='Cancel']
 * @param {string} [opts.modalId]   Existing modal overlay id to use
 *
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title = 'Are you sure?',
  text = 'This action cannot be undone.',
  okText = 'Confirm',
  cancelText = 'Cancel',
  modalId = null
} = {}) {
  return new Promise((resolve) => {
    let modal = null;
    let created = false;

    if (modalId) {
      modal = document.getElementById(modalId);
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'adminConfirmModal_' + Math.random().toString(36).slice(2, 8);
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="modal" style="max-width:420px">
          <h3 style="color:#991b1b;margin-bottom:6px;font-family:'Playfair Display',Georgia,serif;font-size:1.2rem;font-weight:700;letter-spacing:-.3px">${escapeHtml(title)}</h3>
          <p style="font-size:.86rem;color:#64748b;line-height:1.6;margin-bottom:18px">${escapeHtml(text)}</p>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" class="btn-modal" data-cancel style="padding:10px 18px;border-radius:11px;font-weight:600;font-size:.82rem;cursor:pointer;border:1px solid #e5e9f0;background:#fff;color:#0b1220;transition:all .2s">${escapeHtml(cancelText)}</button>
            <button type="button" class="btn-modal" data-ok style="padding:10px 18px;border-radius:11px;font-weight:600;font-size:.82rem;cursor:pointer;border:1px solid transparent;background:linear-gradient(180deg,#991b1b,#7f1d1d);color:#fff;transition:all .2s">${escapeHtml(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      created = true;
    } else {
      // If using an existing modal, populate text
      const t = modal.querySelector('h3');
      const p = modal.querySelector('p');
      const okBtn = modal.querySelector('#confirmOk');
      const cancelBtn = modal.querySelector('#confirmCancel');
      if (t) t.textContent = title;
      if (p) p.textContent = text;
      if (okBtn) okBtn.textContent = okText;
      if (cancelBtn) cancelBtn.textContent = cancelText;
    }

    const okBtn = modal.querySelector('[data-ok], #confirmOk');
    const cancelBtn = modal.querySelector('[data-cancel], #confirmCancel');

    const cleanup = () => {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      if (created) setTimeout(() => modal.remove(), 200);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === modal) onCancel(); };
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEsc);
        onCancel();
      }
    };

    if (okBtn) okBtn.addEventListener('click', onOk, { once: true });
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel, { once: true });
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEsc);

    // Show
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
}

/* ════════════════════════════════════════════════════════════════
 * ADMIN STAT HELPERS (convenience)
 * ════════════════════════════════════════════════════════════════ */

/**
 * Animate a numeric value inside an element from 0 → target.
 * @param {HTMLElement|string} elOrId
 * @param {number} target
 * @param {number} [duration=700]
 */
export function animateCounter(elOrId, target, duration = 700) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  const t0 = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ════════════════════════════════════════════════════════════════
 * SMALL HELPERS
 * ════════════════════════════════════════════════════════════════ */

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fetch admin user doc (helper for pages that need it after guard).
 * Returns null on failure.
 */
export async function fetchAdminDoc(uid) {
  try {
    return await getUserDoc(uid);
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════
 * DEBUG (optional)
 * ════════════════════════════════════════════════════════════════ */
if (typeof window !== 'undefined') {
  window.TED_ADMIN = {
    initAdminUI, showToast, initAdminSidebar,
    renderAdminAvatar, bindAdminLogout,
    confirmDialog, animateCounter, fetchAdminDoc
  };
}