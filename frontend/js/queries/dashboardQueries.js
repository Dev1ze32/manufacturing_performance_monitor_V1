import { getCache } from '../dataCache.js';

function filterByMonth(rows, month) {
  return month ? rows.filter(row => row.month === month) : rows;
}

function groupBy(rows, keyFn, reducer) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const current = groups.get(key) || reducer.init();
    groups.set(key, reducer.accumulate(current, row));
  }
  return [...groups.entries()].map(([key, value]) => reducer.finalize(key, value));
}

export function getBudgetByMonth(month) {
  if (!month) return [];
  return getCache().obTargets.filter(row => row.month === month);
}

export function getExecutiveCostTrendRows() {
  return [...getCache().costRows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

export function getCostDashboardRows() {
  return [...getCache().costRows].sort((a, b) => a.month.localeCompare(b.month));
}

export function getProductionCapacityRows(month) {
  return filterByMonth(getCache().productionRows, month);
}

export function getCapacityMonthlyTotals() {
  return groupBy(
    getCache().productionRows,
    row => row.month,
    {
      init: () => ({ cap: 0, act: 0, machine_availability: [], month: null }),
      accumulate: (current, row) => ({
        month: row.month,
        cap: current.cap + (row.capacity || 0),
        act: current.act + (row.actual_output || 0),
        machine_availability: row.machine_availability != null
          ? [...current.machine_availability, row.machine_availability]
          : current.machine_availability
      }),
      finalize: (month, value) => ({
        month,
        cap: value.cap,
        act: value.act,
        machine_availability: value.machine_availability.length
          ? value.machine_availability.reduce((sum, n) => sum + n, 0) / value.machine_availability.length
          : null
      })
    }
  ).sort((a, b) => a.month.localeCompare(b.month));
}

export function getCapacityWeeklyLines(month) {
  const rows = filterByMonth(getCache().weeklyRunrate, month);
  return [...new Set(rows.map(row => row.line).filter(Boolean))]
    .sort()
    .map(line => ({ line }));
}

export function getCapacityLineSummaries(month) {
  const rows = filterByMonth(getCache().productionRows, month);
  return groupBy(
    rows,
    row => row.line,
    {
      init: () => ({ cap: 0, act: 0, machine_availability: [], line: null }),
      accumulate: (current, row) => ({
        line: row.line,
        cap: current.cap + (row.capacity || 0),
        act: current.act + (row.actual_output || 0),
        machine_availability: row.machine_availability != null
          ? [...current.machine_availability, row.machine_availability]
          : current.machine_availability
      }),
      finalize: (line, value) => ({
        line,
        cap: value.cap,
        act: value.act,
        machine_availability: value.machine_availability.length
          ? value.machine_availability.reduce((sum, n) => sum + n, 0) / value.machine_availability.length
          : null
      })
    }
  ).sort((a, b) => String(a.line).localeCompare(String(b.line)));
}

export function getCapacityLineQuarterRows() {
  return getCache().productionRows.map(row => ({
    month: row.month,
    line: row.line,
    cap: row.capacity,
    act: row.actual_output,
    machine_availability: row.machine_availability
  }));
}

export function getCapacityWeeklyPanelRows(line, month) {
  const rows = getCache().weeklyRunrate.filter(row => {
    if (row.line !== line) return false;
    return month ? row.month === month : true;
  });

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.month}|${row.week_label}|${row.week_num ?? ''}`;
    const current = grouped.get(key) || {
      month: row.month,
      week_label: row.week_label,
      week_num: row.week_num,
      cap: 0,
      act: 0,
      machine_availability: []
    };
    current.cap += row.capacity || 0;
    current.act += row.actual_output || 0;
    if (row.machine_availability != null) current.machine_availability.push(row.machine_availability);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map(row => ({
      month: row.month,
      week_label: row.week_label,
      week_num: row.week_num,
      cap: row.cap,
      act: row.act,
      machine_availability: row.machine_availability.length
        ? row.machine_availability.reduce((sum, n) => sum + n, 0) / row.machine_availability.length
        : null
    }))
    .sort((a, b) => {
      const monthCmp = a.month.localeCompare(b.month);
      if (monthCmp !== 0) return monthCmp;
      const weekCmp = (a.week_num ?? 0) - (b.week_num ?? 0);
      return weekCmp !== 0 ? weekCmp : String(a.week_label).localeCompare(String(b.week_label));
    });
}

export function getWeeklyRunrateRows(month) {
  const rows = filterByMonth(getCache().weeklyRunrate, month);
  const sorted = [...rows].sort((a, b) => {
    const monthCmp = b.month.localeCompare(a.month);
    if (monthCmp !== 0) return monthCmp;
    const lineCmp = String(a.line).localeCompare(String(b.line));
    if (lineCmp !== 0) return lineCmp;
    const weekCmp = (a.week_num ?? 0) - (b.week_num ?? 0);
    return weekCmp !== 0 ? weekCmp : String(a.week_label).localeCompare(String(b.week_label));
  });
  return month ? sorted : sorted.slice(0, 200);
}

export function getBudgetActualRows(month) {
  const rows = filterByMonth(getCache().obActual, month);
  return rows.slice(0, 24);
}
