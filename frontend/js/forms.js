import {
  clearManhoursRecords as clearManhoursRecordsQuery,
  clearActualCostRecords as clearActualCostRecordsQuery,
  clearRunrateRecords as clearRunrateRecordsQuery,
  clearWeeklyCapacityRecords,
  deleteActualCostRecord as deleteActualCostRecordQuery,
  deleteCapacityRecord,
  deleteLegacyManhoursWeeklyRows,
  deleteManhoursRecord,
  deleteWeeklyCapacityRecord,
  getActualCostRows,
  getBudgetRows,
  getCapacityLineRows,
  getCapacityRows,
  getCapacityWeeklyLineRows,
  getCapacityWeeklyRows,
  getLegacyManhoursWeeklyCount,
  getManhoursById,
  getManhoursRows,
  getWeeklyCapacityById,
  saveBudgetRecord,
  saveActualCostRecord,
  saveCapacityRecord,
  saveManhoursRecord,
  saveWeeklyCapacityRecord
} from './queries/formsQueries.js';
import { 
  fmtN, fmtMonthLabel, monthOptions, showToast, 
  val, setVal, parseN, clearForm, calcEfficiency, calcRegHrsUtil, calcOTUtil,
  calcPlannedRegHours, calcPlannedOTHours, calcPersonDays, getRunrateSummaryRows,
  normalizeLineName
} from './utils.js';

function parsePercentInput(id) {
  const value = parseN(id);
  if (value == null) return null;
  return Math.abs(value) > 1 ? value / 100 : value;
}

function percentInputValue(value) {
  return value == null ? '' : Number(value) * 100;
}

function fmtPercentValue(value) {
  return value == null ? '—' : (Number(value) * 100).toFixed(2) + '%';
}

