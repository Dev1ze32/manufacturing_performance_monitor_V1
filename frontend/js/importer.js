import {
  upsertImportedBudget,
  upsertImportedCapacity,
  upsertImportedManhours,
  upsertImportedProduction,
  upsertImportedUtility,
  upsertImportedWeeklyCapacity,
  finalizeImport
} from './queries/importerQueries.js';
import { fmtMonthLabel, populateMonthFilter, showToast, calcPlannedRegHours, calcPlannedOTHours, normalizeLineName } from './utils.js';

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

// Matches: "APR WEEK 14", "MAY WK18", "JUN WK 10", "NOV WEEK 3" etc.
const WEEK_LABEL_RE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(?:WEEK|WK)\s*(\d+)$/i;

const PERIOD_RE = /\b(ACT|OB)\s*(\d{2,4})\s+([A-Z]{3,9})\b/i;
const MONTH_RE = /^(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)$/i;

function renderImport(c) {
  const defaultFy = new Date().getFullYear();
  c.innerHTML = `
    <div class="page-header">
      <h1>Import Excel</h1>
      <p>Load workbook data into the dashboard tables</p>
    </div>

    <div class="card section-gap">
      <div class="info-block">
        <strong>Supported patterns:</strong> utilities workbooks with ACT/OB fiscal period columns, runrate efficiency blocks with weekly capacity/actual rows, optional machine availability rows, and monthly manhours blocks with working days/manpower formulas.
      </div>
      <div class="form-section">
        <div class="form-section-title">Workbook Import</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Excel files *</label>
            <input type="file" id="import_files" accept=".xlsx,.xls,.xlsm" multiple>
            <span class="form-hint">You can select both workbooks in one import.</span>
          </div>
          <div class="form-group">
            <label>Fiscal year for sheets without ACT/OB headers</label>
            <input type="number" id="import_fy" value="${defaultFy}" min="2020" max="2099" step="1">
            <span class="form-hint">FY2026 maps Oct 2025 through Sep 2026.</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="startExcelImport()">Import Selected Files</button>
          <button class="btn btn-secondary" onclick="resetImportResult()">Clear Result</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Import Result</div>
      <div id="import_result" class="import-result empty">
        <p>No import has run yet.</p>
        <p class="empty-hint">Choose an Excel file, then import.</p>
      </div>
    </div>
  `;
}

async function startExcelImport() {
  const input = document.getElementById('import_files');
  const result = document.getElementById('import_result');
  const fy = parseInt(document.getElementById('import_fy').value, 10);

  if (!window.XLSX) {
    showToast('Excel parser did not load. Check internet access for the XLSX CDN.', 'error');
    return;
  }
  if (!input?.files?.length) {
    showToast('Select at least one Excel file.', 'error');
    return;
  }
  if (!Number.isInteger(fy) || fy < 2020 || fy > 2099) {
    showToast('Enter a valid fiscal year.', 'error');
    return;
  }

  result.className = 'import-result';
  result.innerHTML = '<div class="loading">Reading workbook data...</div>';

  const totals = createTotals();
  const fileSummaries = [];

  try {
    for (const file of input.files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const parsed = parseWorkbook(workbook, fy);
      const applied = await applyParsedData(parsed);
      mergeTotals(totals, applied);
      fileSummaries.push({ name: file.name, parsed, applied });
    }

    await finalizeImport();
    populateMonthFilter();
    result.innerHTML = renderImportSummary(fileSummaries, totals);
    showToast(`Import complete: ${totalAppliedRows(totals)} records updated.`);
  } catch (error) {
    console.error(error);
    result.innerHTML = `<div class="empty"><p>Import failed.</p><p class="empty-hint">${escapeHtml(error.message || String(error))}</p></div>`;
    showToast('Import failed. See the result panel.', 'error');
  }
}

function resetImportResult() {
  const result = document.getElementById('import_result');
  if (result) {
    result.className = 'import-result empty';
    result.innerHTML = '<p>No import has run yet.</p><p class="empty-hint">Choose an Excel file, then import.</p>';
  }
}

