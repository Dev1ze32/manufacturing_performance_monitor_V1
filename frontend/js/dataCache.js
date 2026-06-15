import { api, checkApiHealth } from './api.js';

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

export function getCache() {
  return cache;
}

export async function refreshDataCache() {
  const [
    actualCosts,
    obTargets,
    monthlyRunrate,
    weeklyRunrate,
    manhours,
    months,
    costRows,
    productionRows,
    runrateSummary,
    manhoursSummary,
    obActual
  ] = await Promise.all([
    api.get('/actual-costs?limit=500'),
    api.get('/ob-targets?limit=500'),
    api.get('/runrate/monthly?limit=1000'),
    api.get('/runrate/weekly?limit=2000'),
    api.get('/manhours?limit=1000'),
    api.get('/months'),
    api.get('/dashboard/cost?limit=500'),
    api.get('/dashboard/production'),
    api.get('/dashboard/runrate-summary'),
    api.get('/dashboard/manhours-summary'),
    api.get('/dashboard/ob-actual')
  ]);

  cache.actualCosts = actualCosts || [];
  cache.obTargets = obTargets || [];
  cache.monthlyRunrate = monthlyRunrate || [];
  cache.weeklyRunrate = weeklyRunrate || [];
  cache.manhours = manhours || [];
  cache.months = months || [];
  cache.costRows = costRows || [];
  cache.productionRows = productionRows || [];
  cache.runrateSummary = runrateSummary || [];
  cache.manhoursSummary = manhoursSummary || [];
  cache.obActual = obActual || [];
}

export async function initDB() {
  await checkApiHealth();
  await refreshDataCache();
}
