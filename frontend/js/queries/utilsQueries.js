import { getCache } from '../dataCache.js';

function distinctMonths(rows) {
  return rows.map(row => ({ month: row.month }));
}

export function getAllDistinctMonthRows() {
  return getCache().months.map(month => ({ month }));
}

export function getCostDistinctMonthRows() {
  return distinctMonths(getCache().actualCosts);
}

export function getRunrateManhoursDistinctMonthRows() {
  const months = new Set([
    ...getCache().runrateSummary.map(row => row.month),
    ...getCache().manhoursSummary.map(row => row.month)
  ]);
  return [...months].sort().map(month => ({ month }));
}

export function getBudgetDistinctMonthRows() {
  const months = new Set([
    ...getCache().obTargets.map(row => row.month),
    ...getCache().actualCosts.map(row => row.month)
  ]);
  return [...months].sort().map(month => ({ month }));
}

export function getManhoursSummaryRows(month = '') {
  return month
    ? getCache().manhoursSummary.filter(row => row.month === month)
    : getCache().manhoursSummary;
}

export function getRunrateSummaryRows(month = '') {
  return month
    ? getCache().runrateSummary.filter(row => row.month === month)
    : getCache().runrateSummary;
}

export function getLatestUtilitiesRecord(month) {
  const rows = getCache().actualCosts;
  const match = month
    ? rows.find(row => row.month === month)
    : rows[0];
  if (!match) return {};
  return {
    month: match.month,
    utility_cost: match.utility_cost,
    rm_cost: match.rm_cost
  };
}

export function getLatestProductionRecord(month) {
  const rows = getCache().actualCosts.filter(row => row.volume != null);
  const match = month
    ? rows.find(row => row.month === month)
    : rows[0];
  if (!match) return {};
  return {
    month: match.month,
    volume: match.volume
  };
}