function parseWorkbook(workbook, defaultFy) {
  const parsed = createParsedData();

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) return;
    parsePeriodMetricSheet(sheet, parsed);
    parseOperationalSheet(sheet, parsed, defaultFy);
  });

  return parsed;
}

function createParsedData() {
  return {
    utilities: new Map(),
    production: new Map(),
    budget: new Map(),
    capacity: new Map(),
    capacity_weekly: new Map(),
    manhours: new Map()
  };
}

function createTotals() {
  return { utilities: 0, production: 0, budget: 0, capacity: 0, capacity_weekly: 0, manhours: 0 };
}

function parsePeriodMetricSheet(sheet, parsed) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let activePeriods = new Map();

  for (let r = range.s.r; r <= range.e.r; r++) {
    // 🛑 NEW FIX: Stop parsing if we hit the YTD Summary sections
    const firstColText = cleanText(getCellValue(sheet, r, 0));
    if (/ACTUAL\s*FY|OB\s*FY/i.test(firstColText)) {
      activePeriods.clear(); // Wipes the memory of the columns so it stops reading
      continue;
    }
    const periods = getPeriodsInRow(sheet, r, range);
    if (periods.size) {
      activePeriods = periods;
      continue;
    }

    if (!activePeriods.size) continue;

    // Stop scanning metric rows when we hit a clearly non-data section
    // (a row with no label and no numeric values in any period column)
    const label = findRowLabel(sheet, r, Math.min(range.e.c, 5));
    const metric = classifyPeriodMetric(label);
    if (!metric) continue;

    const entries = [...activePeriods.entries()]
      .sort(([a], [b]) => a - b)
      .map(([c, period]) => ({ c, period, value: toNumber(getCellValue(sheet, r, c)) }))
      .filter(entry => entry.value != null);

    const lastNonZeroBySeries = new Map();
    entries.forEach((entry, index) => {
      if (entry.value !== 0) lastNonZeroBySeries.set(periodSeriesKey(entry.period), index);
    });

    entries.forEach((entry, index) => {
      const { period, value } = entry;
      const lastNonZero = lastNonZeroBySeries.get(periodSeriesKey(period));
      if (value === 0 && (lastNonZero == null || index > lastNonZero)) return;

      if (period.source === 'ACT') {
        if (metric === 'utility') upsertMap(parsed.utilities, period.month, { utility_cost: value });
        if (metric === 'rm') upsertMap(parsed.utilities, period.month, { rm_cost: value });
        if (metric === 'volume') upsertMap(parsed.production, period.month, { volume: value });
        if (metric === 'machine_availability') {
          upsertMap(parsed.capacity, keyed(period.month, ''), {
            month: period.month,
            line: '',
            machine_availability: normalizePercent(value)
          });
        }
      }

      if (period.source === 'OB') {
        if (metric === 'utility') upsertMap(parsed.budget, period.month, { utility_budget: value });
        if (metric === 'rm') upsertMap(parsed.budget, period.month, { rm_budget: value });
        if (metric === 'volume') upsertMap(parsed.budget, period.month, { volume_budget: value });
      }
    });
  }
}

function parseOperationalSheet(sheet, parsed, defaultFy) {
  const range = XLSX.utils.decode_range(sheet['!ref']);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = cleanText(getCellValue(sheet, r, c));
      if (!text) continue;

      if ((/RUNRATE\s+EFFICIENCY/i.test(text) || /OUTPUT\s+CAPACITY/i.test(text) || /CAPACITY\s+VS\s+ACTUAL/i.test(text)) && (/LINE/i.test(text) || /\bL\d/i.test(text))) {
        parseCapacityBlock(sheet, parsed, defaultFy, r, c, range, normalizeLineName(text));
      }

      if (/MANHOURS/i.test(text) && /LINE/i.test(text)) {
        parseManhoursBlock(sheet, parsed, defaultFy, r, c, range, normalizeLineName(text));
      }

    }
  }
}

