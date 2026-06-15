import {
  getAllDistinctMonthRows,
  getBudgetDistinctMonthRows,
  getCostDistinctMonthRows,
  getLatestProductionRecord,
  getLatestUtilitiesRecord,
  getManhoursSummaryRows as fetchManhoursSummaryRows,
  getRunrateManhoursDistinctMonthRows,
  getRunrateSummaryRows as fetchRunrateSummaryRows
} from './queries/utilsQueries.js';

export let charts = {};

export function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

export function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// FORMATTERS
export function fmt(n, decimals=3) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : Number(n).toFixed(decimals); }
export function fmtN(n, decimals=0) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : Number(n).toLocaleString('en-PH', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}); }
export function fmtPct(n) { return (n == null || isNaN(n) || !isFinite(n)) ? '—' : (Number(n)*100).toFixed(2) + '%'; }
export function fmtMonthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(mo)-1] + ' ' + y;
}

// FORM/UI HELPERS
export function val(id){ return (document.getElementById(id)||{}).value||''; }
export function setVal(id,v){
  const el=document.getElementById(id);
  if (!el) return;
  const value = v != null ? String(v) : '';
  if (value && el.tagName === 'SELECT' && ![...el.options].some(option => option.value === value)) {
    el.add(new Option(fmtMonthLabel(value) || value, value));
  }
  el.value=value;
}
export function parseN(id){ const v=parseFloat(val(id)); return isNaN(v)?null:v; }
export function clearForm(ids){ ids.forEach(id=>setVal(id,'')); }

