import { api } from '../api.js';
import { refreshDataCache } from '../dataCache.js';

const monthScopedTables = new Set(['utilities', 'production', 'capacity', 'manhours', 'loss', 'budget']);
const clearableEntryTables = new Set(['utilities', 'production', 'capacity', 'manhours', 'loss', 'budget']);

function isAllowedTable(table, allowedTables) {
  return allowedTables.has(table);
}

export async function deleteRecordByMonth(table, month) {
  if (!isAllowedTable(table, monthScopedTables)) return false;
  try {
    if (table === 'budget') {
      await api.delete(`/ob-targets/${encodeURIComponent(month)}`);
    } else if (table === 'utilities' || table === 'production') {
      await api.delete(`/actual-costs/${encodeURIComponent(month)}`);
    } else {
      return false;
    }
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('deleteRecordByMonth() error:', table, month, error);
    return false;
  }
}

export async function clearEntryTable(table) {
  if (!isAllowedTable(table, clearableEntryTables)) return false;
  try {
    if (table === 'budget') {
      await api.delete('/ob-targets');
    } else if (table === 'utilities' || table === 'production') {
      await api.delete('/actual-costs');
    } else if (table === 'capacity') {
      await api.delete('/runrate/monthly/all');
    } else if (table === 'manhours') {
      await api.delete('/manhours');
    } else if (table === 'loss') {
      await refreshDataCache();
      return true;
    } else {
      return false;
    }
    await refreshDataCache();
    return true;
  } catch (error) {
    console.error('clearEntryTable() error:', table, error);
    return false;
  }
}
