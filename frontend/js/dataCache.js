import { api, checkApiHealth } from './api.js';
import { canAccessDataEntry } from './auth.js';

const cache = {
  actualCosts: [],
  obTargets: [],
  monthlyRunrate: [],
  weeklyRunrate: [],
  manhours: [],
  months: [],
  costRows: [],
  productionRows: [],
  runrateSummary: [],
  manhoursSummary: [],
  obActual: []
};

let refreshPromise = null;

export function getCache() {
  return cache;
}

export async function refreshDataCache() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = loadDataCache()
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function loadDataCache() {
  const dashboardRequests = [
    api.get('/months'),
    api.get('/dashboard/cost?limit=500'),
    api.get('/dashboard/production'),
    api.get('/dashboard/runrate-summary'),
    api.get('/dashboard/manhours-summary'),
    api.get('/dashboard/ob-actual')
  ];

  const entryRequests = canAccessDataEntry()
    ? [
        api.get('/actual-costs?limit=500'),
        api.get('/ob-targets?limit=500'),
        api.get('/runrate/monthly?limit=1000'),
        api.get('/runrate/weekly?limit=2000'),
        api.get('/manhours?limit=1000')
      ]
    : [null, null, null, null, null];

  const [
    months,
    costRows,
    productionRows,
    runrateSummary,
    manhoursSummary,
    obActual,
    actualCosts,
    obTargets,
    monthlyRunrate,
    weeklyRunrate,
    manhours
  ] = await Promise.all([...dashboardRequests, ...entryRequests]);

  cache.months = months || [];
  cache.costRows = costRows || [];
  cache.productionRows = productionRows || [];
  cache.runrateSummary = runrateSummary || [];
  cache.manhoursSummary = manhoursSummary || [];
  cache.obActual = obActual || [];
  cache.actualCosts = actualCosts || [];
  cache.obTargets = obTargets || [];
  cache.monthlyRunrate = monthlyRunrate || [];
  cache.weeklyRunrate = weeklyRunrate || [];
  cache.manhours = manhours || [];
}

export async function initDB() {
  await checkApiHealth();
  await refreshDataCache();
}
