import { initDB } from './database.js';
import { clearEntryTable, deleteRecordByMonth } from './queries/appQueries.js';
import {
  getGlobalMonth,
  getGlobalQuarter,
  setGlobalMonth,
  getFY,
  renderPeriodPicker,
  populateMonthFilter,
  showToast,
  clearForm,
  fmtMonthLabel,
  getRunrateSummaryRows,
  getManhoursSummaryRows
} from './utils.js';
import {
  canAccessPage,
  formatRoleLabel,
  getCurrentUser,
  logout,
  restoreSession,
  setUnauthorizedHandler
} from './auth.js';
import { hideLoginScreen, showLoginScreen } from './login.js';
import { renderAdminPanel } from './admin.js';
import * as Dashboards from './dashboard.js';
import * as Forms from './forms.js';
import * as Importer from './importer.js';

const DEFAULT_PAGE = 'executive';
const CURRENT_PAGE_KEY = 'mfg-monitor-current-page';

let currentPage = DEFAULT_PAGE;
let appReady = false;

function normalizePage(page) {
  return page === 'entry-production' ? 'entry-utilities' : page;
}

function getStoredPage() {
  try {
    const page = normalizePage(localStorage.getItem(CURRENT_PAGE_KEY) || DEFAULT_PAGE);
    return document.getElementById('page-' + page) ? page : DEFAULT_PAGE;
  } catch (_) {
    return DEFAULT_PAGE;
  }
}

function storeCurrentPage(page) {
  try {
    localStorage.setItem(CURRENT_PAGE_KEY, page);
  } catch (_) { /* ignore storage errors */ }
}

function setSidebarOpen(isOpen) {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebarToggle');
  if (!sidebar || !toggle) return;
  sidebar.classList.toggle('open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
}

function initResponsiveNavigation() {
  const toggle   = document.getElementById('sidebarToggle');
  const backdrop = document.getElementById('sidebarBackdrop');
  toggle?.addEventListener('click', () => setSidebarOpen(!document.body.classList.contains('sidebar-open')));
  backdrop?.addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setSidebarOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 1024) setSidebarOpen(false); });
}

