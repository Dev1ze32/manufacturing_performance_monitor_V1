const TOKEN_KEY = 'mfg-monitor-auth-token';
const USER_KEY = 'mfg-monitor-auth-user';

let currentUser = null;
let onUnauthorized = null;

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function persistSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  currentUser = user;
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  currentUser = null;
}

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function getRole() {
  return currentUser?.role || null;
}

export function isAdmin() {
  return getRole() === 'admin';
}

export function canAccessDataEntry() {
  const role = getRole();
  return role === 'superuser' || role === 'admin';
}

export function canAccessPage(page) {
  if (page === 'admin') return isAdmin();
  if (page.startsWith('entry-') || page === 'import') return canAccessDataEntry();
  return true;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function handleUnauthorized() {
  clearStoredSession();
  if (onUnauthorized) onUnauthorized();
}

export async function login(username, password) {
  const { api } = await import('./api.js');
  const result = await api.post('/auth/login', { username, password });
  const user = { id: null, username: result.username, role: result.role, is_active: true };
  persistSession(result.access_token, user);
  return await fetchMe();
}

export async function fetchMe() {
  const token = getAccessToken();
  if (!token) {
    currentUser = null;
    return null;
  }

  const { api } = await import('./api.js');
  try {
    const user = await api.get('/auth/me');
    currentUser = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch (error) {
    clearStoredSession();
    throw error;
  }
}

export function logout() {
  clearStoredSession();
  if (onUnauthorized) onUnauthorized();
}

export async function restoreSession() {
  currentUser = readStoredUser();
  const token = getAccessToken();
  if (!token) {
    currentUser = null;
    return null;
  }
  return fetchMe();
}

export async function registerUser(username, password, role = 'user') {
  const { api } = await import('./api.js');
  return api.post('/auth/register', { username, password, role });
}

export async function listUsers() {
  const { api } = await import('./api.js');
  return api.get('/auth/users');
}

export async function updateUserRole(userId, role) {
  const { api } = await import('./api.js');
  return api.patch(`/auth/users/${userId}/role`, { role });
}

export async function setUserActive(userId, isActive) {
  const { api } = await import('./api.js');
  return api.patch(`/auth/users/${userId}/active`, { is_active: isActive });
}

export async function updateUser(userId, fields) {
  const { api } = await import('./api.js');
  return api.patch(`/auth/users/${userId}`, fields);
}

export async function deleteUser(userId) {
  const { api } = await import('./api.js');
  return api.delete(`/auth/users/${userId}`);
}

export function formatRoleLabel(role) {
  const labels = {
    admin: 'Admin',
    superuser: 'Super User',
    user: 'User'
  };
  return labels[role] || role;
}