function parseCapacityBlock(sheet, parsed, defaultFy, headingRow, startCol, range, line) {
  if (!line) return;
  // Use full sheet range — multi-month blocks (e.g. Q3 = Apr/May/Jun) can span
  // 45+ rows from the heading row, so the old +40 cutoff silently dropped June data.
  const endRow = range.e.r;
  let currentMonth = '';
  const weeklyRecords = [];

  for (let r = headingRow + 1; r <= endRow; r++) {
    const rawLabel = cleanText(getCellValue(sheet, r, startCol));
    if (!rawLabel) continue;

    // Stop if we hit another block heading in this column (next line's section starts)
    if (/RUNRATE\s+EFFICIENCY/i.test(rawLabel) || /MANHOURS/i.test(rawLabel)) break;

    // ── Monthly total row ────────────────────────────────────────────────────
    if (isMonthName(rawLabel)) {
      currentMonth = monthNameToIso(rawLabel, defaultFy);
      continue;
    }

    if (/MACHINE\s+AVAIL/i.test(rawLabel) && currentMonth) {
      const availability = normalizePercent(
        toNumber(getCellValue(sheet, r, startCol + 1)) ?? toNumber(getCellValue(sheet, r, startCol + 2))
      );
      if (availability != null) {
        upsertMap(parsed.capacity, keyed(currentMonth, line), {
          month: currentMonth,
          line,
          machine_availability: availability
        });
      }
      continue;
    }

    // ── Weekly row  (e.g. "APR WEEK 14", "MAY WK18") ────────────────────────
    const weekMatch = rawLabel.match(WEEK_LABEL_RE);
    if (weekMatch) {
      const monthAbbr  = weekMatch[1];
      const weekNum    = parseInt(weekMatch[2], 10);
      const month      = monthNameToIso(monthAbbr, defaultFy);
      const weekLabel  = rawLabel.toUpperCase();          // normalise casing
      const capacity   = toNumber(getCellValue(sheet, r, startCol + 1));
      const actual     = toNumber(getCellValue(sheet, r, startCol + 2));
      if (capacity == null && actual == null) continue;
      weeklyRecords.push({ rowIndex: r, month, line, week_label: weekLabel, week_num: weekNum, capacity, actual_output: actual });
    }
  }

  const lastNonZeroIndex = weeklyRecords.reduce((last, record, index) => {
    return record.capacity !== 0 || record.actual_output !== 0 ? index : last;
  }, -1);

  weeklyRecords.forEach((record, index) => {
    const isZeroWeek = (record.capacity == null || record.capacity === 0) && (record.actual_output == null || record.actual_output === 0);
    if (isZeroWeek && lastNonZeroIndex >= 0 && index > lastNonZeroIndex) return;
    upsertMap(
      parsed.capacity_weekly,
      keyed(record.month, record.line) + '::' + record.week_label,
      record
    );
  });
}

function parseManhoursBlock(sheet, parsed, defaultFy, headingRow, startCol, range, line) {
  if (!line) return;

  for (let r = headingRow + 1; r <= range.e.r; r++) {
    const label = cleanText(getCellValue(sheet, r, startCol));
    if (!isMonthName(label)) continue;

    const month = monthNameToIso(label, defaultFy);
    const sectionEnd = findNextMonthSection(sheet, startCol, r + 1, range.e.r);
    const record = { month, line };

    for (let rr = r + 1; rr < sectionEnd; rr++) {
      const rowLabel = cleanText(getCellValue(sheet, rr, startCol));
      if (!rowLabel) continue;

      const planned = toNumber(getCellValue(sheet, rr, startCol + 1));
      const actual = toNumber(getCellValue(sheet, rr, startCol + 2));

      if (/^working days/i.test(rowLabel)) {
        record.working_days = planned;
      } else if (/^manpower/i.test(rowLabel)) {
        record.manpower = planned;
      } else if (/^reg\s+hrs/i.test(rowLabel)) {
        record.actual_reg = actual;
        if (record.working_days == null || record.manpower == null) record.planned_reg = planned;
      } else if (/^ot\s+hrs/i.test(rowLabel)) {
        record.actual_ot = actual;
        if (record.working_days == null || record.manpower == null) record.planned_ot = planned;
      } else if (/^absenteeism/i.test(rowLabel)) {
        record.absenteeism = actual ?? planned;
      } else {
        continue;
      }
    }

    const plannedReg = calcPlannedRegHours(record.working_days, record.manpower);
    const plannedOT = calcPlannedOTHours(record.working_days, record.manpower);
    if (plannedReg !== null) record.planned_reg = plannedReg;
    if (plannedOT !== null) record.planned_ot = plannedOT;

    if (hasAnyNumber(record, ['planned_reg', 'actual_reg', 'planned_ot', 'actual_ot', 'absenteeism', 'working_days', 'manpower'])) {
      upsertMap(parsed.manhours, keyed(month, line), record);
    }
  }
}