function updateSidebarForRole() {
  const user = getCurrentUser();
  const dataEntrySection = document.getElementById('nav-data-entry');
  const adminSection = document.getElementById('nav-admin');
  const userBlock = document.getElementById('sidebar-user');

  if (dataEntrySection) {
    dataEntrySection.style.display = canAccessPage('import') ? '' : 'none';
  }
  if (adminSection) {
    adminSection.style.display = canAccessPage('admin') ? '' : 'none';
  }
  if (userBlock && user) {
    userBlock.innerHTML = `
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${escapeHtml(user.username)}</div>
        <div class="sidebar-user-role pill ${rolePillClass(user.role)}">${escapeHtml(formatRoleLabel(user.role))}</div>
      </div>
      <button type="button" class="sidebar-logout-btn" id="logout-btn">Sign out</button>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      logout();
      showToast('Signed out.', 'success');
    });
  }
}

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

function resolveAllowedPage(page) {
  page = normalizePage(page);
  if (!document.getElementById('page-' + page)) page = DEFAULT_PAGE;
  if (!canAccessPage(page)) page = DEFAULT_PAGE;
  return page;
}

window.navigateTo = function(page) {
  if (!appReady) return;
  page = resolveAllowedPage(page);
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('[id^="page-"]').forEach(el => el.style.display = 'none');
  document.getElementById('page-' + page).style.display = '';
  currentPage = page;
  storeCurrentPage(page);
  populateMonthFilter(page);
  if (window.innerWidth <= 1024) setSidebarOpen(false);
  renderCurrentPage();
};

window.onGlobalMonthChange = function() {
  renderCurrentPage();
};

function renderCurrentPage() {
  const month   = getGlobalMonth();
  const quarter = getGlobalQuarter();
  const container = document.getElementById('page-' + currentPage);

  const resolvedMonth = currentPage === 'manhours'
    ? resolveRunrateManhoursMonth(month)
    : month;

  switch (currentPage) {
    case 'executive':       Dashboards.renderExecutive(container, resolvedMonth); break;
    case 'cost':            Dashboards.renderCost(container, resolvedMonth); break;
    case 'production':      Dashboards.renderProduction(container, resolvedMonth); break;
    case 'manhours':        Dashboards.renderManhours(container, resolvedMonth, quarter); break;
    case 'loss':            Dashboards.renderLoss(container, resolvedMonth, quarter); break;
    case 'budget':          Dashboards.renderBudget(container, resolvedMonth); break;
    case 'import':          Importer.renderImport(container); break;
    case 'entry-utilities': Forms.renderEntryUtilities(container); break;
    case 'entry-production':Forms.renderEntryProduction(container); break;
    case 'entry-capacity':  Forms.renderEntryCapacity(container); break;
    case 'entry-manhours':  Forms.renderEntryManhours(container); break;
    case 'entry-budget':    Forms.renderEntryBudget(container); break;
    case 'admin':           renderAdminPanel(container); break;
  }
}

function resolveRunrateManhoursMonth(selectedMonth) {
  if (!selectedMonth) return '';
  const runrateMonths  = getRunrateSummaryRows('').map(r => r.month).filter(Boolean);
  const manhoursMonths = getManhoursSummaryRows('').map(r => r.month).filter(Boolean);
  const available      = [...new Set([...runrateMonths, ...manhoursMonths])].sort();
  if (!available.length || available.includes(selectedMonth)) return selectedMonth;
  const fallback = available[available.length - 1];
  setGlobalMonth(fallback);
  renderPeriodPicker(getFY(fallback), fallback, null, window._currentPickerMonths, true);
  return fallback;
}

window.deleteRecord = async function(table, month) {
  if (!confirm(`Delete record for ${fmtMonthLabel(month)}?`)) return;
  const deleted = await deleteRecordByMonth(table, month);
  if (!deleted) { showToast('Could not delete record.', 'error'); return; }
  showToast('Deleted.', 'error');
  renderCurrentPage();
};

const clearableEntryTables = new Set(['utilities','production','capacity','manhours','loss','budget']);

window.clearExistingRecords = async function(table, label) {
  if (!clearableEntryTables.has(table)) { showToast('Cannot clear this record set.', 'error'); return; }
  if (!confirm(`Clear all ${label}? This will delete every existing record in this section.`)) return;
  const cleared = await clearEntryTable(table);
  if (!cleared) { showToast(`Could not clear ${label}.`, 'error'); return; }
  populateMonthFilter(currentPage);
  showToast(`${label} cleared.`, 'error');
  renderCurrentPage();
};

window.clearForm = clearForm;

Object.entries(Forms).forEach(([name, func]) => { window[name] = func; });
Object.entries(Importer).forEach(([name, func]) => { window[name] = func; });

async function bootApp() {
  appReady = false;
  hideLoginScreen();
  updateSidebarForRole();

  const toggle = document.getElementById('sidebarToggle');
  if (toggle) toggle.style.display = '';

  try {
    await initDB();
    appReady = true;
    window.navigateTo(resolveAllowedPage(getStoredPage()));
  } catch (error) {
    console.error(error);
    showToast('Could not connect to the backend API. Start it with: uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000', 'error');
  }
}

function showUnauthenticatedState() {
  appReady = false;
  showLoginScreen();
}

async function initAuthFlow() {
  setUnauthorizedHandler(showUnauthenticatedState);

  try {
    const user = await restoreSession();
    if (user) {
      await bootApp();
      return;
    }
  } catch (_) {
    /* invalid token — show login */
  }

  showUnauthenticatedState();
}

window.addEventListener('DOMContentLoaded', () => {
  initResponsiveNavigation();
  initAuthFlow();
});

window.addEventListener('auth:login', () => {
  bootApp();
});