export function normalizeLineName(value) {
  const cleaned = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const compact = cleaned
    .replace(/^Q\d+\s+/i, '')
    .replace(/\b(APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\b.*$/i, '')
    .replace(/\bRUNRATE\b.*$/i, '')
    .replace(/\bMANHOURS\b.*$/i, '')
    .trim();

  const shortLine = compact.match(/\bL(?:INE)?\s*(\d+)\s+(.+)$/i);
  if (shortLine) {
    const product = shortLine[2].trim();
    if (/ELASTOSEAL|ES\b/i.test(product)) return `Line ${shortLine[1]} ES`;
    if (/EPOXY/i.test(product)) return `Line ${shortLine[1]} Epoxy`;
    if (/\bBB\b/i.test(product)) return `Line ${shortLine[1]} BB`;
    return `Line ${shortLine[1]} ${titleCase(product)}`;
  }

  return titleCase(compact).replace(/\bEs\b/g, 'ES').replace(/\bBb\b/g, 'BB');
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

// ── GLOBAL SELECTION STATE ────────────────────────────────────────────────────
// A selection is one of three states:
//   specific month  → _globalMonth = 'YYYY-MM', _globalQuarter = null
//   fiscal quarter  → _globalMonth = '',         _globalQuarter = { fy, q, months, dataMonths, label }
//   all months      → _globalMonth = '',         _globalQuarter = null

let _globalMonth = '';
let _globalQuarter = null;

export function getGlobalMonth() { return _globalMonth; }
export function setGlobalMonth(m) {
  _globalMonth = m || '';
  if (m) _globalQuarter = null;  // month selection always clears quarter
}

/** Returns current quarter selection, or null if month/all is active. */
export function getGlobalQuarter() { return _globalQuarter; }

/** Clears both month and quarter → "All Months". */
export function clearGlobalSelection() {
  _globalMonth = '';
  _globalQuarter = null;
}

// ── PAGES THAT SUPPORT QUARTER SELECTION ─────────────────────────────────────
// Only these pages show Q1–Q4 buttons in the period picker.
const QUARTER_PAGES = new Set(['manhours', 'loss']);

export function pageSupportsQuarters(page) {
  return QUARTER_PAGES.has(page);
}

// ── FISCAL YEAR HELPERS ───────────────────────────────────────────────────────
// Fiscal year starts in October. FY26 = Oct 2025 → Sep 2026.

export function getFY(month) {
  if (!month) return null;
  const [y, mo] = month.split('-').map(Number);
  return mo >= 10 ? y + 1 : y;
}

// Returns the 12 YYYY-MM months in a fiscal year, Oct-first order.
export function getFYMonths(fy) {
  const months = [];
  for (let mo = 10; mo <= 12; mo++) months.push(`${fy - 1}-${String(mo).padStart(2,'0')}`);
  for (let mo = 1;  mo <= 9;  mo++) months.push(`${fy}-${String(mo).padStart(2,'0')}`);
  return months;
}

export function getMonthsWithData() {
  return new Set(getDistinctMonths());
}

export function getCurrentFY() {
  const now = new Date();
  return getFY(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
}

/**
 * Returns all fiscal quarters within a given FY that have at least one month
 * present in withData. Each entry: { fy, q, months, dataMonths, label }.
 * Quarters are defined purely by fiscal calendar math — nothing hardcoded.
 */
export function getQuartersForFY(fy, withData) {
  const fyMonths = getFYMonths(fy);
  // FY months are always in Oct-Nov-Dec-Jan-...-Sep order (indices 0–11)
  // Q1=0-2, Q2=3-5, Q3=6-8, Q4=9-11
  return [
    { q: 1, indices: [0, 1, 2] },
    { q: 2, indices: [3, 4, 5] },
    { q: 3, indices: [6, 7, 8] },
    { q: 4, indices: [9, 10, 11] },
  ]
    .map(({ q, indices }) => {
      const months     = indices.map(i => fyMonths[i]);
      const dataMonths = months.filter(m => withData.has(m));
      return { fy, q, months, dataMonths, label: `Q${q}` };
    })
    .filter(qd => qd.dataMonths.length > 0);
}

// ── MONTH OPTIONS FOR FORM SELECTS ───────────────────────────────────────────

export function monthOptions(selected='') {
  const months = buildMonthRange(getDistinctMonths());
  if (selected && /^\d{4}-\d{2}$/.test(selected) && !months.includes(selected)) {
    months.push(selected);
    months.sort();
  }
  return months.map(m => `<option value="${m}" ${m===selected?'selected':''}>${fmtMonthLabel(m)}</option>`).join('');
}

export function getDistinctMonths() {
  const all = new Set();
  getAllDistinctMonthRows().forEach(r => all.add(r.month));
  return [...all].sort();
}

export function getMonthsForPage(page) {
  switch (page) {
    case 'cost':
      return unionMonths(getCostDistinctMonthRows());
    case 'manhours':
      return unionMonths(getRunrateManhoursDistinctMonthRows());
    case 'loss':
      return unionMonths(getRunrateManhoursDistinctMonthRows());
    case 'budget':
      return unionMonths(getBudgetDistinctMonthRows());
    case 'executive':
      return getDistinctMonths();
    default:
      return getDistinctMonths();
  }
}

function unionMonths(...sets) {
  const all = new Set();
  sets.forEach(s => s.forEach(r => all.add(r.month)));
  return [...all].sort();
}

// ── POPULATE + RENDER PICKER ──────────────────────────────────────────────────

export function populateMonthFilter(page) {
  const dataMonths   = page ? getMonthsForPage(page) : getDistinctMonths();
  const showQuarters = pageSupportsQuarters(page);
  const currentFY    = getCurrentFY();

  // Preserve current selection when it's still valid for this page
  const currentMonth   = getGlobalMonth();
  const currentQuarter = getGlobalQuarter();

  let validMonth   = '';
  let validQuarter = null;

  if (currentMonth && dataMonths.includes(currentMonth)) {
    validMonth = currentMonth;
  } else if (showQuarters && currentQuarter) {
    // Keep quarter only if this page supports quarters and it still has data
    const qDataMonths = currentQuarter.months.filter(m => dataMonths.includes(m));
    if (qDataMonths.length > 0) {
      validQuarter = { ...currentQuarter, dataMonths: qDataMonths };
    }
  }

  // If switching to a page that doesn't support quarters and a quarter was
  // selected, convert to the latest month in that quarter (or just latest month)
  if (!showQuarters && currentQuarter && !validMonth) {
    const qMonths = currentQuarter.dataMonths || currentQuarter.months;
    const fallback = qMonths.filter(m => dataMonths.includes(m)).pop()
                  || (dataMonths.length ? dataMonths[dataMonths.length - 1] : null);
    if (fallback) validMonth = fallback;
  }

  // Final fallback: latest month with data
  if (!validMonth && !validQuarter) {
    const latestMonth = dataMonths.length ? dataMonths[dataMonths.length - 1] : null;
    if (latestMonth) validMonth = latestMonth;
  }

  // Commit selection
  if (validMonth) {
    setGlobalMonth(validMonth);
  } else if (validQuarter) {
    _globalMonth   = '';
    _globalQuarter = validQuarter;
  } else {
    clearGlobalSelection();
  }

  const referenceMonth = validMonth || (validQuarter ? validQuarter.months[0] : null);
  const latestDataFY   = referenceMonth ? getFY(referenceMonth) : currentFY;
  const displayFY      = Math.max(latestDataFY, currentFY);

  renderPeriodPicker(displayFY, validMonth, validQuarter, new Set(dataMonths), showQuarters);
}

/**
 * Renders the custom FY period picker into #period-picker-root.
 *
 * @param {number}      fy             Fiscal year being viewed
 * @param {string}      selectedMonth  Currently selected YYYY-MM, or ''
 * @param {object|null} selectedQtr    Currently selected quarter descriptor, or null
 * @param {Set}         relevantMonths Months with data (controls visible buttons)
 * @param {boolean}     showQuarters   Whether to render Q1–Q4 buttons
 */
export function renderPeriodPicker(fy, selectedMonth, selectedQtr, relevantMonths, showQuarters) {
  const root = document.getElementById('period-picker-root');
  if (!root) return;

  const withData  = relevantMonths || getMonthsWithData();
  window._currentPickerMonths   = withData;
  window._currentPickerShowQtrs = !!showQuarters;

  const fyMonths   = getFYMonths(fy);
  const shortNames = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'];
  const currentFY  = getCurrentFY();

  const allData    = getDistinctMonths();
  const earliestFY = allData.length ? getFY(allData[0]) : currentFY;
  const canGoPrev  = fy > earliestFY;
  const canGoNext  = fy < currentFY + 1;

  const visibleMonths = fyMonths
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => withData.has(m));

  // ── Quarter buttons (only when showQuarters = true) ───────────────────────
  let quarterHtml = '';
  if (showQuarters) {
    const quarters = getQuartersForFY(fy, withData);
    if (quarters.length) {
      const buttons = quarters.map(qd => {
        const isSelected = selectedQtr && selectedQtr.fy === qd.fy && selectedQtr.q === qd.q;
        const tip = `${qd.label} FY${qd.fy}: ${qd.dataMonths.map(fmtMonthLabel).join(', ')}`;
        return `<button
          class="period-quarter ${isSelected ? 'selected' : ''}"
          onclick="window._selectQuarter(${qd.fy}, ${qd.q})"
          title="${tip}"
        >${qd.label}</button>`;
      }).join('');
      quarterHtml = `<div class="period-quarters">${buttons}</div>`;
    }
  }

  // ── Month buttons ─────────────────────────────────────────────────────────
  const monthHtml = visibleMonths.length
    ? visibleMonths.map(({ m, i }) => {
        const isSelected = !selectedQtr && m === selectedMonth;
        return `<button
          class="period-month has-data ${isSelected ? 'selected' : ''}"
          onclick="window._selectMonth('${m}')"
          title="${fmtMonthLabel(m)}"
        >${shortNames[i]}</button>`;
      }).join('')
    : `<div class="period-empty">No data for FY${fy}</div>`;

  const isAllSelected = !selectedMonth && !selectedQtr;

  root.innerHTML = `
    <div class="period-picker">
      <div class="period-picker-header">
        <button class="period-nav ${canGoPrev ? '' : 'disabled'}"
          onclick="window._fyNav(${fy - 1})"
          ${canGoPrev ? '' : 'disabled'}
          title="Previous fiscal year">&#8249;</button>
        <span class="period-fy-label">FY${fy}</span>
        <button class="period-nav ${canGoNext ? '' : 'disabled'}"
          onclick="window._fyNav(${fy + 1})"
          ${canGoNext ? '' : 'disabled'}
          title="Next fiscal year">&#8250;</button>
      </div>
      ${quarterHtml}
      <div class="period-months">${monthHtml}</div>
      <button class="period-all-btn ${isAllSelected ? 'selected' : ''}"
        onclick="window._selectMonth('')">All Months</button>
    </div>`;
}

// ── Picker event handlers ─────────────────────────────────────────────────────

window._fyNav = function(fy) {
  renderPeriodPicker(
    fy,
    getGlobalMonth() || null,
    getGlobalQuarter(),
    window._currentPickerMonths,
    window._currentPickerShowQtrs
  );
};

window._selectMonth = function(month) {
  if (month) setGlobalMonth(month); else clearGlobalSelection();
  const fy             = month ? getFY(month) : getCurrentFY();
  const relevantMonths = window._currentPickerMonths;
  const months         = relevantMonths ? [...relevantMonths] : getDistinctMonths();
  const latestFY       = months.length ? getFY(months[months.length - 1]) : getCurrentFY();
  renderPeriodPicker(
    month ? fy : Math.max(latestFY, getCurrentFY()),
    month || null,
    null,
    relevantMonths,
    window._currentPickerShowQtrs
  );
  if (window.onGlobalMonthChange) window.onGlobalMonthChange();
};

window._selectQuarter = function(fy, q) {
  const withData = window._currentPickerMonths || getMonthsWithData();
  const quarters = getQuartersForFY(fy, withData);
  const qd       = quarters.find(x => x.fy === fy && x.q === q);
  if (!qd) return;

  _globalMonth   = '';
  _globalQuarter = { fy: qd.fy, q: qd.q, months: qd.months, dataMonths: qd.dataMonths, label: `FY${fy} Q${q}` };

  renderPeriodPicker(fy, null, _globalQuarter, withData, window._currentPickerShowQtrs);
  if (window.onGlobalMonthChange) window.onGlobalMonthChange();
};

// ── Month range builder ───────────────────────────────────────────────────────

function buildMonthRange(existingMonths = []) {
  const validExisting = existingMonths.filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  const fy            = getCurrentFY();
  const defaultStart  = `${fy - 2}-10`;
  const nextFyEnd     = `${fy + 1}-09`;
  const dataEnd       = validExisting.length ? validExisting[validExisting.length - 1] : '';
  const defaultEnd    = maxMonth(nextFyEnd, dataEnd || nextFyEnd);
  const months        = [];
  let d               = monthToDate(defaultStart);
  const endDate       = monthToDate(defaultEnd);
  while (d <= endDate) {
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function monthToDate(month) {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(year, monthNo - 1, 1);
}
function maxMonth(a, b) { return a >= b ? a : b; }

// ── CALCULATIONS ──────────────────────────────────────────────────────────────
export function calcUtilCostPerKg(util_cost, volume) { return (!volume || volume === 0) ? null : util_cost / volume; }
export function calcRMCostPerKg(rm_cost, volume) { return (!volume || volume === 0) ? null : rm_cost / volume; }
export function calcEnggCostPerKg(util_cost, rm_cost, volume) { return (!volume || volume === 0) ? null : (util_cost + rm_cost) / volume; }
export function calcEfficiency(capacity, actual) { return (!capacity || capacity === 0) ? null : actual / capacity; }
export function calcRegHrsUtil(actual_reg, planned_reg) { return (!planned_reg || planned_reg === 0) ? null : actual_reg / planned_reg; }
export function calcOTUtil(actual_ot, planned_ot) { return (!planned_ot || planned_ot === 0) ? null : actual_ot / planned_ot; }
export function calcOTRate(actual_ot, actual_reg) {
  const total = (actual_ot || 0) + (actual_reg || 0);
  return total <= 0 ? null : (actual_ot || 0) / total;
}
export function calcPersonDays(working_days, manpower) {
  return (!working_days || !manpower || working_days <= 0 || manpower <= 0) ? null : working_days * manpower;
}
export function calcPlannedRegHours(working_days, manpower) {
  const personDays = calcPersonDays(working_days, manpower);
  return personDays === null ? null : personDays * 8;
}
export function calcPlannedOTHours(working_days, manpower) {
  const personDays = calcPersonDays(working_days, manpower);
  return personDays === null ? null : personDays * 4;
}
export function calcTotalManhoursUtil(actual_reg, actual_ot, planned_reg, planned_ot) {
  const planned = (planned_reg || 0) + (planned_ot || 0);
  return planned <= 0 ? null : ((actual_reg || 0) + (actual_ot || 0)) / planned;
}
export function calcAbsenteeismRate(absenteeism, working_days, manpower, planned_reg) {
  const personDays        = calcPersonDays(working_days, manpower);
  const plannedPersonDays = planned_reg > 0 ? planned_reg / 8 : null;
  const baseDays          = personDays || plannedPersonDays;
  return (!baseDays || absenteeism == null) ? null : absenteeism / baseDays;
}
export function calcLossContribution(individual_loss, total_loss) { return (!total_loss || total_loss === 0) ? null : individual_loss / total_loss; }
export function calcVariance(actual, budget) { return actual - budget; }
export function calcVariancePct(actual, budget) { return (!budget || budget === 0) ? null : (actual - budget) / Math.abs(budget); }

export function getManhoursSummaryRows(month = '') {
  return fetchManhoursSummaryRows(month);
}

export function getRunrateSummaryRows(month = '') {
  return fetchRunrateSummaryRows(month);
}

export function getMonthData(month) {
  const u = getLatestUtilitiesRecord(month);
  const p = getLatestProductionRecord(month);
  return { u, p };
}

export function getKPIs(month) {
  const { u, p } = getMonthData(month);
  return {
    util_cost: u.utility_cost, rm_cost: u.rm_cost, volume: p.volume,
    util_per_kg: calcUtilCostPerKg(u.utility_cost, p.volume),
    rm_per_kg:   calcRMCostPerKg(u.rm_cost, p.volume),
    engg_per_kg: calcEnggCostPerKg(u.utility_cost, u.rm_cost, p.volume),
  };
}