async function applyParsedData(parsed) {
  const totals = createTotals();

  for (const [month, r] of parsed.utilities) {
    if (isAllNull(r, ['utility_cost', 'rm_cost'])) continue;
    if (await upsertImportedUtility(month, nullIfMissing(r.utility_cost), nullIfMissing(r.rm_cost))) totals.utilities++;
  }

  for (const [month, r] of parsed.production) {
    if (r.volume == null) continue;
    if (await upsertImportedProduction(month, r.volume)) totals.production++;
  }

  for (const [month, r] of parsed.budget) {
    if (isAllNull(r, ['utility_budget', 'rm_budget', 'volume_budget'])) continue;
    if (await upsertImportedBudget(month, nullIfMissing(r.utility_budget), nullIfMissing(r.rm_budget), nullIfMissing(r.volume_budget))) totals.budget++;
  }

  for (const r of parsed.capacity) {
    if (isAllNull(r, ['capacity', 'actual_output', 'machine_availability'])) continue;
    if (await upsertImportedCapacity({
      month: r.month,
      line: r.line || '',
      capacity: nullIfMissing(r.capacity),
      actual_output: nullIfMissing(r.actual_output),
      machine_availability: nullIfMissing(r.machine_availability)
    })) {
      totals.capacity++;
    }
  }

  for (const r of parsed.capacity_weekly) {
    if (isAllNull(r, ['capacity', 'actual_output', 'machine_availability'])) continue;
    if (await upsertImportedWeeklyCapacity({
      month: r.month,
      line: r.line,
      week_label: r.week_label,
      week_num: r.week_num ?? null,
      capacity: nullIfMissing(r.capacity),
      actual_output: nullIfMissing(r.actual_output),
      machine_availability: nullIfMissing(r.machine_availability)
    })) {
      totals.capacity_weekly++;
    }
  }

  for (const r of parsed.manhours) {
    if (isAllZeroOrNull(r, ['planned_reg', 'actual_reg', 'planned_ot', 'actual_ot', 'absenteeism', 'working_days', 'manpower'])) continue;
    if (await upsertImportedManhours({
      month: r.month,
      line: r.line || '',
      working_days: nullIfMissing(r.working_days),
      manpower: nullIfMissing(r.manpower),
      planned_reg: nullIfMissing(r.planned_reg),
      actual_reg: nullIfMissing(r.actual_reg),
      planned_ot: nullIfMissing(r.planned_ot),
      actual_ot: nullIfMissing(r.actual_ot),
      absenteeism: nullIfMissing(r.absenteeism)
    })) {
      totals.manhours++;
    }
  }

  return totals;
}

function getPeriodsInRow(sheet, r, range) {
  const periods = new Map();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const period = parsePeriodHeader(getCellValue(sheet, r, c));
    if (period) periods.set(c, period);
  }
  return periods;
}

function parsePeriodHeader(value) {
  const match = cleanText(value).match(PERIOD_RE);
  if (!match) return null;

  const monthNo = monthNumber(match[3]);
  if (!monthNo) return null;

  const fiscalYear = normalizeYear(match[2]);
  const calendarYear = monthNo >= 10 ? fiscalYear - 1 : fiscalYear;

  return {
    source: match[1].toUpperCase(),
    fiscalYear,
    month: isoMonth(calendarYear, monthNo)
  };
}

