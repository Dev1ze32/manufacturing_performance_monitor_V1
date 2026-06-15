import { api } from '../api.js';
import { refreshDataCache } from '../dataCache.js';

export async function upsertImportedUtility(month, utilityCost, rmCost) {
  try {
    await api.post('/actual-costs', {
      month,
      utility_cost: utilityCost,
      rm_cost: rmCost
    });
    return true;
  } catch (error) {
    console.error('upsertImportedUtility() error:', error);
    return false;
  }
}

export async function upsertImportedProduction(month, volume) {
  try {
    await api.post('/actual-costs', { month, volume });
    return true;
  } catch (error) {
    console.error('upsertImportedProduction() error:', error);
    return false;
  }
}

export async function upsertImportedBudget(month, utilityBudget, rmBudget, volumeBudget) {
  try {
    await api.post('/ob-targets', {
      month,
      utility_budget: utilityBudget,
      rm_budget: rmBudget,
      volume_budget: volumeBudget
    });
    return true;
  } catch (error) {
    console.error('upsertImportedBudget() error:', error);
    return false;
  }
}

export async function upsertImportedCapacity(record) {
  try {
    await api.post('/runrate/monthly', {
      month: record.month,
      line: record.line || '',
      capacity: record.capacity,
      actual_output: record.actual_output,
      machine_availability: record.machine_availability
    });
    return true;
  } catch (error) {
    console.error('upsertImportedCapacity() error:', error);
    return false;
  }
}

export async function upsertImportedWeeklyCapacity(record) {
  try {
    await api.post('/runrate/weekly', {
      month: record.month,
      line: record.line,
      week_label: record.week_label,
      week_num: record.week_num,
      capacity: record.capacity,
      actual_output: record.actual_output,
      machine_availability: record.machine_availability
    });
    return true;
  } catch (error) {
    console.error('upsertImportedWeeklyCapacity() error:', error);
    return false;
  }
}

export async function upsertImportedManhours(record) {
  try {
    await api.post('/manhours', {
      month: record.month,
      line: record.line || '',
      working_days: record.working_days,
      manpower: record.manpower,
      planned_reg: record.planned_reg,
      actual_reg: record.actual_reg,
      planned_ot: record.planned_ot,
      actual_ot: record.actual_ot,
      absenteeism: record.absenteeism
    });
    return true;
  } catch (error) {
    console.error('upsertImportedManhours() error:', error);
    return false;
  }
}

export async function finalizeImport() {
  await refreshDataCache();
}
