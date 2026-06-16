import { login } from './auth.js';
import { showToast } from './utils.js';

let loginSubmitting = false;

export function renderLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (!screen) return;

  screen.innerHTML = `
    <div class="login-split">
      <!-- Left Side: Brand Identity -->
      <div class="login-left">
        <div class="login-brand-content">
          <div class="brand-logo-group">
            <span class="brand-pioneer">Pioneer</span>
            <span class="brand-inc">Adhesives, Inc.</span>
          </div>
          <h1 class="brand-title">Performance Monitor</h1>
          <p class="brand-subtitle">Advanced manufacturing performance dashboards, loss analysis, and real-time reporting system.</p>
        </div>
      </div>
      
      <!-- Right Side: Login Form -->
      <div class="login-right">
        <div class="login-card">
          <div class="login-card-head">
            <div class="mobile-brand-logo-group">
               <span class="brand-pioneer">Pioneer</span>
               <span class="brand-inc">Adhesives, Inc.</span>
            </div>
            <h1>Welcome back</h1>
            <p>Enter your credentials to access the system.</p>
          </div>
          <form id="login-form" class="login-form" novalidate>
            <div class="form-group">
              <label for="login-username">Username</label>
              <input id="login-username" name="username" type="text" autocomplete="username" required placeholder="macky">
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">
            </div>
            <p id="login-error" class="login-error" role="alert" hidden></p>
            <button type="submit" class="btn btn-primary login-submit" id="login-submit">
              <span>Sign In</span>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"></path></svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  form?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('login-username')?.focus();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (loginSubmitting) return;

  const username = document.getElementById('login-username')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  if (!username || !password) {
    showLoginError(errorEl, 'Please enter your username and password.');
    return;
  }

  loginSubmitting = true;
  if (errorEl) errorEl.hidden = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
  }

  try {
    const user = await login(username, password);
    showToast(`Welcome back, ${user.username}.`, 'success');
    window.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
  } catch (error) {
    showLoginError(errorEl, error.message || 'Could not sign in.');
  } finally {
    loginSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  }
}

function showLoginError(errorEl, message) {
  if (!errorEl) {
    showToast(message, 'error');
    return;
  }
  errorEl.textContent = message;
  errorEl.hidden = false;
}

export function showLoginScreen() {
  document.getElementById('login-screen')?.style.setProperty('display', '');
  document.getElementById('app-shell')?.style.setProperty('display', 'none');
  document.getElementById('sidebarToggle')?.style.setProperty('display', 'none');
  document.body.classList.remove('sidebar-open');
  renderLoginScreen();
}

export function hideLoginScreen() {
  document.getElementById('login-screen')?.style.setProperty('display', 'none');
  document.getElementById('app-shell')?.style.setProperty('display', '');
}