// ── ENTRY: UTILITIES & R&M ─────────────────────────────────────────────────────
function renderEntryUtilities(c) {
  const rows = getActualCostRows();
  c.innerHTML = `
    <div class="page-header">
      <h1>Actual Cost & Volume Entry</h1>
      <p>Enter ACT utilities, R&M, and production volume for cost per kg</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>ACT data:</strong> These values feed the actual Utilities/R&M cost per kg formulas. OB/target values are entered separately in OB / Target Entry.</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Actual Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="u_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Actual Utility Cost (₱ thousands)</label>
            <input type="number" id="u_util" placeholder="e.g. 1761.21" step="0.01">
            <span class="form-hint">Total electricity, water, fuel expenses</span>
          </div>
          <div class="form-group">
            <label>Actual R&M Cost (₱ thousands)</label>
            <input type="number" id="u_rm" placeholder="e.g. 1510.80" step="0.01">
            <span class="form-hint">Repair and maintenance expenses</span>
          </div>
          <div class="form-group">
            <label>Actual Production Volume (MT)</label>
            <input type="number" id="u_vol" placeholder="e.g. 1795.41" step="0.001">
            <span class="form-hint">Denominator for Utilities/R&M cost per kg</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveUtility()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearForm(['u_month','u_util','u_rm','u_vol'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="records-header">
        <div class="card-title">Existing Actual Records</div>
        ${rows.length ? `<button class="btn btn-sm btn-danger" onclick="clearActualCostRecords()">Clear Records</button>` : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Utility Cost (₱ thousands)</th><th>R&M Cost (₱ thousands)</th><th>Volume (MT)</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td><strong>${fmtMonthLabel(r.month)}</strong></td>
              <td class="td-number">${r.utility_cost != null ? fmtN(r.utility_cost,2) : '—'}</td>
              <td class="td-number">${r.rm_cost != null ? fmtN(r.rm_cost,2) : '—'}</td>
              <td class="td-number">${r.volume != null ? fmtN(r.volume,3) : '—'}</td>
              <td><div class="record-actions">
                <button class="btn btn-sm btn-secondary" onclick="editUtility('${r.month}',${r.utility_cost ?? null},${r.rm_cost ?? null},${r.volume ?? null})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteActualCostRecord('${r.month}')">Delete</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="5"><div class="empty"><p>No records yet. Enter data above.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
 
async function saveUtility() {
  const month=val('u_month'), util=parseN('u_util'), rm=parseN('u_rm'), volume=parseN('u_vol');
  if(!month){showToast('Please select a month','error');return;}
  if([util, rm, volume].every(v => v == null)){showToast('Enter at least one actual value','error');return;}
  const saved = await saveActualCostRecord(month, util, rm, volume);
  if (!saved) { showToast('Could not save record. Is the backend running?', 'error'); return; }
  showToast('Actual cost and volume record saved!');
  navigateTo('entry-utilities');
}
function editUtility(month,util,rm,volume){
  setVal('u_month',month);
  document.getElementById('u_util').value=util||'';
  document.getElementById('u_rm').value=rm||'';
  document.getElementById('u_vol').value=volume||'';
  document.querySelector('#u_month').scrollIntoView({behavior:'smooth'});
}

async function deleteActualCostRecord(month) {
  if(!confirm(`Delete actual cost and volume record for ${fmtMonthLabel(month)}?`))return;
  const deleted = await deleteActualCostRecordQuery(month);
  if (!deleted) { showToast('Could not delete record.', 'error'); return; }
  showToast('Deleted.','error');navigateTo('entry-utilities');
}

async function clearActualCostRecords() {
  if(!confirm('Clear all actual Utilities, R&M, and Production Volume records?'))return;
  const cleared = await clearActualCostRecordsQuery();
  if (!cleared) { showToast('Could not clear records.', 'error'); return; }
  showToast('Actual cost and volume records cleared.','error');navigateTo('entry-utilities');
}
 
// ── ENTRY: PRODUCTION VOLUME ───────────────────────────────────────────────────
function renderEntryProduction(c) {
  renderEntryUtilities(c);
}
function saveProduction(){
  saveUtility();
}
function editProd(m,v){
  setVal('u_month',m);
  setVal('u_vol',v);
  document.querySelector('#u_month')?.scrollIntoView({behavior:'smooth'});
}
 
// ── ENTRY: CAPACITY ────────────────────────────────────────────────────────────
function renderEntryCapacity(c) {
  const rows = getCapacityRows();
  const weekRows = getCapacityWeeklyRows();
  const rollupRows = getRunrateSummaryRows();

  // Collect existing lines for the dropdown helper
  const existingLines = [...new Set([
    ...rows.map(r => r.line),
    ...weekRows.map(r => r.line)
  ].filter(Boolean))].sort();

  c.innerHTML = `
    <div class="page-header">
      <h1>Runrate Efficiency Entry</h1>
      <p>Enter weekly capacity and actual output by line</p>
    </div>

    <!-- ── MONTHLY ── -->
    <div id="cap-panel-monthly" style="display:none">
      <div class="card section-gap">
        <div class="info-block"><strong>Formula:</strong> Efficiency = Actual Output / Capacity x 100%</div>
        <div class="form-section">
          <div class="form-section-title">Add / Update Manual Monthly Total</div>
          <div class="form-grid">
            <div class="form-group">
              <label>Month *</label>
              <select id="c_month"><option value="">Select month...</option>${monthOptions()}</select>
            </div>
            <div class="form-group">
              <label>Production Line *</label>
              <input type="text" id="c_line" placeholder="e.g. Line 4 ES" list="c_line_list">
              <datalist id="c_line_list">${existingLines.map(l => `<option value="${l}">`).join('')}</datalist>
              <span class="form-hint">Line name must be consistent (e.g. Line 4 ES, Line 6 Epoxy, Line 4 BB)</span>
            </div>
            <div class="form-group">
              <label>Capacity (units)</label>
              <input type="number" id="c_cap" placeholder="e.g. 138046" step="0.001" oninput="previewEff()">
            </div>
            <div class="form-group">
              <label>Actual Output (units)</label>
              <input type="number" id="c_act" placeholder="e.g. 132313" step="0.001" oninput="previewEff()">
            </div>
            <div class="form-group">
              <label>Machine Availability (%)</label>
              <input type="number" id="c_avail" placeholder="e.g. 95" step="0.01">
              <span class="form-hint">Optional. Leave blank if machine availability is not tracked for this record.</span>
            </div>
          </div>
          <div id="c_preview" style="margin-top:12px;font-size:13px;color:var(--gray-500)"></div>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary" onclick="saveCapacity()">Save Manual Monthly Total</button>
            <button class="btn btn-secondary" onclick="clearForm(['c_month','c_line','c_cap','c_act','c_avail'])">Clear</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="records-header">
          <div class="card-title">Manual Monthly Records</div>
          ${rows.length ? `<button class="btn btn-sm btn-danger" onclick="clearExistingRecords('capacity','Manual runrate records')">Clear Manual Records</button>` : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Line</th><th>Capacity</th><th>Actual Output</th><th>Efficiency</th><th>Machine Avail.</th><th>Actions</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map(r => {
                const eff = calcEfficiency(r.capacity, r.actual_output);
                return `<tr>
                  <td>${fmtMonthLabel(r.month)}</td><td><strong>${r.line}</strong></td>
                  <td class="td-number">${fmtN(r.capacity, 0)}</td>
                  <td class="td-number">${fmtN(r.actual_output, 0)}</td>
                  <td class="td-number"><strong>${eff !== null ? (eff * 100).toFixed(2) + '%' : '—'}</strong></td>
                  <td class="td-number">${fmtPercentValue(r.machine_availability)}</td>
                  <td><div class="record-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editCap('${r.month}','${r.line}',${r.capacity ?? null},${r.actual_output ?? null},${r.machine_availability ?? null})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCapacity('${r.month}','${r.line}')">Delete</button>
                  </div></td>
                </tr>`;
              }).join('') : '<tr><td colspan="7"><div class="empty"><p>No records yet.</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── WEEKLY ── -->
    <div id="cap-panel-weekly">
      <div class="card section-gap">
        <div class="info-block">
          <strong>Formula:</strong> Efficiency = Actual Output / Capacity x 100%
        </div>
        <div class="form-section">
          <div class="form-section-title">Add / Update Weekly Runrate</div>
          <div class="form-grid">
            <div class="form-group">
              <label>Month *</label>
              <select id="cw_month" onchange="onCapMonthChange()"><option value="">Select month...</option>${monthOptions()}</select>
            </div>
            <div class="form-group">
              <label>Production Line *</label>
              <input type="text" id="cw_line" placeholder="e.g. Line 4 ES" list="cw_line_list">
              <datalist id="cw_line_list">${existingLines.map(l => `<option value="${l}">`).join('')}</datalist>
            </div>
            <div class="form-group">
              <label>Week *</label>
              <select id="cw_week" onchange="onCapWeekChange()">
                <option value="">— select month first —</option>
              </select>
              <span class="form-hint">Weeks are auto-generated from the selected month</span>
            </div>
            <div class="form-group">
              <label>Capacity (units)</label>
              <input type="number" id="cw_cap" placeholder="e.g. 26467" step="0.001" oninput="previewWeekEff()">
            </div>
            <div class="form-group">
              <label>Actual Output (units)</label>
              <input type="number" id="cw_act" placeholder="e.g. 24556" step="0.001" oninput="previewWeekEff()">
            </div>
            <div class="form-group">
              <label>Machine Availability (%)</label>
              <input type="number" id="cw_avail" placeholder="e.g. 95" step="0.01">
              <span class="form-hint">Optional. Leave blank if machine availability is not tracked for this week.</span>
            </div>
          </div>
          <div id="cw_preview" style="margin-top:12px;font-size:13px;color:var(--gray-500)"></div>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary" onclick="saveWeeklyCapacity()">Save Weekly Runrate</button>
            <button class="btn btn-secondary" onclick="clearWeeklyForm()">Clear</button>
          </div>
        </div>
      </div>
      <div class="card section-gap">
        <div class="card-title" style="margin-bottom:14px">Monthly Rollup</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Line</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Machine Avail.</th><th>Weekly Rows</th></tr></thead>
            <tbody>
              ${rollupRows.length ? rollupRows.map(r => {
                const eff = calcEfficiency(r.capacity, r.actual_output);
                return `<tr>
                  <td>${fmtMonthLabel(r.month)}</td>
                  <td><strong>${r.line}</strong></td>
                  <td class="td-number">${fmtN(r.capacity, 0)}</td>
                  <td class="td-number">${fmtN(r.actual_output, 0)}</td>
                  <td class="td-number"><strong>${eff !== null ? (eff * 100).toFixed(2) + '%' : '—'}</strong></td>
                  <td class="td-number">${fmtPercentValue(r.machine_availability)}</td>
                  <td class="td-number">${r.weekly_count ? fmtN(r.weekly_count, 0) : 'manual total'}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="7"><div class="empty"><p>No runrate data yet.</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="records-header">
          <div class="card-title">Weekly Runrate Records</div>
          ${weekRows.length || rows.length ? `<button class="btn btn-sm btn-danger" onclick="clearRunrateRecords()">Clear Runrate Data</button>` : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Line</th><th>Week</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Machine Avail.</th><th>Actions</th></tr></thead>
            <tbody>
              ${weekRows.length ? weekRows.map(r => {
                const eff = calcEfficiency(r.capacity, r.actual_output);
                return `<tr>
                  <td>${fmtMonthLabel(r.month)}</td>
                  <td><strong>${r.line}</strong></td>
                  <td>${r.week_label}</td>
                  <td class="td-number">${fmtN(r.capacity, 0)}</td>
                  <td class="td-number">${fmtN(r.actual_output, 0)}</td>
                  <td class="td-number"><strong>${eff !== null ? (eff * 100).toFixed(2) + '%' : '—'}</strong></td>
                  <td class="td-number">${fmtPercentValue(r.machine_availability)}</td>
                  <td><div class="record-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editWeeklyCap(${r.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteWeeklyCapacity(${r.id})">Delete</button>
                  </div></td>
                </tr>`;
              }).join('') : '<tr><td colspan="8"><div class="empty"><p>No weekly records yet. Import from Excel or enter manually.</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ── Week picker helpers ──────────────────────────────────────────────────────

// ISO week number for a given Date
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Get all calendar weeks that fall (at least partially) in a YYYY-MM month.
// Returns [{wnum, label}] in calendar order.
function getWeeksForMonth(monthStr) {
  if (!monthStr) return [];
  const [y, m] = monthStr.split('-').map(Number);
  const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const mon = monthNames[m - 1];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay  = new Date(y, m, 0);
  const seenWeeks = new Set();
  const weeks = [];
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const wnum = getISOWeek(d);
    if (!seenWeeks.has(wnum)) {
      seenWeeks.add(wnum);
      weeks.push({ wnum, label: `${mon} WEEK ${wnum}` });
    }
  }
  return weeks;
}

function populateCapWeekOptions(monthStr, selectedWnum, selectedLabel) {
  const sel = document.getElementById('cw_week');
  if (!sel) return;
  const weeks = getWeeksForMonth(monthStr);
  if (!weeks.length) {
    sel.innerHTML = '<option value="">— select month first —</option>';
    return;
  }
  sel.innerHTML = '<option value="">Select week...</option>' +
    weeks.map(w => {
      const v = `${w.wnum}|${w.label}`;
      // Match by wnum, or by existing label if editing a legacy record
      const isSel = (selectedWnum && w.wnum == selectedWnum) ||
                    (selectedLabel && selectedLabel.toUpperCase() === w.label);
      return `<option value="${v}" ${isSel ? 'selected' : ''}>${w.label}</option>`;
    }).join('');
}

window.onCapMonthChange = function() {
  const month = val('cw_month');
  populateCapWeekOptions(month, null, null);
};

window.onCapWeekChange = function() {
  // Nothing extra needed — value is read at save time
};

window.clearWeeklyForm = function() {
  clearForm(['cw_month', 'cw_line', 'cw_cap', 'cw_act', 'cw_avail']);
  const sel = document.getElementById('cw_week');
  if (sel) sel.innerHTML = '<option value="">— select month first —</option>';
  const prev = document.getElementById('cw_preview');
  if (prev) prev.innerHTML = '';
};

window.switchCapTab = function(tab, btn) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('cap-panel-monthly').style.display = tab === 'monthly' ? '' : 'none';
  document.getElementById('cap-panel-weekly').style.display  = tab === 'weekly'  ? '' : 'none';
};

function previewEff() {
  const cap = parseFloat(document.getElementById('c_cap').value);
  const act = parseFloat(document.getElementById('c_act').value);
  const prev = document.getElementById('c_preview');
  if (!isNaN(cap) && !isNaN(act) && cap > 0)
    prev.innerHTML = `Preview: Efficiency = <strong>${(act / cap * 100).toFixed(2)}%</strong>`;
  else prev.innerHTML = '';
}
function previewWeekEff() {
  const cap = parseFloat(document.getElementById('cw_cap').value);
  const act = parseFloat(document.getElementById('cw_act').value);
  const prev = document.getElementById('cw_preview');
  if (!isNaN(cap) && !isNaN(act) && cap > 0)
    prev.innerHTML = `Preview: Efficiency = <strong>${(act / cap * 100).toFixed(2)}%</strong>`;
  else prev.innerHTML = '';
}

async function saveCapacity() {
  const month = val('c_month');
  const line = normalizeLineName(val('c_line'));
  const cap = parseN('c_cap');
  const act = parseN('c_act');
  const availability = parsePercentInput('c_avail');
  if (!month || !line) { showToast('Month and line are required', 'error'); return; }
  if (cap == null && act == null && availability == null) { showToast('Enter capacity, actual output, or machine availability.', 'error'); return; }
  const saved = await saveCapacityRecord(month, line, cap, act, availability);
  if (!saved) { showToast('Could not save record. Is the backend running?', 'error'); return; }
  showToast('Manual monthly runrate saved!'); navigateTo('entry-capacity');
}

async function saveWeeklyCapacity() {
  const month  = val('cw_month');
  const line   = normalizeLineName(val('cw_line'));
  const weekVal = val('cw_week'); // "15|APR WEEK 15"
  const cap    = parseN('cw_cap');
  const act    = parseN('cw_act');
  const availability = parsePercentInput('cw_avail');
  if (!month || !line || !weekVal) { showToast('Month, line, and week are required', 'error'); return; }
  if (cap == null && act == null && availability == null) { showToast('Enter capacity, actual output, or machine availability.', 'error'); return; }
  const [wnumStr, ...labelParts] = weekVal.split('|');
  const wlabel = labelParts.join('|');
  const wnum   = parseInt(wnumStr) || null;
  const saved = await saveWeeklyCapacityRecord(month, line, wlabel, wnum, cap, act, availability);
  if (!saved) { showToast('Could not save record. Is the backend running?', 'error'); return; }
  showToast('Weekly runrate saved!'); navigateTo('entry-capacity');
}

function editCap(m, l, c, a, availability) {
  setVal('c_month', m);
  setVal('c_line', l);
  setVal('c_cap', c);
  setVal('c_act', a);
  setVal('c_avail', percentInputValue(availability));
}

function editWeeklyCap(id) {
  const r = getWeeklyCapacityById(id);
  if (!r) return;
  // Switch to weekly tab
  document.getElementById('cap-panel-monthly').style.display = 'none';
  document.getElementById('cap-panel-weekly').style.display  = '';
  setVal('cw_month', r.month);
  setVal('cw_line', r.line);
  setVal('cw_cap', r.capacity);
  setVal('cw_act', r.actual_output);
  setVal('cw_avail', percentInputValue(r.machine_availability));
  // Rebuild week options for this month, then select the matching week
  populateCapWeekOptions(r.month, r.week_num, r.week_label);
}

async function deleteCapacity(month, line) {
  if (!confirm(`Delete manual monthly runrate record for ${line} in ${fmtMonthLabel(month)}?`)) return;
  const deleted = await deleteCapacityRecord(month, line);
  if (!deleted) { showToast('Could not delete record.', 'error'); return; }
  showToast('Deleted.', 'error'); navigateTo('entry-capacity');
}

async function deleteWeeklyCapacity(id) {
  if (!confirm('Delete this weekly runrate record?')) return;
  const deleted = await deleteWeeklyCapacityRecord(id);
  if (!deleted) { showToast('Could not delete record.', 'error'); return; }
  showToast('Deleted.', 'error'); navigateTo('entry-capacity');
}

async function clearWeeklyRecords() {
  if (!confirm('Clear ALL weekly runrate records?')) return;
  const cleared = await clearWeeklyCapacityRecords();
  if (!cleared) { showToast('Could not clear weekly records.', 'error'); return; }
  showToast('Weekly records cleared.', 'error'); navigateTo('entry-capacity');
}

async function clearRunrateRecords() {
  if (!confirm('Clear all runrate efficiency data? This removes weekly rows and manual monthly totals.')) return;
  const cleared = await clearRunrateRecordsQuery();
  if (!cleared) { showToast('Could not clear runrate data.', 'error'); return; }
  showToast('Runrate efficiency data cleared.', 'error'); navigateTo('entry-capacity');
}
 
// ── ENTRY: MANHOURS ────────────────────────────────────────────────────────────
function renderEntryManhours(c) {
  const rows = getManhoursRows();
  const legacyWeeklyCount = getLegacyManhoursWeeklyCount();
  const existingLines = [...new Set([
    ...rows.map(r => r.line),
    ...getCapacityLineRows().map(r => r.line),
    ...getCapacityWeeklyLineRows().map(r => r.line)
  ].filter(Boolean))].sort();
  c.innerHTML = `
    <div class="page-header">
      <h1>Manhours Entry</h1>
      <p>Enter monthly working days, manpower, actual hours, and absenteeism by line</p>
    </div>
    <div class="card section-gap">
      <div class="info-block">
        <strong>Formula chain:</strong> Person-Days = Working Days x Manpower &nbsp;|&nbsp; Planned Reg = Person-Days x 8 hrs &nbsp;|&nbsp; Planned OT = Person-Days x 4 hrs
      </div>
      <div class="form-section">
        <div class="form-section-title">Add / Update Monthly Manhours</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="mh_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>Line / Group</label>
            <input type="text" id="mh_line" placeholder="e.g. Line 4 ES" list="mh_line_list">
            <datalist id="mh_line_list">${existingLines.map(l => `<option value="${l}">`).join('')}</datalist>
            <span class="form-hint">Leave blank for plant-wide</span>
          </div>
          <div class="form-group">
            <label>Working Days *</label>
            <input type="number" id="mh_workdays" placeholder="e.g. 22" step="0.5" oninput="previewManhoursPlan()">
            <span class="form-hint">Working days for this month</span>
          </div>
          <div class="form-group">
            <label>Manpower *</label>
            <input type="number" id="mh_manpower" placeholder="e.g. 45" step="0.1" oninput="previewManhoursPlan()">
            <span class="form-hint">Average assigned manpower for this month</span>
          </div>
          <div class="form-group">
            <label>Actual Regular Hours</label>
            <input type="number" id="mh_ar" placeholder="e.g. 5726.94" step="0.01">
          </div>
          <div class="form-group">
            <label>Actual OT Hours</label>
            <input type="number" id="mh_aot" placeholder="e.g. 1886.50" step="0.01">
          </div>
          <div class="form-group">
            <label>Absenteeism (person-days)</label>
            <input type="number" id="mh_abs" placeholder="e.g. 24" step="0.01">
          </div>
        </div>
        <div id="mh_plan_preview" style="margin-top:12px;font-size:13px;color:var(--gray-500)"></div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveManhours()">Save Record</button>
          <button class="btn btn-secondary" onclick="clearManhoursForm()">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="records-header">
        <div class="card-title">Monthly Manhours Records</div>
        ${rows.length || legacyWeeklyCount ? `<button class="btn btn-sm btn-danger" onclick="clearManhoursRecords()">Clear Records</button>` : ''}
      </div>
      ${legacyWeeklyCount ? `<div class="info-block" style="margin-bottom:12px"><strong>Legacy cleanup:</strong> ${fmtN(legacyWeeklyCount,0)} old weekly manhours rows are no longer used. Clear records will remove them.</div>` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Working Days</th><th>Manpower</th><th>Plan Reg</th><th>Act Reg</th><th>Reg Util%</th><th>Plan OT</th><th>Act OT</th><th>OT Util%</th><th>Absent</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const plannedReg = calcPlannedRegHours(r.working_days, r.manpower) ?? r.planned_reg;
              const plannedOT = calcPlannedOTHours(r.working_days, r.manpower) ?? r.planned_ot;
              const ru=calcRegHrsUtil(r.actual_reg,plannedReg), ou=calcOTUtil(r.actual_ot,plannedOT);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td><td>${r.line||'—'}</td>
                <td class="td-number">${r.working_days != null ? fmtN(r.working_days,1) : '—'}</td>
                <td class="td-number">${r.manpower != null ? fmtN(r.manpower,1) : '—'}</td>
                <td class="td-number">${fmtN(plannedReg,0)}</td><td class="td-number">${fmtN(r.actual_reg,1)}</td>
                <td class="td-number"><strong>${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(plannedOT,0)}</td><td class="td-number">${fmtN(r.actual_ot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${r.absenteeism!=null?fmtN(r.absenteeism,1):'—'}</td>
                <td><div class="record-actions">
                  <button class="btn btn-sm btn-secondary" onclick="editMH(${r.id})">Edit</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteMH(${r.id})">Delete</button>
                </div></td>
              </tr>`;
            }).join('') : '<tr><td colspan="12"><div class="empty"><p>No monthly manhours records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
function previewManhoursPlan() {
  const workdays = parseN('mh_workdays');
  const manpower = parseN('mh_manpower');
  const prev = document.getElementById('mh_plan_preview');
  if (!prev) return;
  const plannedReg = calcPlannedRegHours(workdays, manpower);
  const plannedOT = calcPlannedOTHours(workdays, manpower);
  const personDays = calcPersonDays(workdays, manpower);
  if (plannedReg !== null && plannedOT !== null && personDays !== null) {
    prev.innerHTML = `Preview: <strong>${fmtN(plannedReg,0)}</strong> planned regular hrs, <strong>${fmtN(plannedOT,0)}</strong> planned OT hrs, <strong>${fmtN(personDays,1)}</strong> person-days`;
  } else {
    prev.innerHTML = '';
  }
}
function clearManhoursForm() {
  clearForm(['mh_month','mh_line','mh_workdays','mh_manpower','mh_ar','mh_aot','mh_abs']);
  previewManhoursPlan();
}
async function saveManhours(){
  const month=val('mh_month'), line=normalizeLineName(val('mh_line'));
  const workdays = parseN('mh_workdays');
  const manpower = parseN('mh_manpower');
  const ar = parseN('mh_ar');
  const aot = parseN('mh_aot');
  const abs = parseN('mh_abs');
  
  if(!month){showToast('Month is required','error');return;}
  if (workdays == null || manpower == null) {
    showToast('Working days and manpower are required to compute planned hours.', 'error');
    return;
  }
  
  const pr = calcPlannedRegHours(workdays, manpower);
  const pot = calcPlannedOTHours(workdays, manpower);
  if (pr === null || pot === null) {
    showToast('Working days and manpower must be greater than zero.', 'error');
    return;
  }

  if ([ar, aot, abs].every(v => v == null)) {
    showToast('Enter at least one actual manhours or absenteeism value.', 'error');
    return;
  }
  
  const lineKey = line || '';
  const saved = await saveManhoursRecord({
    month,
    line: lineKey,
    workingDays: workdays,
    manpower,
    plannedReg: pr,
    actualReg: ar,
    plannedOT: pot,
    actualOT: aot,
    absenteeism: abs
  });
  if (!saved) { showToast('Could not save record. Is the backend running?', 'error'); return; }
  await deleteLegacyManhoursWeeklyRows(month, lineKey);
  showToast('Monthly manhours record saved!'); navigateTo('entry-manhours');
}
function editMH(id){
  const r=getManhoursById(id);
  if(!r)return;
  setVal('mh_month',r.month);
  setVal('mh_line',r.line||'');
  setVal('mh_workdays',r.working_days);
  setVal('mh_manpower',r.manpower);
  setVal('mh_ar',r.actual_reg);
  setVal('mh_aot',r.actual_ot);
  setVal('mh_abs',r.absenteeism);
  previewManhoursPlan();
}
async function deleteMH(id){
  if(!confirm('Delete this monthly manhours record?'))return;
  const deleted = await deleteManhoursRecord(id);
  if (!deleted) { showToast('Could not delete record.', 'error'); return; }
  showToast('Deleted.','error');navigateTo('entry-manhours');
}
async function clearManhoursRecords() {
  if (!confirm('Clear all monthly manhours records and old weekly manhours rows?')) return;
  const cleared = await clearManhoursRecordsQuery();
  if (!cleared) { showToast('Could not clear manhours records.', 'error'); return; }
  showToast('Manhours records cleared.','error');navigateTo('entry-manhours');
}
 
// ── ENTRY: LOSS ────────────────────────────────────────────────────────────────
function renderEntryLoss(c) {
  c.innerHTML = `
    <div class="page-header">
      <h1>Loss Analysis</h1>
      <p>No manual entry required — all values are derived automatically</p>
    </div>
    <div class="card">
      <div class="info-block" style="margin-bottom:20px">
        <strong>Loss data is fully derived.</strong> No separate entry is needed here.
        The Loss Analysis dashboard computes all three loss types directly from your existing data entries.
      </div>
      <div class="form-section">
        <div class="form-section-title">How each loss is calculated</div>
        <div class="table-wrap">
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 12px;background:var(--gray-50);border-bottom:1px solid var(--gray-200)">Loss Type</th>
              <th style="text-align:left;padding:8px 12px;background:var(--gray-50);border-bottom:1px solid var(--gray-200)">Formula</th>
              <th style="text-align:left;padding:8px 12px;background:var(--gray-50);border-bottom:1px solid var(--gray-200)">Data Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);font-weight:600;color:var(--amber)">Runrate Loss %</td>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);font-family:monospace">1 − (Actual Output ÷ Capacity)</td>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);color:var(--gray-500)">Runrate Efficiency entry</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);font-weight:600;color:var(--red)">Absenteeism Loss %</td>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);font-family:monospace">Absences ÷ (Working Days × Manpower)</td>
              <td style="padding:10px 12px;border-bottom:1px solid var(--gray-100);color:var(--gray-500)">Manhours entry</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;font-weight:600;color:var(--blue)">Manhours Loss %</td>
              <td style="padding:10px 12px;font-family:monospace">1 − (Actual MH ÷ Planned MH)</td>
              <td style="padding:10px 12px;color:var(--gray-500)">Manhours entry</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
      <div style="margin-top:8px;padding-top:20px;border-top:1px solid var(--gray-200)">
        <p style="font-size:13px;color:var(--gray-500);margin-bottom:12px">
          The <strong>% Contribution Factor</strong> per line is: each loss % ÷ sum of all three loss % for that line.
        </p>
        <div style="display:flex;gap:10px">
          <button class="btn btn-primary" onclick="navigateTo('loss')">View Loss Dashboard</button>
          <button class="btn btn-secondary" onclick="navigateTo('entry-capacity')">Go to Runrate Entry</button>
          <button class="btn btn-secondary" onclick="navigateTo('entry-manhours')">Go to Manhours Entry</button>
        </div>
      </div>
    </div>
  `;
}
// Stub functions kept so any existing saved references or imports don't throw errors
function saveLoss(){}
function editLoss(){}
function deleteLoss(){}
 
// ── ENTRY: BUDGET ──────────────────────────────────────────────────────────────
function renderEntryBudget(c) {
  const rows = getBudgetRows();
  c.innerHTML = `
    <div class="page-header">
      <h1>OB / Target Entry</h1>
      <p>Enter OB26 target values for utilities, R&M, and volume</p>
    </div>
    <div class="card section-gap">
      <div class="info-block"><strong>OB data:</strong> These target values are compared with ACT values in the OB vs Actual dashboard.</div>
      <div class="form-section">
        <div class="form-section-title">Add / Update OB Target Record</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Month *</label>
            <select id="b_month"><option value="">Select month...</option>${monthOptions()}</select>
          </div>
          <div class="form-group">
            <label>OB Utility Target (₱ thousands)</label>
            <input type="number" id="b_ubud" placeholder="e.g. 9001" step="0.01">
          </div>
          <div class="form-group">
            <label>OB R&M Target (₱ thousands)</label>
            <input type="number" id="b_rbud" placeholder="e.g. 4500" step="0.01">
          </div>
          <div class="form-group">
            <label>OB Volume Target (MT)</label>
            <input type="number" id="b_vbud" placeholder="e.g. 1800" step="0.001">
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="saveBudget()">Save OB Target</button>
          <button class="btn btn-secondary" onclick="clearForm(['b_month','b_ubud','b_rbud','b_vbud'])">Clear</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="records-header">
        <div class="card-title">Existing OB Target Records</div>
        ${rows.length ? `<button class="btn btn-sm btn-danger" onclick="clearExistingRecords('budget','OB target records')">Clear Records</button>` : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Utility OB (₱ thousands)</th><th>R&M OB (₱ thousands)</th><th>Volume OB (MT)</th><th>Actions</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>`<tr>
              <td><strong>${fmtMonthLabel(r.month)}</strong></td>
              <td class="td-number">${fmtN(r.utility_budget,2)}</td>
              <td class="td-number">${fmtN(r.rm_budget,2)}</td>
              <td class="td-number">${fmtN(r.volume_budget,3)}</td>
              <td><div class="record-actions">
                <button class="btn btn-sm btn-secondary" onclick="editBudget('${r.month}',${r.utility_budget},${r.rm_budget},${r.volume_budget})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecord('budget','${r.month}')">Delete</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="5"><div class="empty"><p>No OB target records yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
async function saveBudget(){
  const month=val('b_month'),ub=parseN('b_ubud'),rb=parseN('b_rbud'),vb=parseN('b_vbud');
  if(!month){showToast('Month is required','error');return;}
  const saved = await saveBudgetRecord(month, ub, rb, vb);
  if (!saved) { showToast('Could not save record. Is the backend running?', 'error'); return; }
  showToast('OB target saved!');navigateTo('entry-budget');
}
function editBudget(m,ub,rb,vb){
  setVal('b_month',m);setVal('b_ubud',ub);setVal('b_rbud',rb);setVal('b_vbud',vb);
}

export {
  renderEntryUtilities, saveUtility, editUtility, deleteActualCostRecord, clearActualCostRecords,
  renderEntryProduction, saveProduction, editProd,
  renderEntryCapacity, saveCapacity, editCap, deleteCapacity,
  saveWeeklyCapacity, editWeeklyCap, deleteWeeklyCapacity, clearWeeklyRecords, clearRunrateRecords,
  previewEff, previewWeekEff,
  renderEntryManhours, saveManhours, editMH, deleteMH, clearManhoursRecords, previewManhoursPlan, clearManhoursForm,
  renderEntryLoss, saveLoss, editLoss, deleteLoss,
  renderEntryBudget, saveBudget, editBudget
};
