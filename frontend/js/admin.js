import {
  deleteUser,
  formatRoleLabel,
  getCurrentUser,
  listUsers,
  registerUser,
  setUserActive,
  updateUser,
  updateUserRole
} from './auth.js';
import { showToast } from './utils.js';

const ROLE_OPTIONS = [
  { value: 'user', label: 'User — dashboard only' },
  { value: 'superuser', label: 'Super User — dashboard + data entry' },
  { value: 'admin', label: 'Admin — full access' }
];

function rolePillClass(role) {
  if (role === 'admin') return 'pill-purple';
  if (role === 'superuser') return 'pill-blue';
  return 'pill-gray';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderAdminPanel(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Admin Panel</h1>
      <p>Create accounts and manage user access across the system.</p>
    </div>
    <div class="admin-layout">
      <section class="card admin-create-card">
        <div class="records-header">
          <div>
            <div class="card-title">Create account</div>
            <div class="card-subtitle">Only admins can register new users.</div>
          </div>
        </div>
        <form id="admin-register-form" class="form-grid admin-register-form">
          <div class="form-group">
            <label for="admin-new-username">Username</label>
            <input id="admin-new-username" type="text" autocomplete="off" required minlength="3" maxlength="64" placeholder="e.g. jsmith">
            <span class="form-hint">At least 3 characters.</span>
          </div>
          <div class="form-group">
            <label for="admin-new-password">Password</label>
            <input id="admin-new-password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="Minimum 8 characters">
          </div>
          <div class="form-group">
            <label for="admin-new-role">Role</label>
            <select id="admin-new-role">
              ${ROLE_OPTIONS.map(opt => `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group admin-register-actions">
            <label>&nbsp;</label>
            <button type="submit" class="btn btn-primary" id="admin-register-btn">Create account</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="records-header">
          <div>
            <div class="card-title">User accounts</div>
            <div class="card-subtitle">Change roles, enable or disable access, or remove accounts.</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="admin-refresh-btn">Refresh</button>
        </div>
        <div id="admin-users-table" class="loading">Loading users…</div>
      </section>
    </div>
  `;

  document.getElementById('admin-register-form')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('admin-refresh-btn')?.addEventListener('click', refreshUsersTable);
  await refreshUsersTable();
}

async function refreshUsersTable() {
  const tableHost = document.getElementById('admin-users-table');
  if (!tableHost) return;

  tableHost.innerHTML = '<div class="loading">Loading users…</div>';

  try {
    const users = await listUsers();
    renderUsersTable(tableHost, users);
  } catch (error) {
    tableHost.innerHTML = `<div class="empty"><p>Could not load users.</p><p class="empty-hint">${escapeHtml(error.message)}</p></div>`;
  }
}

function renderUsersTable(host, users) {
  const me = getCurrentUser();

  if (!users.length) {
    host.innerHTML = '<div class="empty"><p>No users found.</p></div>';
    return;
  }

  host.innerHTML = `
    <div class="table-wrap">
      <table class="admin-users-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => renderUserRow(user, me)).join('')}
        </tbody>
      </table>
    </div>
  `;

  host.querySelectorAll('[data-action="role"]').forEach(select => {
    select.addEventListener('change', () => handleUserAction('role', select));
  });

  host.querySelectorAll('[data-action]:not([data-action="role"])').forEach(button => {
    button.addEventListener('click', () => handleUserAction(button.dataset.action, button));
  });
}

function renderUserRow(user, me) {
  const isSelf = me?.id === user.id;
  const isOtherAdmin = user.role === 'admin' && !isSelf;
  const statusPill = user.is_active
    ? '<span class="pill pill-green">Active</span>'
    : '<span class="pill pill-red">Disabled</span>';

  const roleSelect = isOtherAdmin
    ? `<span class="pill ${rolePillClass(user.role)}">${escapeHtml(formatRoleLabel(user.role))}</span>`
    : `<select class="admin-role-select" data-user-id="${user.id}" data-action="role" ${isSelf ? 'disabled' : ''}>
        ${ROLE_OPTIONS.map(opt => `<option value="${opt.value}" ${opt.value === user.role ? 'selected' : ''}>${escapeHtml(formatRoleLabel(opt.value))}</option>`).join('')}
      </select>`;

  const actions = [];
  if (!isSelf && !isOtherAdmin) {
    actions.push(`
      <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-active" data-user-id="${user.id}" data-active="${user.is_active}">
        ${user.is_active ? 'Disable' : 'Enable'}
      </button>
    `);
    actions.push(`
      <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}">
        Edit
      </button>
    `);
    actions.push(`
      <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}">
        Delete
      </button>
    `);
  } else if (isSelf) {
    actions.push('<span class="admin-self-note">Your account</span>');
  } else {
    actions.push('<span class="admin-self-note">Protected admin</span>');
  }

  return `
    <tr>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${roleSelect}</td>
      <td>${statusPill}</td>
      <td><div class="record-actions">${actions.join('')}</div></td>
    </tr>
  `;
}

async function handleUserAction(action, element) {
  const userId = Number(element.dataset.userId);

  if (action === 'role') {
    try {
      await updateUserRole(userId, element.value);
      showToast('Role updated.', 'success');
      await refreshUsersTable();
    } catch (error) {
      showToast(error.message, 'error');
      await refreshUsersTable();
    }
    return;
  }

  if (action === 'toggle-active') {
    const nextActive = element.dataset.active !== 'true';
    const label = nextActive ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${label} this account?`)) return;
    try {
      await setUserActive(userId, nextActive);
      showToast(`Account ${nextActive ? 'enabled' : 'disabled'}.`, 'success');
      await refreshUsersTable();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (action === 'edit') {
    const currentUsername = element.dataset.username || '';
    const newUsername = prompt('New username (leave blank to keep current):', currentUsername);
    if (newUsername === null) return;
    const password = prompt('New password (leave blank to keep current):');
    if (password === null) return;

    const payload = {};
    const trimmedUsername = newUsername.trim();
    if (trimmedUsername && trimmedUsername !== currentUsername) payload.username = trimmedUsername;
    if (password) payload.password = password;
    if (!payload.username && !payload.password) return;

    try {
      await updateUser(userId, payload);
      showToast('Account updated.', 'success');
      await refreshUsersTable();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (action === 'delete') {
    const username = element.dataset.username || 'this user';
    if (!confirm(`Permanently delete ${username}? This cannot be undone.`)) return;
    try {
      await deleteUser(userId);
      showToast('Account deleted.', 'success');
      await refreshUsersTable();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();

  const username = document.getElementById('admin-new-username')?.value.trim();
  const password = document.getElementById('admin-new-password')?.value;
  const role = document.getElementById('admin-new-role')?.value || 'user';
  const submitBtn = document.getElementById('admin-register-btn');

  if (!username || !password) {
    showToast('Username and password are required.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
  }

  try {
    await registerUser(username, password, role);
    showToast(`Account "${username}" created.`, 'success');
    document.getElementById('admin-new-username').value = '';
    document.getElementById('admin-new-password').value = '';
    document.getElementById('admin-new-role').value = 'user';
    await refreshUsersTable();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  }
}