function classifyPeriodMetric(label) {
  const text = cleanText(label);
  if (!text) return null;
  if (/UTILIT/i.test(text)) return 'utility';
  if (/^(R\s*&\s*M|R&M|REPAIR)/i.test(text)) return 'rm';
  if (/VOLUME/i.test(text)) return 'volume';
  if (/MACHINE\s+AVAIL/i.test(text)) return 'machine_availability';
  return null;
}

function periodSeriesKey(period) {
  return `${period.source}-${period.fiscalYear}`;
}

function findRowLabel(sheet, r, maxCol) {
  for (let c = 0; c <= maxCol; c++) {
    const value = getCellValue(sheet, r, c);
    if (typeof value === 'string' && cleanText(value)) return value;
  }
  return '';
}

function findNextMonthSection(sheet, startCol, fromRow, maxRow) {
  for (let r = fromRow; r <= maxRow; r++) {
    if (isMonthName(getCellValue(sheet, r, startCol))) return r;
  }
  return Math.min(maxRow + 1, fromRow + 12);
}

function getCellValue(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[,%₱PHP\s]/gi, '');
  if (!cleaned || cleaned === '-') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function isMonthName(value) {
  return MONTH_RE.test(cleanText(value));
}

function monthNumber(value) {
  return MONTHS[cleanText(value).toLowerCase()];
}

function monthNameToIso(monthName, fiscalYear) {
  const monthNo = monthNumber(monthName);
  const year = monthNo >= 10 ? fiscalYear - 1 : fiscalYear;
  return isoMonth(year, monthNo);
}

function normalizeYear(value) {
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function isoMonth(year, monthNo) {
  return `${year}-${String(monthNo).padStart(2, '0')}`;
}

function keyed(month, line) {
  return `${month}::${line}`;
}

function upsertMap(map, key, patch) {
  map.set(key, { ...(map.get(key) || {}), ...patch });
}

function nullIfMissing(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function normalizePercent(value) {
  const n = nullIfMissing(value);
  return n == null ? null : (Math.abs(n) > 1 ? n / 100 : n);
}

function hasAnyNumber(record, fields) {
  return fields.some(field => record[field] != null && Number.isFinite(Number(record[field])));
}

function isAllZeroOrNull(record, fields) {
  return fields.every(field => record[field] == null || Number(record[field]) === 0);
}

function isAllNull(record, fields) {
  return fields.every(field => record[field] == null);
}

function mergeTotals(target, source) {
  Object.keys(target).forEach(key => { target[key] += source[key] || 0; });
}

function totalAppliedRows(totals) {
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

function renderImportSummary(fileSummaries, totals) {
  const cards = [
    ['Utilities', totals.utilities],
    ['Production', totals.production],
    ['OB / Target', totals.budget],
    ['Runrate Monthly', totals.capacity],
    ['Runrate Weekly', totals.capacity_weekly],
    ['Manhours (Monthly)', totals.manhours]
  ].map(([label, value]) => `
    <div class="import-stat">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub">records updated</div>
    </div>
  `).join('');

  const files = fileSummaries.map(summary => {
    const months = collectMonths(summary.parsed);
    return `<tr>
      <td><strong>${escapeHtml(summary.name)}</strong></td>
      <td>${months.length ? escapeHtml(formatMonthRange(months)) : '-'}</td>
      <td class="td-number">${totalAppliedRows(summary.applied)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="import-stats">${cards}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>File</th><th>Months detected</th><th>Rows updated</th></tr></thead>
        <tbody>${files}</tbody>
      </table>
    </div>
  `;
}

function collectMonths(parsed) {
  const months = new Set();
  ['utilities', 'production', 'budget'].forEach(key => {
    parsed[key].forEach((_, month) => months.add(month));
  });
  ['capacity', 'capacity_weekly', 'manhours'].forEach(key => {
    parsed[key].forEach(record => months.add(record.month));
  });
  return [...months].filter(Boolean).sort();
}

function formatMonthRange(months) {
  if (months.length === 1) return fmtMonthLabel(months[0]);
  return `${fmtMonthLabel(months[0])} to ${fmtMonthLabel(months[months.length - 1])}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

export { renderImport, startExcelImport, resetImportResult };
