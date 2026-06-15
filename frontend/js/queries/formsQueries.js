import { api } from '../api.js';
import { getCache, refreshDataCache } from '../dataCache.js';

export function getUtilityRows() {
  return getCache().actualCosts.map(row => ({
    id: null,
    month: row.month,
    utility_cost: row.utility_cost,
    rm_cost: row.rm_cost
  }));
}

export function getActualCostRows() {
  return getCache().actualCosts.slice(0, 36);
}

export async function saveUtilityRecord(month, utilityCost, rmCost) {
  return saveActualCostRecord(month, utilityCost, rmCost, null);
}

export function getProductionRows() {
  return getCache().actualCosts
    .filter(row => row.volume != null)
    .map(row => ({ id: null, month: row.month, volume: row.volume }));
}

export async function saveProductionRecord(month, volume) {
  return saveActualCostRecord(month, null, null, volume);
}

export async function saveActualCostRecord(month, utilityCost, rmCost, volume) {
  try {
    await api.post('/actual-costs', {
      month,
      utility_cost: utilityCost,
      rm_cost: rmCost,
      volume
    });
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('saveActualCostRecord() error:', error);
    return false;
  }
}

export async function deleteActualCostRecord(month) {
  try {
    await api.delete(`/actual-costs/${encodeURIComponent(month)}`);
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('deleteActualCostRecord() error:', error);
    return false;
  }
}

export async function clearActualCostRecords() {
  try {
    await api.delete('/actual-costs');
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('clearActualCostRecords() error:', error);
    return false;
  }
}

export function getCapacityRows() {
  return getCache().monthlyRunrate.slice(0, 60);
}

export function getCapacityWeeklyRows() {
  return getCache().weeklyRunrate.slice(0, 200);
}

export async function saveCapacityRecord(month, line, capacity, actualOutput, machineAvailability = null) {
  try {
    await api.post('/runrate/monthly', {
      month,
      line,
      capacity,
      actual_output: actualOutput,
      machine_availability: machineAvailability
    });
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('saveCapacityRecord() error:', error);
    return false;
  }
}

export async function saveWeeklyCapacityRecord(month, line, weekLabel, weekNum, capacity, actualOutput, machineAvailability = null) {
  try {
    await api.post('/runrate/weekly', {
      month,
      line,
      week_label: weekLabel,
      week_num: weekNum,
      capacity,
      actual_output: actualOutput,
      machine_availability: machineAvailability
    });
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('saveWeeklyCapacityRecord() error:', error);
    return false;
  }
}

export function getWeeklyCapacityById(id) {
  return getCache().weeklyRunrate.find(row => row.id === id);
}

export async function deleteCapacityRecord(month, line) {
  try {
    await api.delete(`/runrate/monthly?month=${encodeURIComponent(month)}&line=${encodeURIComponent(line)}`);
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('deleteCapacityRecord() error:', error);
    return false;
  }
}

export async function deleteWeeklyCapacityRecord(id) {
  try {
    await api.delete(`/runrate/weekly/${id}`);
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('deleteWeeklyCapacityRecord() error:', error);
    return false;
  }
}

export async function clearWeeklyCapacityRecords() {
  try {
    const weeklyRows = getCache().weeklyRunrate;
    await Promise.all(weeklyRows.map(row => api.delete(`/runrate/weekly/${row.id}`)));
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('clearWeeklyCapacityRecords() error:', error);
    return false;
  }
}

export async function clearRunrateRecords() {
  try {
    await api.delete('/runrate');
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('clearRunrateRecords() error:', error);
    return false;
  }
}

export function getManhoursRows() {
  return getCache().manhours.slice(0, 200);
}

export function getLegacyManhoursWeeklyCount() {
  return 0;
}

export function getCapacityLineRows() {
  return [...new Set(getCache().monthlyRunrate.map(row => row.line).filter(Boolean))]
    .map(line => ({ line }));
}

export function getCapacityWeeklyLineRows() {
  return [...new Set(getCache().weeklyRunrate.map(row => row.line).filter(Boolean))]
    .map(line => ({ line }));
}

export async function saveManhoursRecord(record) {
  try {
    await api.post('/manhours', {
      month: record.month,
      line: record.line,
      working_days: record.workingDays,
      manpower: record.manpower,
      planned_reg: record.plannedReg,
      actual_reg: record.actualReg,
      planned_ot: record.plannedOT,
      actual_ot: record.actualOT,
      absenteeism: record.absenteeism
    });
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('saveManhoursRecord() error:', error);
    return false;
  }
}

export async function deleteLegacyManhoursWeeklyRows() {
  return true;
}

export function getManhoursById(id) {
  return getCache().manhours.find(row => row.id === id);
}

export async function deleteManhoursRecord(id) {
  try {
    await api.delete(`/manhours/${id}`);
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('deleteManhoursRecord() error:', error);
    return false;
  }
}

export async function clearManhoursRecords() {
  try {
    await api.delete('/manhours');
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('clearManhoursRecords() error:', error);
    return false;
  }
}

export function getBudgetRows() {
  return getCache().obTargets.slice(0, 36).map(row => ({
    id: null,
    month: row.month,
    utility_budget: row.utility_budget,
    rm_budget: row.rm_budget,
    volume_budget: row.volume_budget
  }));
}

export async function saveBudgetRecord(month, utilityBudget, rmBudget, volumeBudget) {
  try {
    await api.post('/ob-targets', {
      month,
      utility_budget: utilityBudget,
      rm_budget: rmBudget,
      volume_budget: volumeBudget
    });
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('saveBudgetRecord() error:', error);
    return false;
  }
}
