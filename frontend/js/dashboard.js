import {
  getBudgetActualRows,
  getBudgetByMonth,
  getCapacityLineQuarterRows,
  getCapacityLineSummaries,
  getCapacityMonthlyTotals,
  getCapacityWeeklyLines,
  getCapacityWeeklyPanelRows,
  getCostDashboardRows,
  getExecutiveCostTrendRows,
  getProductionCapacityRows,
  getWeeklyRunrateRows
} from './queries/dashboardQueries.js';
import { 
  fmt, fmtN, fmtPct, fmtMonthLabel, getKPIs, calcUtilCostPerKg, 
  calcRMCostPerKg, calcEnggCostPerKg, calcEfficiency, 
  calcRegHrsUtil, calcOTUtil, calcLossContribution, calcVariance, calcVariancePct,
  calcPersonDays, calcAbsenteeismRate, calcTotalManhoursUtil, calcOTRate,
  calcPlannedRegHours, calcPlannedOTHours, getManhoursSummaryRows, getRunrateSummaryRows,
  getFY, getFYMonths,
  destroyChart, charts 
} from './utils.js';


// ── EXECUTIVE DASHBOARD ───────────────────────────────────────────────────────
function renderExecutive(c, month) {
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';

  // ── Current month KPIs ──────────────────────────────────────────────────────
  const kpis = getKPIs(month);

  // ── Previous month for MoM delta ───────────────────────────────────────────
  function prevMonth(m) {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    return mo === 1
      ? `${y - 1}-12`
      : `${y}-${String(mo - 1).padStart(2, '0')}`;
  }
  const prevM = month ? prevMonth(month) : '';
  const prevKpis = prevM ? getKPIs(prevM) : null;

  function momDelta(curr, prev) {
    if (curr == null || prev == null || prev === 0) return null;
    return (curr - prev) / Math.abs(prev);
  }
  function momArrow(delta, lowerIsBetter = true) {
    if (delta == null) return '';
    const up = delta > 0;
    const bad = lowerIsBetter ? up : !up;
    const arrow = up ? '▲' : '▼';
    const pct = (Math.abs(delta) * 100).toFixed(1) + '%';
    const color = bad ? 'var(--red)' : 'var(--green)';
    return `<span style="font-size:12px;font-weight:700;color:${color};margin-left:6px">${arrow} ${pct} MoM</span>`;
  }

  // ── Budget comparison for selected month ───────────────────────────────────
  const budRows = getBudgetByMonth(month);
  const bud = budRows[0] || {};
  const hasOB = bud.utility_budget != null || bud.rm_budget != null || bud.volume_budget != null;

  function obStatus(actual, budget, lowerIsBetter = true) {
    if (actual == null || budget == null || budget === 0) return null;
    const variance = (actual - budget) / Math.abs(budget);
    const over = lowerIsBetter ? actual > budget : actual < budget;
    return { variance, over };
  }
  function obBadge(actual, budget, lowerIsBetter = true) {
    const s = obStatus(actual, budget, lowerIsBetter);
    if (!s) return '';
    const pct = (Math.abs(s.variance) * 100).toFixed(1) + '%';
    const color = s.over ? 'var(--red)' : 'var(--green)';
    const icon = s.over ? '↑' : '↓';
    const label = s.over ? 'over OB' : 'under OB';
    return `<div style="font-size:11px;font-weight:700;color:${color};margin-top:4px">${icon} ${pct} ${label}</div>`;
  }

  // ── Runrate efficiency ──────────────────────────────────────────────────────
  const capRows = getRunrateSummaryRows(month || '');
  let totalCap = 0, totalActual = 0;
  capRows.forEach(r => { totalCap += r.capacity || 0; totalActual += r.actual_output || 0; });
  const efficiency = totalCap > 0 ? totalActual / totalCap : null;

  const prevCapRows = prevM ? getRunrateSummaryRows(prevM) : [];
  let prevTotalCap = 0, prevTotalActual = 0;
  prevCapRows.forEach(r => { prevTotalCap += r.capacity || 0; prevTotalActual += r.actual_output || 0; });
  const prevEfficiency = prevTotalCap > 0 ? prevTotalActual / prevTotalCap : null;

  // ── Manhours ────────────────────────────────────────────────────────────────
  const mhRows = getManhoursSummaryRows(month || '');
  let sumPReg = 0, sumAReg = 0, sumPOT = 0, sumAOT = 0, sumAbs = 0, sumPersonDays = 0;
  mhRows.forEach(r => {
    sumPReg += r.planned_reg || calcPlannedRegHours(r.working_days, r.manpower) || 0;
    sumAReg += r.actual_reg || 0;
    sumPOT  += r.planned_ot  || calcPlannedOTHours(r.working_days, r.manpower) || 0;
    sumAOT  += r.actual_ot  || 0;
    sumAbs  += r.absenteeism || 0;
    const pd = r.person_days ?? calcPersonDays(r.working_days, r.manpower);
    if (pd != null) sumPersonDays += pd;
  });
  const regUtil = calcRegHrsUtil(sumAReg, sumPReg);
  const otUtil  = calcOTUtil(sumAOT, sumPOT);
  const otRate  = calcOTRate(sumAOT, sumAReg);
  const absPct  = sumPersonDays > 0 ? sumAbs / sumPersonDays : null;

  // ── FY trend — all months in the selected month's fiscal year ───────────────
  // Shows every month of the FY so you can see the full year arc in context.
  const selectedFY = month ? getFY(month) : null;
  const fyMonthsList = selectedFY ? getFYMonths(selectedFY) : [];
  const allCostRows = getCostDashboardRows(); // all available months, oldest-first
  const costByMonth = {};
  allCostRows.forEach(r => { costByMonth[r.month] = r; });
  const sameMonthPriorYear = m => {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    return `${y - 1}-${String(mo).padStart(2, '0')}`;
  };

  // Build FY series — null for months with no data yet (future or missing)
  const fyTrendLabels = fyMonthsList.map(m => {
    const [, mo] = m.split('-').map(Number);
    return ['','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'][mo];
  });
  const fyTrendEngg = fyMonthsList.map(m => {
    const r = costByMonth[m];
    return (r && r.volume > 0) ? (r.utility_cost + r.rm_cost) / r.volume : null;
  });
  const fyPriorEngg = fyMonthsList.map(m => {
    const r = costByMonth[sameMonthPriorYear(m)];
    return (r && r.volume > 0) ? (r.utility_cost + r.rm_cost) / r.volume : null;
  });
  const fyTrendUtil = fyMonthsList.map(m => {
    const r = costByMonth[m];
    return (r && r.volume > 0) ? r.utility_cost / r.volume : null;
  });
  const fyTrendRM = fyMonthsList.map(m => {
    const r = costByMonth[m];
    return (r && r.volume > 0) ? r.rm_cost / r.volume : null;
  });

  // OB target line for the FY chart
  const fyTrendOB = fyMonthsList.map(m => {
    // We need budget for each month — query via getBudgetByMonth per month
    // Use allCostRows budget from getBudgetActualRows instead to avoid N queries
    return null; // filled below
  });

  const budgetActualRows = getBudgetActualRows(''); // all months
  const budgetByMonth = {};
  budgetActualRows.forEach(r => { budgetByMonth[r.month] = r; });
  const fyOBEngg = fyMonthsList.map(m => {
    const r = budgetByMonth[m];
    if (!r || r.volume_budget == null || r.volume_budget === 0) return null;
    const utilB = r.utility_budget || 0;
    const rmB   = r.rm_budget    || 0;
    return (utilB + rmB) / r.volume_budget;
  });

  // ── Runrate by line for the selected month ─────────────────────────────────
  const lineData = {};
  capRows.forEach(r => {
    const line = r.line || 'Plant-wide';
    if (!lineData[line]) lineData[line] = { cap: 0, act: 0 };
    lineData[line].cap += r.capacity || 0;
    lineData[line].act += r.actual_output || 0;
  });
  const lineRows = Object.entries(lineData)
    .map(([line, d]) => ({ line, cap: d.cap, act: d.act, eff: d.cap > 0 ? d.act / d.cap : null }))
    .sort((a, b) => a.line.localeCompare(b.line));

  // ── Highlight index: which KPI needs attention ─────────────────────────────
  const alerts = [];
  if (kpis.engg_per_kg != null && bud.utility_budget != null && bud.rm_budget != null && bud.volume_budget) {
    const obEngg = (bud.utility_budget + bud.rm_budget) / bud.volume_budget;
    if (kpis.engg_per_kg > obEngg * 1.05) alerts.push(`Engineering cost/kg is <strong>${((kpis.engg_per_kg/obEngg - 1)*100).toFixed(1)}% above OB target</strong>`);
  }
  if (efficiency != null && efficiency < 0.85) alerts.push(`Overall runrate efficiency is low at <strong>${(efficiency*100).toFixed(1)}%</strong>`);
  if (absPct != null && absPct > 0.05) alerts.push(`Absenteeism rate is elevated at <strong>${(absPct*100).toFixed(1)}%</strong>`);
  if (otUtil != null && otUtil < 0.70) alerts.push(`OT utilization is low at <strong>${(otUtil*100).toFixed(1)}%</strong></strong> — planned OT may not be needed`);

  // ── Helper: KPI scorecard with MoM delta and OB badge ──────────────────────
  function scoreCard(label, value, decimals, isCost, prevValue, budgetValue, lowerIsBetter, hint, unit='') {
    const hasVal = value != null && isFinite(value);
    const fmtVal = !hasVal ? '—'
      : unit === '%' ? (value * 100).toFixed(1) + '%'
      : isCost ? fmt(value, decimals)
      : fmtN(value, decimals);

    const delta = momDelta(value, prevValue);
    const arrow = hasVal && prevValue != null ? momArrow(delta, lowerIsBetter) : '';
    const ob = hasVal && budgetValue != null ? obBadge(value, budgetValue, lowerIsBetter) : '';

    return `<div class="metric-card" style="position:relative">
      <div class="metric-label">${label}</div>
      <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px">
        <div class="metric-value">${fmtVal}</div>${arrow}
      </div>
      ${ob}
      ${hint ? `<div class="metric-sub" style="margin-top:6px">${hint}</div>` : ''}
    </div>`;
  }

  // OB/kg targets derived from budget record
  const obEnggPerKg  = (bud.utility_budget != null && bud.rm_budget != null && bud.volume_budget)
    ? (bud.utility_budget + bud.rm_budget) / bud.volume_budget : null;
  const obUtilPerKg  = (bud.utility_budget != null && bud.volume_budget) ? bud.utility_budget / bud.volume_budget : null;
  const obRMPerKg    = (bud.rm_budget != null && bud.volume_budget) ? bud.rm_budget / bud.volume_budget : null;

  c.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1>Executive Summary</h1>
          <p>${mLabel}${selectedFY ? ` &nbsp;·&nbsp; FY${selectedFY}` : ''}</p>
        </div>
      </div>
    </div>

    ${alerts.length ? `
    <div style="background:var(--red-light);border:1px solid #fca5a5;border-radius:var(--radius);padding:12px 16px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start">
      <span style="font-size:12px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-right:4px">⚠ Attention</span>
      ${alerts.map(a => `<span style="font-size:12px;color:var(--red)">${a}</span>`).join('<span style="color:#fca5a5">·</span>')}
    </div>` : month ? `
    <div style="background:var(--green-light);border:1px solid #86efac;border-radius:var(--radius);padding:10px 16px;margin-bottom:20px">
      <span style="font-size:12px;font-weight:700;color:var(--green)">✓ All key metrics within normal range for ${mLabel}</span>
    </div>` : ''}

    <!-- ── COST ── -->
    <div class="exec-section-label">COST PERFORMANCE${hasOB ? ' vs OB' : ''}</div>
    <div class="metrics-grid" style="margin-bottom:24px">
      ${scoreCard('Engineering Cost / Kg', kpis.engg_per_kg, 3, true,
          prevKpis?.engg_per_kg, obEnggPerKg, true,
          kpis.util_cost != null && kpis.rm_cost != null ? `₱ ${fmtN(kpis.util_cost + kpis.rm_cost, 0)} total` : 'Util + R&M combined')}
      ${scoreCard('Utility Cost / Kg', kpis.util_per_kg, 3, true,
          prevKpis?.util_per_kg, obUtilPerKg, true,
          kpis.util_cost != null ? `₱ ${fmtN(kpis.util_cost, 0)} total` : '')}
      ${scoreCard('R&M Cost / Kg', kpis.rm_per_kg, 3, true,
          prevKpis?.rm_per_kg, obRMPerKg, true,
          kpis.rm_cost != null ? `₱ ${fmtN(kpis.rm_cost, 0)} total` : '')}
      ${scoreCard('Production Volume', kpis.volume, 1, false,
          prevKpis?.volume, bud.volume_budget, false,
          bud.volume_budget != null ? `OB: ${fmtN(bud.volume_budget, 1)} MT` : 'metric tons')}
    </div>

    <!-- ── PRODUCTION ── -->
    <div class="exec-section-label">PRODUCTION PERFORMANCE</div>
    <div class="metrics-grid" style="margin-bottom:24px">
      ${scoreCard('Overall Runrate', efficiency, 1, false, prevEfficiency, null, false, totalCap > 0 ? `${fmtN(totalActual,0)} / ${fmtN(totalCap,0)} units` : '', '%')}
      ${scoreCard('Regular Hrs Util.', regUtil, 1, false, null, null, false, sumPReg > 0 ? `${fmtN(sumAReg,0)} / ${fmtN(sumPReg,0)} hrs` : '', '%')}
      ${scoreCard('OT Utilization', otUtil, 1, false, null, null, false, sumPOT > 0 ? `${fmtN(sumAOT,0)} / ${fmtN(sumPOT,0)} hrs` : '', '%')}
      ${scoreCard('OT Rate', otRate, 1, false, null, null, true, 'OT share of actual manhours', '%')}
      ${scoreCard('Absenteeism Rate', absPct, 1, false, null, null, true, sumAbs > 0 ? `${fmtN(sumAbs,0)} person-days absent` : '', '%')}
    </div>

    <!-- ── LINE EFFICIENCY SNAPSHOT ── -->
    ${lineRows.length ? `
    <div class="exec-section-label">RUNRATE BY LINE — ${mLabel}</div>
    <div class="metrics-grid" style="margin-bottom:24px">
      ${lineRows.map(r => {
        const pct = r.eff != null ? (r.eff * 100).toFixed(1) + '%' : '—';
        const color = r.eff == null ? 'var(--gray-300)'
          : r.eff >= 0.95 ? 'var(--green)'
          : r.eff >= 0.85 ? 'var(--amber)'
          : 'var(--red)';
        const barW = r.eff != null ? Math.min(r.eff * 100, 100) : 0;
        const barColor = r.eff == null ? 'var(--gray-200)'
          : r.eff >= 0.95 ? 'var(--teal)'
          : r.eff >= 0.85 ? 'var(--amber)'
          : 'var(--red)';
        return `<div class="metric-card" style="border-top:3px solid ${color}">
          <div class="metric-label">${r.line}</div>
          <div class="metric-value" style="color:${color};font-size:22px">${pct}</div>
          <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="background:${barColor};width:${barW}%"></div></div>
          <div class="metric-sub" style="margin-top:6px">${fmtN(r.act,0)} / ${fmtN(r.cap,0)} units</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- ── FY TREND CHART ── -->
    ${selectedFY ? `
    <div class="card section-gap">
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <div class="card-title">FY${selectedFY} Engineering Cost / Kg — Full Year View</div>
        <div style="font-size:11px;color:var(--gray-400)">Selected month highlighted · OB target shown where available</div>
      </div>
      <div class="chart-container">
        <canvas id="execFYTrendChart" aria-label="FY cost per kg trend">FY cost trend</canvas>
      </div>
    </div>` : `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Engineering Cost / Kg — All Available Months</div>
      <div class="chart-container">
        <canvas id="execFYTrendChart" aria-label="Cost per kg trend">Cost trend</canvas>
      </div>
    </div>`}
  `;

  // ── FY TREND CHART ──────────────────────────────────────────────────────────
  destroyChart('execFYTrend');
  const ctx = document.getElementById('execFYTrendChart');

  if (ctx) {
    let labels, utilData, rmData, enggData, priorData, obData, selectedIdx;

    if (selectedFY) {
      labels    = fyTrendLabels;
      utilData  = fyTrendUtil;
      rmData    = fyTrendRM;
      enggData  = fyTrendEngg;
      priorData = fyPriorEngg;
      obData    = fyOBEngg;
      selectedIdx = month ? fyMonthsList.indexOf(month) : -1;
    } else {
      // All months mode
      labels    = allCostRows.map(r => fmtMonthLabel(r.month));
      utilData  = allCostRows.map(r => r.volume > 0 ? r.utility_cost / r.volume : null);
      rmData    = allCostRows.map(r => r.volume > 0 ? r.rm_cost / r.volume : null);
      enggData  = allCostRows.map(r => r.volume > 0 ? (r.utility_cost + r.rm_cost) / r.volume : null);
      priorData = allCostRows.map(r => {
        const prior = costByMonth[sameMonthPriorYear(r.month)];
        return (prior && prior.volume > 0) ? (prior.utility_cost + prior.rm_cost) / prior.volume : null;
      });
      obData    = allCostRows.map(r => {
        const b = budgetByMonth[r.month];
        return (b && b.volume_budget) ? (b.utility_budget + b.rm_budget) / b.volume_budget : null;
      });
      selectedIdx = -1;
    }

    const hasOBData = obData.some(v => v != null);
    const hasPriorData = priorData.some(v => v != null);

    // Build point styling: highlight selected month with a larger dot
    const pointRadius = labels.map((_, i) => i === selectedIdx ? 7 : 0);
    const pointHoverRadius = labels.map((_, i) => i === selectedIdx ? 9 : 5);
    const pointBg = labels.map((_, i) => i === selectedIdx ? '#fff' : '#8b5cf6');
    const pointBorderColor = labels.map((_, i) => i === selectedIdx ? '#7c3aed' : '#8b5cf6');

    const datasets = [
      {
        label: 'Util/Kg',
        data: utilData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 1.5,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false
      },
      {
        label: 'R&M/Kg',
        data: rmData,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
        borderWidth: 1.5,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false
      },
      {
        label: 'Engg/Kg',
        data: enggData,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.06)',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: pointRadius,
        pointHoverRadius: pointHoverRadius,
        pointBackgroundColor: pointBg,
        pointBorderColor: pointBorderColor,
        pointBorderWidth: 2,
        fill: false
      }
    ];

    if (hasOBData) {
      datasets.push({
        label: 'OB Target',
        data: obData,
        borderColor: '#dc2626',
        borderDash: [5, 4],
        borderWidth: 1.5,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false
      });
    }

    if (hasPriorData) {
      datasets.push({
        label: 'Prior Year Engg/Kg',
        data: priorData,
        borderColor: '#64748b',
        borderDash: [2, 4],
        borderWidth: 1.5,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false
      });
    }

    charts['execFYTrend'] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 }, padding: 16 }
          },
          tooltip: {
            callbacks: {
              title: items => items[0].label,
              label: item => {
                if (item.parsed.y == null) return null;
                const prefix = item.dataset.label === 'OB Target' ? '  OB ' : '  ';
                return `${prefix}${item.dataset.label}: ₱${item.parsed.y.toFixed(3)}/kg`;
              }
            }
          },
          annotation: selectedIdx >= 0 ? {
            annotations: {
              selectedLine: {
                type: 'line',
                xMin: selectedIdx,
                xMax: selectedIdx,
                borderColor: 'rgba(124,58,237,0.25)',
                borderWidth: 1,
                borderDash: [3, 3]
              }
            }
          } : {}
        },
        scales: {
          y: {
            border: { display: false },
            grid: { color: '#f1f5f9', drawTicks: false },
            ticks: { font: { size: 11 }, callback: v => '₱' + v.toFixed(2) }
          },
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: { font: { size: 11 } }
          }
        }
      }
    });
  }
}
 
// ── COST DASHBOARD ─────────────────────────────────────────────────────────────
function renderCost(c, month) {
  const rows = getCostDashboardRows();
 
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
  const sel = month ? rows.filter(r=>r.month===month) : rows;
  const rowsByMonth = {};
  rows.forEach(r => { rowsByMonth[r.month] = r; });
  const previousYearMonth = m => {
    if (!m) return '';
    const [y, mo] = m.split('-').map(Number);
    return `${y - 1}-${String(mo).padStart(2, '0')}`;
  };
  const costTrendWindows = new Set(['12', 'fy', 'all']);
  const storedTrendWindow = window.localStorage?.getItem('costTrendWindow') || '12';
  const trendWindow = costTrendWindows.has(storedTrendWindow) ? storedTrendWindow : '12';
  const latestCostMonth = rows.length ? rows[rows.length - 1].month : '';
  const trendBaseMonth = month || latestCostMonth;
  const trendFY = trendBaseMonth ? getFY(trendBaseMonth) : null;
  const trendFYMonths = trendFY ? getFYMonths(trendFY) : [];
  const trendRows = (() => {
    if (trendWindow === 'all') return rows;
    if (trendWindow === 'fy' && trendFYMonths.length) {
      const endIdx = Math.max(trendFYMonths.indexOf(trendBaseMonth), 0);
      const visibleMonths = trendFYMonths.slice(0, endIdx + 1);
      return rows.filter(r => visibleMonths.includes(r.month));
    }
    return rows.slice(-12);
  })();
  const trendWindowLabel = trendWindow === 'all'
    ? 'All months'
    : trendWindow === 'fy'
      ? (trendFY ? `FY${trendFY} to date` : 'Fiscal year to date')
      : 'Latest 12 months';
  const trendHiddenCount = Math.max(rows.length - trendRows.length, 0);
  const denseCostTrend = trendRows.length > 18;
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Cost Dashboard</h1>
      <p>Utilities, R&M, and Engineering cost per Kg — ${mLabel}</p>
    </div>
    <div class="card section-gap">
      <div class="cost-trend-head">
        <div>
          <div class="card-title">Cost per Kg — Monthly Trend</div>
          <div class="card-subtitle">${trendWindowLabel}${trendHiddenCount ? ` - ${fmtN(trendHiddenCount,0)} older months hidden from chart` : ''}</div>
        </div>
        <div class="cost-trend-controls" aria-label="Cost trend range">
          <button type="button" class="focus-tab ${trendWindow === '12' ? 'active' : ''}" data-cost-trend-window="12">12M</button>
          <button type="button" class="focus-tab ${trendWindow === 'fy' ? 'active' : ''}" data-cost-trend-window="fy">FY</button>
          <button type="button" class="focus-tab ${trendWindow === 'all' ? 'active' : ''}" data-cost-trend-window="all">All</button>
        </div>
      </div>
      <div class="chart-container">
        ${trendRows.length ? '<canvas id="costChart" aria-label="Monthly cost per kg trend">Cost per kg trend</canvas>' : '<div class="empty"><p>No cost data yet. Enter actual cost and volume first.</p></div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Monthly Cost Records</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Month</th><th>Utility Cost (₱ thousands)</th><th>R&M Cost (₱ thousands)</th><th>Volume (MT)</th>
            <th>Util / Kg</th><th>R&M / Kg</th><th>Engg / Kg</th><th>Prior Year Engg / Kg</th><th>YoY Var %</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => {
              const upk = calcUtilCostPerKg(r.utility_cost, r.volume);
              const rpk = calcRMCostPerKg(r.rm_cost, r.volume);
              const epk = calcEnggCostPerKg(r.utility_cost, r.rm_cost, r.volume);
              const prior = rowsByMonth[previousYearMonth(r.month)];
              const priorEpk = prior ? calcEnggCostPerKg(prior.utility_cost, prior.rm_cost, prior.volume) : null;
              const yoy = epk != null && priorEpk != null && priorEpk !== 0 ? (epk - priorEpk) / Math.abs(priorEpk) : null;
              return `<tr>
                <td><strong>${fmtMonthLabel(r.month)}</strong></td>
                <td class="td-number">${r.utility_cost != null ? fmtN(r.utility_cost,2) : '—'}</td>
                <td class="td-number">${r.rm_cost != null ? fmtN(r.rm_cost,2) : '—'}</td>
                <td class="td-number">${r.volume != null ? fmtN(r.volume,3) : '—'}</td>
                <td class="td-number">${fmt(upk,3)}</td>
                <td class="td-number">${fmt(rpk,3)}</td>
                <td class="td-number">${fmt(epk,3)}</td>
                <td class="td-number">${fmt(priorEpk,3)}</td>
                <td class="td-number ${yoy!==null?(yoy>0?'td-red':'td-green'):''}">${yoy!==null?((yoy*100).toFixed(1)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="9"><div class="empty"><p>No data yet. Enter data via the Data Entry section.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  c.querySelectorAll('[data-cost-trend-window]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.localStorage?.setItem('costTrendWindow', btn.dataset.costTrendWindow);
      renderCost(c, month);
    });
  });
 
  destroyChart('costChart');
  const ctx = document.getElementById('costChart');
  if (ctx && trendRows.length) {
    const labels = trendRows.map(r=>fmtMonthLabel(r.month));
    const utilPK = trendRows.map(r=>calcUtilCostPerKg(r.utility_cost,r.volume));
    const rmPK = trendRows.map(r=>calcRMCostPerKg(r.rm_cost,r.volume));
    const enggPK = trendRows.map(r=>calcEnggCostPerKg(r.utility_cost,r.rm_cost,r.volume));
    const priorEnggPK = trendRows.map(r => {
      const prior = rowsByMonth[previousYearMonth(r.month)];
      return prior ? calcEnggCostPerKg(prior.utility_cost, prior.rm_cost, prior.volume) : null;
    });
    charts['costChart'] = new Chart(ctx, {
      type: denseCostTrend ? 'line' : 'bar',
      data: {
        labels,
        datasets: [
          denseCostTrend
            ? { label: 'Util/Kg', data: utilPK, borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.08)', pointRadius:2, fill:false, tension:0.25 }
            : { label: 'Util/Kg', data: utilPK, backgroundColor: 'rgba(26,86,219,0.7)' },
          denseCostTrend
            ? { label: 'R&M/Kg', data: rmPK, borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.08)', pointRadius:2, fill:false, tension:0.25 }
            : { label: 'R&M/Kg', data: rmPK, backgroundColor: 'rgba(217,119,6,0.7)' },
          { type: 'line', label: 'Engg/Kg', data: enggPK, borderColor: '#7c3aed', borderDash:[4,3], pointRadius:3, fill:false, tension:0.3 },
          { type: 'line', label: 'Prior Year Engg/Kg', data: priorEnggPK, borderColor: '#64748b', borderDash:[2,4], pointRadius:2, fill:false, tension:0.3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend: { labels: { font:{size:11}, boxWidth:10 } } },
        scales: {
          y: { grid:{color:'#f1f5f9'}, ticks:{font:{size:11}}, title:{display:true,text:'₱ / Kg',font:{size:11}} },
          x: { grid:{display:false}, ticks:{font:{size:11},maxRotation:denseCostTrend ? 0 : 45,autoSkip:true,maxTicksLimit:denseCostTrend ? 10 : 14} }
        }
      }
    });
  }
}
 
// ── PRODUCTION DASHBOARD ───────────────────────────────────────────────────────
function renderProduction(c, month) {
  const rows = getProductionCapacityRows(month);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';

  // Aggregate by month for the trend chart
  const byMonth = {};
  rows.forEach(r => {
    if (!byMonth[r.month]) byMonth[r.month] = { cap: 0, act: 0 };
    byMonth[r.month].cap += r.capacity || 0;
    byMonth[r.month].act += r.actual_output || 0;
  });
  const trendMonths = Object.keys(byMonth).sort();
  const trendEff = trendMonths.map(m => byMonth[m].cap > 0 ? byMonth[m].act / byMonth[m].cap * 100 : null);

  // ── Quarter summaries — dynamically group all months into fiscal quarters ─────
  // Fiscal year: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
  function fiscalQuarter(isoMonth) {
    const mo = parseInt(isoMonth.split('-')[1], 10);
    const yr = parseInt(isoMonth.split('-')[0], 10);
    if (mo >= 10) return { q: 1, fy: yr + 1 };
    if (mo <= 3)  return { q: 2, fy: yr };
    if (mo <= 6)  return { q: 3, fy: yr };
    return         { q: 4, fy: yr };
  }
  const allMonthlyRows = getCapacityMonthlyTotals();
  const byQuarter = {};
  allMonthlyRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!byQuarter[key]) byQuarter[key] = { cap: 0, act: 0, months: [], fy, q };
    byQuarter[key].cap += r.cap || 0;
    byQuarter[key].act += r.act || 0;
    byQuarter[key].months.push(r.month);
  });
  const quarterKeys = Object.keys(byQuarter).sort((a, b) => {
    const [, fyA, qA] = a.match(/FY(\d+) Q(\d)/);
    const [, fyB, qB] = b.match(/FY(\d+) Q(\d)/);
    return fyA !== fyB ? fyA - fyB : qA - qB;
  });

  // Get all lines for the selected month (or all months) that have weekly data
  const weeklyLines = getCapacityWeeklyLines(month);
  const hasWeekly = weeklyLines.length > 0;

  // Build per-line summary cards for selected period
  const lineRows = getCapacityLineSummaries(month);

  // Per-line quarter breakdown (for the quarter summary table)
  const lineQuarterRows = getCapacityLineQuarterRows();
  const byLineQuarter = {};
  lineQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}::${r.line}`;
    if (!byLineQuarter[key]) byLineQuarter[key] = { cap: 0, act: 0, label: `FY${fy} Q${q}`, line: r.line };
    byLineQuarter[key].cap += r.cap || 0;
    byLineQuarter[key].act += r.act || 0;
  });

  c.innerHTML = `
    <div class="page-header">
      <h1>Production Dashboard</h1>
      <p>Capacity, output, and efficiency by line — ${mLabel}</p>
    </div>

    ${lineRows.length ? `
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">LINE SUMMARY — ${mLabel}</div>
      <div class="metrics-grid">
        ${lineRows.map(r => {
          const eff = r.cap > 0 ? r.act / r.cap : null;
          const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
          const color = eff === null ? 'var(--gray-400)' : eff >= 0.95 ? 'var(--green)' : eff >= 0.85 ? 'var(--amber)' : 'var(--red)';
          return `<div class="metric-card" style="border-left:3px solid ${color}">
            <div class="metric-label">${r.line}</div>
            <div class="metric-value" style="color:${color};font-size:22px">${pct}</div>
            <div class="metric-sub">${fmtN(r.act, 0)} / ${fmtN(r.cap, 0)} units${r.machine_availability != null ? ` · Avail ${(r.machine_availability*100).toFixed(2)}%` : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${quarterKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Summary — All Data</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months Included</th><th>Total Capacity</th><th>Total Actual</th><th>Efficiency</th><th>Status</th></tr></thead>
          <tbody>
            ${quarterKeys.map(k => {
              const q = byQuarter[k];
              const eff = q.cap > 0 ? q.act / q.cap : null;
              const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
              const cls = eff === null ? 'gray' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red';
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${fmtN(q.cap, 0)}</td>
                <td class="td-number">${fmtN(q.act, 0)}</td>
                <td class="td-number"><strong>${pct}</strong></td>
                <td><span class="pill pill-${cls}">${eff === null ? 'N/A' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${quarterKeys.length > 0 ? `
      <div style="margin-top:16px">
        <div class="card-title" style="margin-bottom:10px">By Line &amp; Quarter</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Quarter</th><th>Line</th><th>Capacity</th><th>Actual</th><th>Efficiency</th></tr></thead>
            <tbody>
              ${Object.values(byLineQuarter).sort((a,b) => a.label.localeCompare(b.label) || a.line.localeCompare(b.line)).map(r => {
                const eff = r.cap > 0 ? r.act / r.cap : null;
                const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
                const cls = eff === null ? '' : eff >= 0.95 ? 'td-green' : eff < 0.85 ? 'td-red' : '';
                return `<tr>
                  <td>${r.label}</td>
                  <td><strong>${r.line}</strong></td>
                  <td class="td-number">${fmtN(r.cap, 0)}</td>
                  <td class="td-number">${fmtN(r.act, 0)}</td>
                  <td class="td-number"><strong class="${cls}">${pct}</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    </div>` : ''}

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Overall Efficiency Trend (%)</div>
      <div class="chart-container">
        <canvas id="prodTrendChart" aria-label="Efficiency trend">Efficiency trend</canvas>
      </div>
    </div>

    ${hasWeekly ? `
    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">WEEKLY BREAKDOWN BY LINE</div>
      <div class="info-block" style="margin-bottom:16px">
        <strong>Weekly view:</strong> Each line's week-by-week capacity vs actual output. 
        Efficiency &lt; 85% is flagged red; &gt; 100% means actual exceeded planned capacity.
      </div>
      <div id="weekly-line-tabs" class="tabs" style="margin-bottom:0">
        ${weeklyLines.map((r, i) => `<button class="tab ${i === 0 ? 'active' : ''}" onclick="switchWeeklyTab('${r.line}', this)">${r.line}</button>`).join('')}
      </div>
      <div id="weekly-panels">
        ${weeklyLines.map((r, i) => renderWeeklyPanel(r.line, month, i === 0)).join('')}
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Monthly Efficiency by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Capacity (units)</th><th>Actual Output (units)</th><th>Efficiency %</th><th>Machine Avail.</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
              const statusClass = eff === null ? 'gray' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red';
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td><strong>${r.line}</strong></td>
                <td class="td-number">${fmtN(r.capacity, 0)}</td>
                <td class="td-number">${fmtN(r.actual_output, 0)}</td>
                <td class="td-number"><strong>${pct}</strong></td>
                <td class="td-number">${r.machine_availability != null ? (r.machine_availability*100).toFixed(2)+'%' : '—'}</td>
                <td><span class="pill pill-${statusClass}">${eff === null ? 'N/A' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below Target'}</span></td>
              </tr>`;
            }).join('') : '<tr><td colspan="7"><div class="empty"><p>No capacity data. Use Capacity & Efficiency entry.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Trend chart
  destroyChart('prodTrend');
  const ctx = document.getElementById('prodTrendChart');
  if (ctx && trendMonths.length) {
    charts['prodTrend'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendMonths.map(fmtMonthLabel),
        datasets: [
          { label: 'Efficiency %', data: trendEff, borderColor: '#15803d', backgroundColor: 'rgba(21,128,61,0.08)', fill: true, tension: 0.3, pointRadius: 4 },
          { label: 'Target (95%)', data: trendMonths.map(() => 95), borderColor: '#dc2626', borderDash: [6, 3], pointRadius: 0, borderWidth: 1.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: {
          y: { min: 50, max: 115, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, autoSkip: false } }
        }
      }
    });
  }

  // Draw charts for the first line's weekly panel
  if (hasWeekly) {
    const firstLine = weeklyLines[0].line;
    drawWeeklyCharts(firstLine, month);
  }
}

function renderWeeklyPanel(line, month, visible) {
  const weeks = getCapacityWeeklyPanelRows(line, month);

  const panelId = 'weekly-panel-' + line.replace(/\s+/g, '-');
  const chartId = 'weekly-chart-' + line.replace(/\s+/g, '-');

  if (!weeks.length) {
    return `<div id="${panelId}" class="weekly-panel card" style="${visible ? '' : 'display:none'}">
      <div class="empty"><p>No weekly data for ${line}.</p></div>
    </div>`;
  }

  const rows = weeks.map(w => {
    const eff = w.cap > 0 ? w.act / w.cap : null;
    const pct = eff !== null ? (eff * 100).toFixed(2) + '%' : '—';
    const cls = eff === null ? '' : eff > 1.0 ? 'td-green' : eff >= 0.85 ? '' : 'td-red';
    return `<tr>
      <td>${fmtMonthLabel(w.month)}</td>
      <td><strong>${w.week_label}</strong></td>
      <td class="td-number">${fmtN(w.cap, 0)}</td>
      <td class="td-number">${fmtN(w.act, 0)}</td>
      <td class="td-number"><strong class="${cls}">${pct}</strong></td>
      <td class="td-number">${w.machine_availability != null ? (w.machine_availability*100).toFixed(2)+'%' : '—'}</td>
      <td><span class="pill pill-${eff === null ? 'gray' : eff > 1.0 ? 'blue' : eff >= 0.95 ? 'green' : eff >= 0.85 ? 'amber' : 'red'}">${eff === null ? 'N/A' : eff > 1.0 ? 'Exceeded' : eff >= 0.95 ? 'On Target' : eff >= 0.85 ? 'Watch' : 'Below'}</span></td>
    </tr>`;
  }).join('');

  return `
    <div id="${panelId}" class="weekly-panel card" style="${visible ? '' : 'display:none'}">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:280px">
          <div class="card-title" style="margin-bottom:10px">${line} — Weekly Capacity vs Actual</div>
          <div class="chart-container" style="height:220px">
            <canvas id="${chartId}" aria-label="${line} weekly chart">${line} weekly data</canvas>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Week</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Machine Avail.</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function drawWeeklyCharts(line, month) {
  const weeks = getCapacityWeeklyPanelRows(line, month);
  if (!weeks.length) return;

  const chartId = 'weekly-chart-' + line.replace(/\s+/g, '-');
  const chartKey = 'weekly-' + line;
  destroyChart(chartKey);
  const ctx = document.getElementById(chartId);
  if (!ctx) return;

  const labels = weeks.map(w => w.week_label);
  const capData = weeks.map(w => w.cap);
  const actData = weeks.map(w => w.act);
  const effData = weeks.map(w => w.cap > 0 ? +(w.act / w.cap * 100).toFixed(2) : null);

  charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Capacity', data: capData, backgroundColor: 'rgba(59,130,246,0.25)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 3, order: 2 },
        { label: 'Actual', data: actData, backgroundColor: 'rgba(21,128,61,0.6)', borderColor: '#15803d', borderWidth: 1.5, borderRadius: 3, order: 2 },
        { type: 'line', label: 'Eff %', data: effData, borderColor: '#7c3aed', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#7c3aed', fill: false, tension: 0.3, yAxisID: 'y2', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { font: { size: 11 }, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Eff %') return ` Efficiency: ${ctx.parsed.y?.toFixed(2)}%`;
              return ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
            }
          }
        }
      },
      scales: {
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } }, title: { display: true, text: 'Units', font: { size: 10 } } },
        y2: { position: 'right', min: 0, max: 130, grid: { display: false }, ticks: { font: { size: 10 }, callback: v => v + '%' }, title: { display: true, text: 'Eff %', font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 40 } }
      }
    }
  });
}

// Called by tab buttons
window.switchWeeklyTab = function(line, btn) {
  // Toggle tab active state
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide panels
  document.querySelectorAll('.weekly-panel').forEach(p => p.style.display = 'none');
  const panelId = 'weekly-panel-' + line.replace(/\s+/g, '-');
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = '';

  // Draw chart for this line (lazy init — only draw once panel is visible)
  const month = document.getElementById('globalMonth')?.value || '';
  drawWeeklyCharts(line, month);
};
 
// ── MANHOURS DASHBOARD ─────────────────────────────────────────────────────────
function renderManhours(c, month, quarter = null) {
  const requestedMonth = month || '';
  const quarterMonths = quarter ? new Set((quarter.dataMonths || quarter.months || []).filter(Boolean)) : null;
  const quarterMonthList = quarterMonths ? [...quarterMonths].sort() : [];
  const allSummaryRows = getManhoursSummaryRows('');
  const allRunrateRows = getRunrateSummaryRows('');
  const latestDataMonth = (sourceRows) => {
    const months = [...new Set(sourceRows.map(r => r.month).filter(Boolean))].sort();
    return months.length ? months[months.length - 1] : '';
  };
  const inQuarter = r => !quarterMonths || quarterMonths.has(r.month);
  const requestedRunrateRows = quarter ? allRunrateRows.filter(inQuarter) : (requestedMonth ? allRunrateRows.filter(r => r.month === requestedMonth) : allRunrateRows);
  const requestedManhoursRows = quarter ? allSummaryRows.filter(inQuarter) : (requestedMonth ? allSummaryRows.filter(r => r.month === requestedMonth) : allSummaryRows);
  const runrateMonth = quarter ? '' : (requestedMonth && !requestedRunrateRows.length ? latestDataMonth(allRunrateRows) : requestedMonth);
  const manhoursMonth = quarter ? '' : (requestedMonth && !requestedManhoursRows.length ? latestDataMonth(allSummaryRows) : requestedMonth);
  const runrateRows = quarter ? requestedRunrateRows : (runrateMonth ? allRunrateRows.filter(r => r.month === runrateMonth) : allRunrateRows);
  const rows = quarter ? requestedManhoursRows : (manhoursMonth ? allSummaryRows.filter(r => r.month === manhoursMonth) : allSummaryRows);
  const quarterLabel = quarter
    ? `${quarter.label}${quarterMonthList.length ? ` (${quarterMonthList.map(fmtMonthLabel).join(', ')})` : ''}`
    : '';
  const runrateLabel = quarter ? quarter.label : (runrateMonth ? fmtMonthLabel(runrateMonth) : 'All Months');
  const manhoursLabel = quarter ? quarter.label : (manhoursMonth ? fmtMonthLabel(manhoursMonth) : 'All Months');
  const mLabel = quarter ? quarterLabel : (runrateLabel === manhoursLabel ? runrateLabel : `Runrate ${runrateLabel} / Manhours ${manhoursLabel}`);
  const fallbackNotes = [];
  if (quarter && !runrateRows.length) {
    fallbackNotes.push(`Runrate has no records in ${quarter.label}.`);
  }
  if (quarter && !rows.length) {
    fallbackNotes.push(`Manhours has no records in ${quarter.label}.`);
  }
  if (requestedMonth && runrateMonth && runrateMonth !== requestedMonth) {
    fallbackNotes.push(`Runrate has no ${fmtMonthLabel(requestedMonth)} records, so it is showing ${runrateLabel}.`);
  }
  if (requestedMonth && manhoursMonth && manhoursMonth !== requestedMonth) {
    fallbackNotes.push(`Manhours has no ${fmtMonthLabel(requestedMonth)} records, so it is showing ${manhoursLabel}.`);
  }
  const weeklyRunrateRows = !quarter && runrateMonth ? getWeeklyRunrateRows(runrateMonth) : [];
  const useExcelPeriodPlanning = !!quarter;

  let totalCapacity = 0, totalOutput = 0;
  const machineAvailabilityValues = [];
  runrateRows.forEach(r => {
    totalCapacity += r.capacity || 0;
    totalOutput += r.actual_output || 0;
    if (r.machine_availability != null) machineAvailabilityValues.push(Number(r.machine_availability));
  });
  const runrateEff = calcEfficiency(totalCapacity, totalOutput);
  const avgMachineAvailability = machineAvailabilityValues.length
    ? machineAvailabilityValues.reduce((a, b) => a + b, 0) / machineAvailabilityValues.length
    : null;
 
  function createManhoursBucket(line = '') {
    return {
      line,
      months: new Set(),
      pr: 0,
      ar: 0,
      pot: 0,
      aot: 0,
      abs: 0,
      personDays: 0,
      workingDays: 0,
      manpowerSum: 0,
      manpowerCount: 0
    };
  }

  function addManhoursRow(bucket, row) {
    if (row.month) bucket.months.add(row.month);
    bucket.pr += row.planned_reg || 0;
    bucket.ar += row.actual_reg || 0;
    bucket.pot += row.planned_ot || 0;
    bucket.aot += row.actual_ot || 0;
    bucket.abs += row.absenteeism || 0;
    bucket.personDays += row.person_days ?? calcPersonDays(row.working_days, row.manpower) ?? 0;

    const workingDays = Number(row.working_days);
    if (Number.isFinite(workingDays)) bucket.workingDays += workingDays;

    const manpower = Number(row.manpower);
    if (Number.isFinite(manpower)) {
      bucket.manpowerSum += manpower;
      bucket.manpowerCount++;
    }
  }

  function finalizeManhoursBucket(bucket, useExcelPlanning) {
    const out = { ...bucket, months: [...bucket.months].sort() };
    if (useExcelPlanning && out.workingDays > 0 && out.manpowerCount > 0) {
      const avgManpower = out.manpowerSum / out.manpowerCount;
      out.personDays = out.workingDays * avgManpower;
      out.pr = out.personDays * 8;
      out.pot = out.personDays * 4;
    }
    return out;
  }

  // aggregate
  const periodManhoursBuckets = new Map();
  const workdayValues = [];
  const manpowerValues = [];
  rows.forEach(r=>{
    const line = r.line || 'Plant-wide';
    if (!periodManhoursBuckets.has(line)) periodManhoursBuckets.set(line, createManhoursBucket(line));
    addManhoursRow(periodManhoursBuckets.get(line), r);
    if (r.working_days != null) workdayValues.push(Number(r.working_days));
    if (r.manpower != null) manpowerValues.push(Number(r.manpower));
  });
  const periodManhoursLineRows = [...periodManhoursBuckets.values()]
    .map(bucket => finalizeManhoursBucket(bucket, useExcelPeriodPlanning))
    .sort((a, b) => String(a.line).localeCompare(String(b.line)));
  const totPR = periodManhoursLineRows.reduce((sum, r) => sum + (r.pr || 0), 0);
  const totAR = periodManhoursLineRows.reduce((sum, r) => sum + (r.ar || 0), 0);
  const totPOT = periodManhoursLineRows.reduce((sum, r) => sum + (r.pot || 0), 0);
  const totAOT = periodManhoursLineRows.reduce((sum, r) => sum + (r.aot || 0), 0);
  const totAbs = periodManhoursLineRows.reduce((sum, r) => sum + (r.abs || 0), 0);
  const totPersonDays = periodManhoursLineRows.reduce((sum, r) => sum + (r.personDays || 0), 0);
  const regUtil=calcRegHrsUtil(totAR,totPR), otUtil=calcOTUtil(totAOT,totPOT);
  const otRate = calcOTRate(totAOT, totAR);
  const totalMhUtil = calcTotalManhoursUtil(totAR, totAOT, totPR, totPOT);
  const plannedPersonDays = totPR > 0 ? totPR / 8 : 0;
  const absPct = totPersonDays > 0 ? totAbs / totPersonDays : (plannedPersonDays > 0 ? totAbs / plannedPersonDays : null);
  const displayedPersonDays = totPersonDays > 0 ? totPersonDays : plannedPersonDays;
  const avgWorkdays = workdayValues.length ? workdayValues.reduce((a,b)=>a+b,0) / workdayValues.length : null;
  const avgManpower = manpowerValues.length ? manpowerValues.reduce((a,b)=>a+b,0) / manpowerValues.length : null;
 
  // trend
  const trendByMonth = {};
  const trendSourceRows = quarter ? rows : allSummaryRows;
  trendSourceRows.forEach(r => {
    if (!trendByMonth[r.month]) trendByMonth[r.month] = { month: r.month, pr: 0, ar: 0, pot: 0, aot: 0 };
    trendByMonth[r.month].pr += r.planned_reg || 0;
    trendByMonth[r.month].ar += r.actual_reg || 0;
    trendByMonth[r.month].pot += r.planned_ot || 0;
    trendByMonth[r.month].aot += r.actual_ot || 0;
  });
  const trendRows = Object.values(trendByMonth).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const trendLabels = trendRows.map(r=>fmtMonthLabel(r.month));
  const trendReg = trendRows.map(r=>calcRegHrsUtil(r.ar,r.pr));
  const trendOT = trendRows.map(r=>calcOTUtil(r.aot,r.pot));
  const trendOTRate = trendRows.map(r=>calcOTRate(r.aot,r.ar));

  // ── Quarterly summary (computed dynamically from all monthly records) ─────────
  function fiscalQuarter(isoMonth) {
    const mo = parseInt(isoMonth.split('-')[1], 10);
    const yr = parseInt(isoMonth.split('-')[0], 10);
    if (mo >= 10) return { q: 1, fy: yr + 1 };
    if (mo <= 3)  return { q: 2, fy: yr };
    if (mo <= 6)  return { q: 3, fy: yr };
    return         { q: 4, fy: yr };
  }
  function sameFiscalQuarter(monthA, monthB) {
    const a = fiscalQuarter(monthA);
    const b = fiscalQuarter(monthB);
    return a.q === b.q && a.fy === b.fy;
  }
  const runrateTrendByMonth = {};
  const runrateTrendSourceRows = quarter ? runrateRows : allRunrateRows;
  runrateTrendSourceRows.forEach(r => {
    if (!runrateTrendByMonth[r.month]) runrateTrendByMonth[r.month] = { month: r.month, cap: 0, act: 0, availability: [] };
    runrateTrendByMonth[r.month].cap += r.capacity || 0;
    runrateTrendByMonth[r.month].act += r.actual_output || 0;
    if (r.machine_availability != null) runrateTrendByMonth[r.month].availability.push(Number(r.machine_availability));
  });
  const runrateTrendRows = Object.values(runrateTrendByMonth).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const runrateTrendLabels = runrateTrendRows.map(r => fmtMonthLabel(r.month));
  const runrateTrendCap = runrateTrendRows.map(r => r.cap);
  const runrateTrendAct = runrateTrendRows.map(r => r.act);
  const runrateTrendEff = runrateTrendRows.map(r => calcEfficiency(r.cap, r.act));
  const runrateTrendAvailability = runrateTrendRows.map(r => r.availability.length
    ? r.availability.reduce((a, b) => a + b, 0) / r.availability.length
    : null);

  const runrateLineTotals = {};
  runrateRows.forEach(r => {
    const line = r.line || 'Plant-wide';
    if (!runrateLineTotals[line]) runrateLineTotals[line] = { line, cap: 0, act: 0, availability: [] };
    runrateLineTotals[line].cap += r.capacity || 0;
    runrateLineTotals[line].act += r.actual_output || 0;
    if (r.machine_availability != null) runrateLineTotals[line].availability.push(Number(r.machine_availability));
  });
  const runrateLineRows = Object.values(runrateLineTotals).sort((a, b) => String(a.line).localeCompare(String(b.line)));
  const runrateLineLabels = runrateLineRows.map(r => r.line);
  const runrateLineEff = runrateLineRows.map(r => {
    const eff = calcEfficiency(r.cap, r.act);
    return eff === null ? null : eff * 100;
  });

  const runrateQuarterRows = quarter ? runrateRows : (runrateMonth ? allRunrateRows.filter(r => sameFiscalQuarter(r.month, runrateMonth)) : allRunrateRows);
  const runrateByQuarter = {};
  runrateQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!runrateByQuarter[key]) runrateByQuarter[key] = { cap:0, act:0, months:[] };
    runrateByQuarter[key].cap += r.capacity || 0;
    runrateByQuarter[key].act += r.actual_output || 0;
    if (!runrateByQuarter[key].months.includes(r.month)) runrateByQuarter[key].months.push(r.month);
  });
  const runrateQKeys = Object.keys(runrateByQuarter).sort((a,b) => {
    const [,fyA,qA]=a.match(/FY(\d+) Q(\d)/); const [,fyB,qB]=b.match(/FY(\d+) Q(\d)/);
    return fyA!==fyB ? fyA-fyB : qA-qB;
  });

  const manhoursQuarterRows = quarter ? rows : (manhoursMonth ? allSummaryRows.filter(r => sameFiscalQuarter(r.month, manhoursMonth)) : allSummaryRows);
  const mhByQuarter = {};
  manhoursQuarterRows.forEach(r => {
    const { q, fy } = fiscalQuarter(r.month);
    const key = `FY${fy} Q${q}`;
    if (!mhByQuarter[key]) mhByQuarter[key] = createManhoursBucket(key);
    addManhoursRow(mhByQuarter[key], r);
  });
  const mhQKeys = Object.keys(mhByQuarter).sort((a,b) => {
    const [,fyA,qA]=a.match(/FY(\d+) Q(\d)/); const [,fyB,qB]=b.match(/FY(\d+) Q(\d)/);
    return fyA!==fyB ? fyA-fyB : qA-qB;
  });
  const finalizedMhByQuarter = {};
  mhQKeys.forEach(k => {
    finalizedMhByQuarter[k] = finalizeManhoursBucket(mhByQuarter[k], true);
  });

  const manhoursLineRows = periodManhoursLineRows.map(r => ({
    line: r.line,
    planned: (r.pr || 0) + (r.pot || 0),
    actual: (r.ar || 0) + (r.aot || 0)
  }));
  const manhoursLineLabels = manhoursLineRows.map(r => r.line);
  const manhoursLineUtil = manhoursLineRows.map(r => r.planned > 0 ? (r.actual / r.planned) * 100 : null);

  const runrateFocusBuckets = new Map();
  const runrateFocusUsesWeekly = !!runrateMonth && weeklyRunrateRows.length > 0;
  const runrateFocusRows = runrateFocusUsesWeekly ? weeklyRunrateRows : runrateRows;

  function addRunrateFocusPoint(line, pointKey, pointLabel, pointOrder, capacity, actual) {
    const addToSeries = (seriesKey, seriesLabel, rank) => {
      if (!runrateFocusBuckets.has(seriesKey)) {
        runrateFocusBuckets.set(seriesKey, { key: seriesKey, line: seriesLabel, rank, points: new Map() });
      }
      const series = runrateFocusBuckets.get(seriesKey);
      if (!series.points.has(pointKey)) {
        series.points.set(pointKey, { key: pointKey, label: pointLabel, order: pointOrder, cap: 0, act: 0 });
      }
      const point = series.points.get(pointKey);
      point.cap += capacity || 0;
      point.act += actual || 0;
    };

    const lineLabel = line || 'Plant-wide';
    addToSeries('__plant__', 'Plant-wide', 0);
    if (lineLabel !== 'Plant-wide') addToSeries(lineLabel, lineLabel, 1);
  }

  runrateFocusRows.forEach(r => {
    const pointKey = runrateFocusUsesWeekly
      ? `${r.month || ''}|${r.week_num || r.week_label || ''}`
      : (r.month || runrateLabel);
    const pointLabel = runrateFocusUsesWeekly
      ? (r.week_label || `Week ${r.week_num || ''}`.trim())
      : (r.month ? fmtMonthLabel(r.month) : runrateLabel);
    const pointOrder = runrateFocusUsesWeekly
      ? (r.week_num || r.week_label || 0)
      : (r.month || runrateLabel);
    addRunrateFocusPoint(r.line, pointKey, pointLabel, pointOrder, r.capacity, r.actual_output);
  });

  const runrateFocusSeries = [...runrateFocusBuckets.values()]
    .map(series => {
      const points = [...series.points.values()].sort((a, b) => {
        if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order;
        return String(a.order).localeCompare(String(b.order));
      });
      const cap = points.reduce((sum, p) => sum + (p.cap || 0), 0);
      const act = points.reduce((sum, p) => sum + (p.act || 0), 0);
      return { ...series, points, cap, act, eff: calcEfficiency(cap, act) };
    })
    .filter(series => series.points.length)
    .sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : String(a.line).localeCompare(String(b.line)));

  const capacityGap = runrateRows.length ? totalCapacity - totalOutput : null;
  const capacityGapText = capacityGap === null
    ? '&mdash;'
    : capacityGap >= 0
      ? `${fmtN(capacityGap, 0)} below capacity`
      : `${fmtN(Math.abs(capacityGap), 0)} above capacity`;
  const runrateHealthClass = runrateEff === null ? 'stat-neutral' : runrateEff >= 0.95 ? 'stat-good' : runrateEff >= 0.85 ? 'stat-watch' : 'stat-bad';
  const gapHealthClass = capacityGap === null ? 'stat-neutral' : capacityGap <= 0 ? 'stat-good' : runrateEff >= 0.85 ? 'stat-watch' : 'stat-bad';
  const availabilityHealthClass = avgMachineAvailability === null ? 'stat-neutral' : avgMachineAvailability >= 0.9 ? 'stat-good' : avgMachineAvailability >= 0.8 ? 'stat-watch' : 'stat-bad';
  const runrateFocusTitle = runrateFocusUsesWeekly
    ? `Output Capacity vs Actual by Week - ${runrateLabel}`
    : `Output Capacity vs Actual by Month - ${runrateLabel}`;
  const runrateFocusContext = runrateFocusUsesWeekly
    ? 'Weekly runrate entries'
    : quarter
      ? 'Monthly rollup for selected quarter'
      : runrateMonth
      ? 'Manual monthly runrate entries'
      : 'Monthly rollup across available data';
 
  c.innerHTML = `
    <div class="page-header">
      <h1>Runrate &amp; Manhours Dashboard</h1>
      <p>Weekly runrate efficiency and monthly manhours utilization - ${mLabel}</p>
    </div>
    ${fallbackNotes.length ? `<div class="info-block">${fallbackNotes.join(' ')}</div>` : ''}
    <div class="runrate-overview section-gap">
      <div class="overview-stat">
        <div class="overview-label">Capacity</div>
        <div class="overview-value">${runrateRows.length ? fmtN(totalCapacity,0) : '&mdash;'}</div>
        <div class="overview-sub">planned output</div>
      </div>
      <div class="overview-stat">
        <div class="overview-label">Actual Output</div>
        <div class="overview-value">${runrateRows.length ? fmtN(totalOutput,0) : '&mdash;'}</div>
        <div class="overview-sub">produced output</div>
      </div>
      <div class="overview-stat ${runrateHealthClass}">
        <div class="overview-label">Efficiency</div>
        <div class="overview-value">${runrateEff !== null ? (runrateEff*100).toFixed(2)+'%' : '&mdash;'}</div>
        <div class="overview-sub">${totalCapacity > 0 ? `${fmtN(totalOutput,0)} / ${fmtN(totalCapacity,0)}` : 'No runrate data'}</div>
      </div>
      <div class="overview-stat ${gapHealthClass}">
        <div class="overview-label">Capacity Gap</div>
        <div class="overview-value">${capacityGapText}</div>
        <div class="overview-sub">actual vs planned</div>
      </div>
      <div class="overview-stat ${availabilityHealthClass}">
        <div class="overview-label">Machine Availability</div>
        <div class="overview-value">${avgMachineAvailability !== null ? (avgMachineAvailability*100).toFixed(2)+'%' : '&mdash;'}</div>
        <div class="overview-sub">${machineAvailabilityValues.length ? `${fmtN(machineAvailabilityValues.length,0)} records` : 'No availability data'}</div>
      </div>
    </div>

    <div class="card runrate-focus-card section-gap">
      <div class="runrate-focus-head">
        <div>
          <div class="card-title">${runrateFocusTitle}</div>
          <div class="card-subtitle">${runrateFocusContext}</div>
        </div>
        ${runrateFocusSeries.length > 1 ? `
          <div class="runrate-focus-tabs" aria-label="Runrate line focus">
            ${runrateFocusSeries.map((series, i) => `<button type="button" class="focus-tab ${i === 0 ? 'active' : ''}" data-runrate-focus="${i}">${series.line}</button>`).join('')}
          </div>` : ''}
      </div>
      <div class="chart-container chart-container-lg">
        ${runrateFocusSeries.length ? '<canvas id="runrateCapacityActualChart" aria-label="Output capacity versus actual">Output capacity versus actual</canvas>' : '<div class="empty"><p>No runrate capacity data yet.</p></div>'}
      </div>
    </div>

    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Monthly Efficiency &amp; Availability</div>
        <div class="chart-container">
          ${runrateTrendLabels.length ? '<canvas id="runrateTrendChart" aria-label="Runrate monthly trend">Runrate monthly trend</canvas>' : '<div class="empty"><p>No runrate trend data yet.</p></div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Runrate Efficiency by Line</div>
        <div class="chart-container">
          ${runrateLineLabels.length ? '<canvas id="runrateLineChart" aria-label="Runrate efficiency by line">Runrate efficiency by line</canvas>' : `<div class="empty"><p>No runrate line data for ${runrateLabel}.</p></div>`}
        </div>
      </div>
    </div>

    <details class="detail-disclosure section-gap">
      <summary>
        <span>Runrate detail tables</span>
        <small>${runrateRows.length ? `${fmtN(runrateRows.length,0)} monthly rows` : 'No monthly rows'}${weeklyRunrateRows.length ? ` / ${fmtN(weeklyRunrateRows.length,0)} weekly rows` : ''}</small>
      </summary>

    ${runrateQKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Runrate Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months</th><th>Capacity</th><th>Actual</th><th>Efficiency</th></tr></thead>
          <tbody>
            ${runrateQKeys.map(k => {
              const q = runrateByQuarter[k];
              const eff = calcEfficiency(q.cap, q.act);
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${fmtN(q.cap,0)}</td>
                <td class="td-number">${fmtN(q.act,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Monthly Runrate by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Machine Avail.</th><th>Weekly Rows</th></tr></thead>
          <tbody>
            ${runrateRows.length ? runrateRows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'&mdash;'}</td>
                <td class="td-number">${fmtN(r.capacity,0)}</td>
                <td class="td-number">${fmtN(r.actual_output,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
                <td class="td-number">${r.machine_availability != null ? (r.machine_availability*100).toFixed(2)+'%' : '&mdash;'}</td>
                <td class="td-number">${r.weekly_count ? fmtN(r.weekly_count,0) : 'monthly total'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="7"><div class="empty"><p>No runrate data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Weekly Runrate Details</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Week</th><th>Capacity</th><th>Actual</th><th>Efficiency</th><th>Machine Avail.</th></tr></thead>
          <tbody>
            ${weeklyRunrateRows.length ? weeklyRunrateRows.map(r => {
              const eff = calcEfficiency(r.capacity, r.actual_output);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'&mdash;'}</td>
                <td><strong>${r.week_label||'&mdash;'}</strong></td>
                <td class="td-number">${fmtN(r.capacity,0)}</td>
                <td class="td-number">${fmtN(r.actual_output,0)}</td>
                <td class="td-number"><strong class="${eff&&eff>=0.95?'td-green':eff&&eff<0.85?'td-red':''}">${eff!==null?(eff*100).toFixed(2)+'%':'&mdash;'}</strong></td>
                <td class="td-number">${r.machine_availability != null ? (r.machine_availability*100).toFixed(2)+'%' : '&mdash;'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="7"><div class="empty"><p>No weekly runrate data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    </details>

    <div class="section-gap">
      <div class="card-title" style="margin-bottom:12px;color:var(--gray-500)">MANHOURS - ${manhoursLabel}</div>
    </div>
    <div class="metrics-grid section-gap">
      <div class="metric-card">
        <div class="metric-label">Regular Hrs Utilization</div>
        <div class="metric-value">${regUtil !== null ? (regUtil*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${fmtN(totAR,1)} / ${fmtN(totPR,0)} hrs</div>
        <div class="progress-bar"><div class="progress-fill ${regUtil>=0.9?'progress-green':regUtil>=0.8?'progress-amber':'progress-red'}" style="width:${regUtil?Math.min(regUtil*100,100):0}%"></div></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">OT Utilization</div>
        <div class="metric-value">${otUtil !== null ? (otUtil*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${fmtN(totAOT,1)} / ${fmtN(totPOT,0)} hrs</div>
        <div class="progress-bar"><div class="progress-fill ${otUtil>=0.9?'progress-green':otUtil>=0.7?'progress-amber':'progress-red'}" style="width:${otUtil?Math.min(otUtil*100,100):0}%"></div></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">OT Rate</div>
        <div class="metric-value">${otRate !== null ? (otRate*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">OT share of actual manhours</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Absenteeism</div>
        <div class="metric-value">${fmtN(totAbs,0)}</div>
        <div class="metric-sub">person-days absent${absPct !== null ? ` · <strong>${(absPct*100).toFixed(2)}%</strong> of planned days` : ''}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Planned Person-Days</div>
        <div class="metric-value">${displayedPersonDays > 0 ? fmtN(displayedPersonDays,1) : '—'}</div>
        <div class="metric-sub">${totPersonDays > 0 ? 'Working days x manpower' : 'Derived from planned regular hours'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Manpower / Days</div>
        <div class="metric-value">${avgManpower !== null ? fmtN(avgManpower,1) : '—'}</div>
        <div class="metric-sub">${avgWorkdays !== null ? `${fmtN(avgWorkdays,1)} avg working days` : 'No working-days data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Manhours Worked</div>
        <div class="metric-value">${fmtN(totAR+totAOT,0)}</div>
        <div class="metric-sub">Reg + OT actual${totalMhUtil !== null ? ` · <strong>${(totalMhUtil*100).toFixed(2)}%</strong> total utilization` : ''}</div>
      </div>
    </div>
    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Manhours Utilization Trend</div>
        <div class="chart-container">
          ${trendLabels.length ? '<canvas id="mhTrendChart" aria-label="Manhours utilization trend">Manhours trend</canvas>' : '<div class="empty"><p>No manhours trend data yet.</p></div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Planned vs Actual Manhours</div>
        <div class="chart-container">
          ${trendLabels.length ? '<canvas id="mhPlanActualChart" aria-label="Planned versus actual manhours">Planned versus actual manhours</canvas>' : '<div class="empty"><p>No planned/actual manhours data yet.</p></div>'}
        </div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Manhours Utilization by Line</div>
      <div class="chart-container">
        ${manhoursLineLabels.length ? '<canvas id="mhLineChart" aria-label="Manhours utilization by line">Manhours utilization by line</canvas>' : `<div class="empty"><p>No manhours line data for ${manhoursLabel}.</p></div>`}
      </div>
    </div>

    <details class="detail-disclosure section-gap">
      <summary>
        <span>Manhours detail tables</span>
        <small>${rows.length ? `${fmtN(rows.length,0)} line records` : 'No line records'}</small>
      </summary>

    ${mhQKeys.length ? `
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">Quarterly Manhours Summary</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Quarter</th><th>Months</th><th>Person-Days</th><th>Planned Reg</th><th>Actual Reg</th><th>Reg Util%</th><th>Planned OT</th><th>Actual OT</th><th>OT Util%</th><th>OT Rate</th><th>Absenteeism</th><th>Absent %</th></tr></thead>
          <tbody>
            ${mhQKeys.map(k => {
              const q = finalizedMhByQuarter[k];
              const ru = calcRegHrsUtil(q.ar, q.pr);
              const ou = calcOTUtil(q.aot, q.pot);
              const otr = calcOTRate(q.aot, q.ar);
              const personDays = q.personDays > 0 ? q.personDays : (q.pr > 0 ? q.pr / 8 : null);
              const absRate = personDays > 0 && q.abs != null ? q.abs / personDays : null;
              return `<tr>
                <td><strong>${k}</strong></td>
                <td style="color:var(--gray-500);font-size:12px">${q.months.map(fmtMonthLabel).join(', ')}</td>
                <td class="td-number">${personDays !== null ? fmtN(personDays,1) : '—'}</td>
                <td class="td-number">${fmtN(q.pr,0)}</td>
                <td class="td-number">${fmtN(q.ar,1)}</td>
                <td class="td-number"><strong class="${ru&&ru>=0.9?'td-green':ru&&ru<0.8?'td-red':''}">${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(q.pot,0)}</td>
                <td class="td-number">${fmtN(q.aot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number"><strong>${otr!==null?(otr*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(q.abs,0)}</td>
                <td class="td-number">${absRate!==null?(absRate*100).toFixed(2)+'%':'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Records by Line</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Line</th><th>Working Days</th><th>Manpower</th><th>Person-Days</th><th>Planned Reg</th><th>Actual Reg</th><th>Reg Util%</th><th>Planned OT</th><th>Actual OT</th><th>OT Util%</th><th>OT Rate</th><th>Total Util%</th><th>Absent</th><th>Absent %</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(r=>{
              const ru=calcRegHrsUtil(r.actual_reg,r.planned_reg), ou=calcOTUtil(r.actual_ot,r.planned_ot);
              const rowPersonDays = r.person_days ?? calcPersonDays(r.working_days, r.manpower);
              const rowAbsPct = rowPersonDays > 0 && r.absenteeism != null
                ? r.absenteeism / rowPersonDays
                : calcAbsenteeismRate(r.absenteeism, r.working_days, r.manpower, r.planned_reg);
              const totalUtil = calcTotalManhoursUtil(r.actual_reg, r.actual_ot, r.planned_reg, r.planned_ot);
              const rowOTRate = calcOTRate(r.actual_ot, r.actual_reg);
              return `<tr>
                <td>${fmtMonthLabel(r.month)}</td>
                <td>${r.line||'—'}</td>
                <td class="td-number">${r.working_days!=null?fmtN(r.working_days,1):'—'}</td>
                <td class="td-number">${r.manpower!=null?fmtN(r.manpower,1):'—'}</td>
                <td class="td-number">${rowPersonDays!==null?fmtN(rowPersonDays,1):'—'}</td>
                <td class="td-number">${fmtN(r.planned_reg,0)}</td>
                <td class="td-number">${fmtN(r.actual_reg,1)}</td>
                <td class="td-number"><strong class="${ru&&ru>=0.9?'td-green':ru&&ru<0.8?'td-red':''}">${ru!==null?(ru*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${fmtN(r.planned_ot,0)}</td>
                <td class="td-number">${fmtN(r.actual_ot,1)}</td>
                <td class="td-number"><strong>${ou!==null?(ou*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number"><strong>${rowOTRate!==null?(rowOTRate*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number"><strong>${totalUtil!==null?(totalUtil*100).toFixed(2)+'%':'—'}</strong></td>
                <td class="td-number">${r.absenteeism!=null?fmtN(r.absenteeism,1):'—'}</td>
                <td class="td-number">${rowAbsPct!==null?((rowAbsPct*100).toFixed(2)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="15"><div class="empty"><p>No manhours data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    </details>
  `;

  destroyChart('runrateCapacityActual');
  const runrateCapacityCtx = document.getElementById('runrateCapacityActualChart');
  if (runrateCapacityCtx && runrateFocusSeries.length) {
    const focusTabs = [...c.querySelectorAll('[data-runrate-focus]')];
    const pointLabelPlugin = {
      id: 'runrateCapacityPointLabels',
      afterDatasetsDraw(chart) {
        const labels = chart.data.labels || [];
        if (labels.length > 7 || chart.width < 420) return;
        const { ctx } = chart;
        ctx.save();
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          ctx.fillStyle = dataset.borderColor;
          ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
          ctx.textAlign = 'center';
          meta.data.forEach((point, index) => {
            const value = dataset.data[index];
            if (value == null) return;
            ctx.textBaseline = datasetIndex === 0 ? 'bottom' : 'top';
            const offset = datasetIndex === 0 ? -7 : 7;
            ctx.fillText(fmtN(value, 0), point.x, point.y + offset);
          });
        });
        ctx.restore();
      }
    };

    const displayRunrateLabel = label => {
      const match = String(label).match(/^([A-Za-z]{3})\s+WEEK\s+(.+)$/);
      return match ? [match[1].toUpperCase(), `WEEK ${match[2]}`] : label;
    };

    const drawRunrateCapacityActual = index => {
      const series = runrateFocusSeries[index] || runrateFocusSeries[0];
      destroyChart('runrateCapacityActual');
      focusTabs.forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index));

      charts['runrateCapacityActual'] = new Chart(runrateCapacityCtx, {
        type: 'line',
        data: {
          labels: series.points.map(p => displayRunrateLabel(p.label)),
          datasets: [
            {
              label: 'Capacity',
              data: series.points.map(p => p.cap),
              borderColor: '#0f5f83',
              backgroundColor: 'rgba(15,95,131,0.08)',
              pointBackgroundColor: '#0f5f83',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 5,
              borderWidth: 3,
              tension: 0.25
            },
            {
              label: 'Actual',
              data: series.points.map(p => p.act),
              borderColor: '#ea580c',
              backgroundColor: 'rgba(234,88,12,0.08)',
              pointBackgroundColor: '#ea580c',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 5,
              borderWidth: 3,
              tension: 0.25
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { size: 11 }, boxWidth: 18, usePointStyle: true, pointStyle: 'line' }
            },
            tooltip: {
              callbacks: {
                afterBody: items => {
                  if (!items.length) return '';
                  const idx = items[0].dataIndex;
                  const point = series.points[idx];
                  const eff = calcEfficiency(point.cap, point.act);
                  return eff !== null ? `Efficiency: ${(eff * 100).toFixed(2)}%` : '';
                }
              }
            }
          },
          scales: {
            y: {
              grace: '10%',
              grid: { color: '#e2e8f0' },
              ticks: { font: { size: 11 }, callback: v => fmtN(v, 0) },
              title: { display: true, text: 'Output units', font: { size: 11, weight: '600' } }
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: false }
            }
          }
        },
        plugins: [pointLabelPlugin]
      });
    };

    focusTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => drawRunrateCapacityActual(index));
    });
    drawRunrateCapacityActual(0);
  }
 
  destroyChart('runrateTrend');
  const runrateTrendCtx = document.getElementById('runrateTrendChart');
  if (runrateTrendCtx && runrateTrendLabels.length) {
    charts['runrateTrend'] = new Chart(runrateTrendCtx, {
      type: 'bar',
      data: {
        labels: runrateTrendLabels,
        datasets: [
          { label: 'Capacity', data: runrateTrendCap, backgroundColor: 'rgba(59,130,246,0.35)', borderRadius: 4, yAxisID: 'y' },
          { label: 'Actual', data: runrateTrendAct, backgroundColor: 'rgba(20,184,166,0.55)', borderRadius: 4, yAxisID: 'y' },
          { type: 'line', label: 'Efficiency %', data: runrateTrendEff.map(v => v === null ? null : v * 100), borderColor: '#d97706', borderWidth: 2, tension: 0.3, pointRadius: 3, yAxisID: 'yPct' },
          { type: 'line', label: 'Machine Avail. %', data: runrateTrendAvailability.map(v => v === null ? null : v * 100), borderColor: '#7c3aed', borderDash: [3, 3], borderWidth: 2, tension: 0.3, pointRadius: 3, yAxisID: 'yPct' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { font:{size:11}, boxWidth:10 } } },
        scales: {
          y: { position: 'left', grid:{color:'#f1f5f9'}, ticks:{font:{size:11}} },
          yPct: { position: 'right', grid:{drawOnChartArea:false}, ticks:{font:{size:11}, callback:v=>v.toFixed(0)+'%'} },
          x: { grid:{display:false}, ticks:{font:{size:11}, maxRotation:45} }
        }
      }
    });
  }

  destroyChart('runrateLine');
  const runrateLineCtx = document.getElementById('runrateLineChart');
  if (runrateLineCtx && runrateLineLabels.length) {
    charts['runrateLine'] = new Chart(runrateLineCtx, {
      type: 'bar',
      data: {
        labels: runrateLineLabels,
        datasets: [{
          label: 'Efficiency %',
          data: runrateLineEff,
          backgroundColor: runrateLineEff.map(v => v == null ? '#cbd5e1' : v >= 95 ? '#0d9488' : v >= 85 ? '#d97706' : '#dc2626'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display:false } },
        scales: {
          x: { grid:{color:'#f1f5f9'}, ticks:{font:{size:11}, callback:v=>v.toFixed(0)+'%'} },
          y: { grid:{display:false}, ticks:{font:{size:11}} }
        }
      }
    });
  }

  destroyChart('mhTrend');
  const ctx=document.getElementById('mhTrendChart');
  if(ctx && trendLabels.length){
    charts['mhTrend']=new Chart(ctx,{
      type:'line',
      data:{labels:trendLabels,datasets:[
        {label:'Reg Util%',data:trendReg.map(v=>v?v*100:null),borderColor:'#1a56db',tension:0.3,pointRadius:3},
        {label:'OT Util%',data:trendOT.map(v=>v?v*100:null),borderColor:'#d97706',borderDash:[4,3],tension:0.3,pointRadius:3},
        {label:'OT Rate%',data:trendOTRate.map(v=>v?v*100:null),borderColor:'#7c3aed',borderDash:[2,3],tension:0.3,pointRadius:3}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{ticks:{font:{size:11},callback:v=>v.toFixed(0)+'%'},grid:{color:'#f1f5f9'}},
          x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45}}}}
    });
  }

  destroyChart('mhPlanActual');
  const mhPlanCtx = document.getElementById('mhPlanActualChart');
  if (mhPlanCtx && trendLabels.length) {
    charts['mhPlanActual'] = new Chart(mhPlanCtx, {
      type:'bar',
      data:{labels:trendLabels,datasets:[
        {label:'Planned',data:trendRows.map(r => (r.pr || 0) + (r.pot || 0)),backgroundColor:'rgba(59,130,246,0.35)',borderRadius:4},
        {label:'Actual',data:trendRows.map(r => (r.ar || 0) + (r.aot || 0)),backgroundColor:'rgba(20,184,166,0.55)',borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{grid:{color:'#f1f5f9'},ticks:{font:{size:11}}},
          x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45}}}}
    });
  }

  destroyChart('mhLine');
  const mhLineCtx = document.getElementById('mhLineChart');
  if (mhLineCtx && manhoursLineLabels.length) {
    charts['mhLine'] = new Chart(mhLineCtx, {
      type:'bar',
      data:{labels:manhoursLineLabels,datasets:[{
        label:'Total Utilization %',
        data:manhoursLineUtil,
        backgroundColor:manhoursLineUtil.map(v => v == null ? '#cbd5e1' : v >= 90 ? '#0d9488' : v >= 80 ? '#d97706' : '#dc2626'),
        borderRadius:4
      }]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{color:'#f1f5f9'},ticks:{font:{size:11},callback:v=>v.toFixed(0)+'%'}},
          y:{grid:{display:false},ticks:{font:{size:11}}}}}
    });
  }
}
 
// ── LOSS DASHBOARD ─────────────────────────────────────────────────────────────
// Signature change: renderLoss(c, month, quarter)
//   month   — a specific YYYY-MM string, or '' for no month filter
//   quarter — a quarter descriptor { fy, q, months, dataMonths, label }
//             or null if not in quarter mode
//
// Priority: quarter > month > all months

function renderLoss(c, month, quarter) {

  // ── Determine which months to include ───────────────────────────────────────
  // selectedMonths: array of YYYY-MM to filter on, or [] for all
  let selectedMonths = [];
  let mLabel = 'All Months';
  let isQuarterMode = false;

  if (quarter) {
    // Quarter selection: use only the months in that quarter that have data
    selectedMonths = quarter.dataMonths || quarter.months;
    mLabel = quarter.label;
    isQuarterMode = true;
  } else if (month) {
    // Specific month
    selectedMonths = [month];
    mLabel = fmtMonthLabel(month);
  }
  // else: all months, selectedMonths stays []

  const inSelectedPeriod = row =>
    selectedMonths.length === 0 || selectedMonths.includes(row.month);

  // ── Pull raw data ────────────────────────────────────────────────────────────
  const allRunrateRows = getRunrateSummaryRows('');
  const allManhoursRows = getManhoursSummaryRows('');
  const rrRows = allRunrateRows.filter(inSelectedPeriod);
  const mhRows = allManhoursRows.filter(inSelectedPeriod);

  const periodMonths = [...new Set([...rrRows, ...mhRows].map(r => r.month).filter(Boolean))].sort();

  // Build a readable subtitle
  let periodLabel = mLabel;
  if (isQuarterMode && periodMonths.length) {
    periodLabel = `${mLabel} (${periodMonths.map(fmtMonthLabel).join(', ')})`;
  }

  // ── Per-line aggregation ─────────────────────────────────────────────────────
  const lineBuckets = new Map();
  const getBucket = line => {
    const label = line || 'Plant-wide';
    if (!lineBuckets.has(label)) {
      lineBuckets.set(label, {
        line: label,
        months: new Set(),
        _rrCap: 0, _rrAct: 0,
        _personDays: 0, _absDays: 0,
        _plannedMH: 0, _actualMH: 0
      });
    }
    return lineBuckets.get(label);
  };

  rrRows.forEach(r => {
    const bucket = getBucket(r.line);
    if (r.month) bucket.months.add(r.month);
    bucket._rrCap += r.capacity || 0;
    bucket._rrAct += r.actual_output || 0;
  });

  mhRows.forEach(r => {
    const bucket = getBucket(r.line);
    if (r.month) bucket.months.add(r.month);
    bucket._personDays += r.person_days ?? calcPersonDays(r.working_days, r.manpower) ?? 0;
    bucket._absDays    += r.absenteeism || 0;
    bucket._plannedMH  += (r.planned_reg || 0) + (r.planned_ot || 0);
    bucket._actualMH   += (r.actual_reg  || 0) + (r.actual_ot  || 0);
  });

  const rows = [...lineBuckets.values()]
    .sort((a, b) => String(a.line).localeCompare(String(b.line)))
    .map(bucket => {
      const runrateLoss = bucket._rrCap > 0 ? 1 - (bucket._rrAct / bucket._rrCap) : null;
      const absLoss     = bucket._personDays > 0 ? bucket._absDays / bucket._personDays : null;
      const mhLoss      = bucket._plannedMH  > 0 ? 1 - (bucket._actualMH / bucket._plannedMH) : null;
      const rowTotal    = (runrateLoss || 0) + (absLoss || 0) + (mhLoss || 0);
      return {
        ...bucket,
        monthList: [...bucket.months].sort().map(fmtMonthLabel).join(', '),
        runrateLoss, absLoss, mhLoss,
        total: rowTotal,
        runPct: rowTotal > 0 && runrateLoss != null ? runrateLoss / rowTotal : null,
        absPct: rowTotal > 0 && absLoss     != null ? absLoss     / rowTotal : null,
        mhPct:  rowTotal > 0 && mhLoss      != null ? mhLoss      / rowTotal : null
      };
    });

  // ── Plant-wide aggregates ────────────────────────────────────────────────────
  let totalCap = 0, totalAct = 0;
  let totalPersonDays = 0, totalAbsDays = 0;
  let totalPlannedMH = 0, totalActualMH = 0;

  rows.forEach(r => {
    totalCap        += r._rrCap;
    totalAct        += r._rrAct;
    totalPersonDays += r._personDays;
    totalAbsDays    += r._absDays;
    totalPlannedMH  += r._plannedMH;
    totalActualMH   += r._actualMH;
  });

  const aggRunLoss = totalCap        > 0 ? 1 - totalAct       / totalCap        : null;
  const aggAbsLoss = totalPersonDays > 0 ? totalAbsDays        / totalPersonDays  : null;
  const aggMhLoss  = totalPlannedMH  > 0 ? 1 - totalActualMH  / totalPlannedMH   : null;

  const aggTotal  = (aggRunLoss || 0) + (aggAbsLoss || 0) + (aggMhLoss || 0);
  const aggRunPct = aggTotal > 0 && aggRunLoss != null ? aggRunLoss / aggTotal : null;
  const aggAbsPct = aggTotal > 0 && aggAbsLoss != null ? aggAbsLoss / aggTotal : null;
  const aggMhPct  = aggTotal > 0 && aggMhLoss  != null ? aggMhLoss  / aggTotal : null;

  const hasData = rows.length > 0;
  const contribClass = pct => pct > 0.5 ? 'td-red' : pct > 0.25 ? 'td-amber' : '';

  c.innerHTML = `
    <div class="page-header">
      <h1>Loss Analysis</h1>
      <p>Derived from Runrate Efficiency &amp; Manhours data — <strong>${periodLabel}</strong></p>
    </div>
    <div class="info-block" style="margin-bottom:20px">
      <strong>Fully derived.</strong>
      Runrate Loss = 1 − (Actual ÷ Capacity) &nbsp;|&nbsp;
      Absenteeism Loss = Absences ÷ (Working Days × Manpower) &nbsp;|&nbsp;
      Manhours Loss = 1 − (Actual MH ÷ Planned MH) &nbsp;|&nbsp;
      % Contribution = Individual Loss ÷ Sum of All Three
    </div>

    <div class="metrics-grid section-gap">
      <div class="metric-card">
        <div class="metric-label">Runrate Loss %</div>
        <div class="metric-value">${aggRunLoss !== null ? (aggRunLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggRunPct !== null ? 'Contrib: '+(aggRunPct*100).toFixed(1)+'% of total' : 'no runrate data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Absenteeism Loss %</div>
        <div class="metric-value">${aggAbsLoss !== null ? (aggAbsLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggAbsPct !== null ? 'Contrib: '+(aggAbsPct*100).toFixed(1)+'% of total' : 'no manhours data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Manhours Loss %</div>
        <div class="metric-value">${aggMhLoss !== null ? (aggMhLoss*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">${aggMhPct !== null ? 'Contrib: '+(aggMhPct*100).toFixed(1)+'% of total' : 'no manhours data'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Loss</div>
        <div class="metric-value">${aggTotal > 0 ? (aggTotal*100).toFixed(2)+'%' : '—'}</div>
        <div class="metric-sub">sum of three loss types</div>
      </div>
    </div>

    <div class="grid-2 section-gap">
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">% Contribution Factor</div>
        <div class="chart-container">
          <canvas id="lossPieChart" aria-label="Loss contribution factor">Loss contribution breakdown</canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:14px">Loss Breakdown</div>
        ${hasData ? `
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Runrate Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggRunLoss !== null ? (aggRunLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--amber)">${aggRunPct !== null ? (aggRunPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill progress-amber" style="width:${aggRunPct ? Math.min(aggRunPct*100,100) : 0}%"></div></div>
          </div>
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Absenteeism Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggAbsLoss !== null ? (aggAbsLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--red)">${aggAbsPct !== null ? (aggAbsPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill progress-red" style="width:${aggAbsPct ? Math.min(aggAbsPct*100,100) : 0}%"></div></div>
          </div>
          <div style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
              <span style="font-weight:600">Manhours Loss</span>
              <span>
                <span style="color:var(--gray-500);font-size:12px;margin-right:8px">${aggMhLoss !== null ? (aggMhLoss*100).toFixed(2)+'%' : '—'}</span>
                <strong style="color:var(--blue)">${aggMhPct !== null ? (aggMhPct*100).toFixed(1)+'%' : '—'}</strong>
              </span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="background:var(--blue);width:${aggMhPct ? Math.min(aggMhPct*100,100) : 0}%"></div></div>
          </div>
          <div style="font-size:11px;color:var(--gray-400);padding-top:8px;border-top:1px solid var(--gray-200)">
            Left value = raw loss %; bold right value = % contribution factor
          </div>
        ` : '<div class="empty"><p>No data yet. Enter Runrate Efficiency and Manhours data first.</p></div>'}
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="card-title">Loss by Line — ${mLabel}</div>
        ${!month && !quarter ? '<div style="font-size:11px;color:var(--gray-400)">Select a month or quarter in the sidebar to filter</div>' : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              ${isQuarterMode || !month ? '<th>Months Included</th>' : ''}
              <th class="td-number">Runrate Loss %</th>
              <th class="td-number">Absence Loss %</th>
              <th class="td-number">Manhours Loss %</th>
              <th class="td-number" style="border-left:2px solid var(--gray-200)">Runrate Contrib</th>
              <th class="td-number">Absence Contrib</th>
              <th class="td-number">MH Contrib</th>
            </tr>
          </thead>
          <tbody>
            ${hasData ? rows.map(r => `<tr>
              <td><strong>${r.line || '—'}</strong></td>
              ${isQuarterMode || !month ? `<td style="color:var(--gray-500);font-size:12px">${r.monthList}</td>` : ''}
              <td class="td-number">${r.runrateLoss != null ? (r.runrateLoss*100).toFixed(2)+'%' : '—'}</td>
              <td class="td-number">${r.absLoss     != null ? (r.absLoss*100).toFixed(2)+'%'     : '—'}</td>
              <td class="td-number">${r.mhLoss      != null ? (r.mhLoss*100).toFixed(2)+'%'      : '—'}</td>
              <td class="td-number ${contribClass(r.runPct)}" style="border-left:2px solid var(--gray-200)">${r.runPct != null ? (r.runPct*100).toFixed(1)+'%' : '—'}</td>
              <td class="td-number ${contribClass(r.absPct)}">${r.absPct != null ? (r.absPct*100).toFixed(1)+'%' : '—'}</td>
              <td class="td-number ${contribClass(r.mhPct)}">${r.mhPct  != null ? (r.mhPct*100).toFixed(1)+'%'  : '—'}</td>
            </tr>`).join('')
            : '<tr><td colspan="8"><div class="empty"><p>No data yet.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  destroyChart('lossPie');
  const ctx = document.getElementById('lossPieChart');
  if (ctx && aggTotal > 0) {
    charts['lossPie'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Runrate Loss', 'Absenteeism Loss', 'Manhours Loss'],
        datasets: [{
          data: [aggRunLoss || 0, aggAbsLoss || 0, aggMhLoss || 0],
          backgroundColor: ['#d97706','#dc2626','#1a56db'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 16 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const val = ctx.parsed;
                const contrib = aggTotal > 0 ? (val / aggTotal * 100).toFixed(1) : '—';
                return ` ${(val*100).toFixed(2)}% loss  (${contrib}% of total)`;
              }
            }
          }
        }
      }
    });
  }
}
 
// ── BUDGET DASHBOARD ───────────────────────────────────────────────────────────
function renderBudget(c, month) {
  const rows = getBudgetActualRows(month);
  const mLabel = month ? fmtMonthLabel(month) : 'All Months';
  const allRows = getBudgetActualRows('');
  const rowHasActual = r => [r.utility_cost, r.rm_cost, r.volume].some(v => v != null);
  const detailRows = rows.filter(rowHasActual);
  const selectedMonthHasActual = month ? rows.some(rowHasActual) : false;
  const latestMonthBy = fields => [...allRows]
    .filter(r => fields.some(field => r[field] != null && r[field] !== 0))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)))
    .at(-1)?.month || '';
  const summaryBaseMonth = month && selectedMonthHasActual
    ? month
    : latestMonthBy(['utility_cost', 'rm_cost', 'volume'])
      || latestMonthBy(['utility_budget', 'rm_budget', 'volume_budget']);
  const summaryFY = summaryBaseMonth ? getFY(summaryBaseMonth) : null;
  const fyMonths = summaryFY ? getFYMonths(summaryFY) : [];
  const periodMonths = summaryBaseMonth
    ? fyMonths.slice(0, Math.max(fyMonths.indexOf(summaryBaseMonth), 0) + 1)
    : [];
  const summaryRowsSource = periodMonths.length
    ? allRows.filter(r => periodMonths.includes(r.month))
    : allRows;

  const sum = field => summaryRowsSource.reduce((total, r) => total + (Number(r[field]) || 0), 0);
  const actualTotals = {
    utility: sum('utility_cost'),
    rm: sum('rm_cost'),
    volume: sum('volume')
  };
  actualTotals.engg = actualTotals.volume > 0
    ? (actualTotals.utility + actualTotals.rm) / actualTotals.volume
    : null;

  const obTotals = {
    utility: sum('utility_budget'),
    rm: sum('rm_budget'),
    volume: sum('volume_budget')
  };
  obTotals.engg = obTotals.volume > 0
    ? (obTotals.utility + obTotals.rm) / obTotals.volume
    : null;

  const summaryPeriodLabel = summaryFY && summaryBaseMonth
    ? `FY${summaryFY} through ${fmtMonthLabel(summaryBaseMonth)}`
    : 'All available months';
  const summaryMetrics = [
    { key: 'utility', label: 'Utilities', decimals: 2, lowerIsBetter: true },
    { key: 'rm', label: 'R & M', decimals: 2, lowerIsBetter: true },
    { key: 'volume', label: 'Volume', decimals: 2, lowerIsBetter: false },
    { key: 'engg', label: 'Engg CC', decimals: 4, lowerIsBetter: true }
  ];
  const varianceClass = (metric, actual, ob) => {
    if (actual == null || ob == null) return '';
    const favorable = metric.lowerIsBetter ? actual <= ob : actual >= ob;
    return favorable ? 'td-green' : 'td-red';
  };
  const formatSummaryValue = (value, decimals) =>
    value == null || !isFinite(value) ? '&mdash;' : fmtN(value, decimals);
 
  c.innerHTML = `
    <div class="page-header">
      <h1>OB vs Actual</h1>
      <p>Compare ACT results against OB/target values — ${mLabel}</p>
    </div>
    <div class="card budget-summary-card section-gap">
      <div class="budget-summary-head">
        <div>
          <div class="card-title">FY Total Summary</div>
          <div class="card-subtitle">${summaryPeriodLabel} - formula chain follows the Excel workbook</div>
        </div>
        <span class="pill pill-blue">OB - Actual</span>
      </div>
      <div class="table-wrap budget-summary-table">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th class="td-number">Total Actual${summaryFY ? ` FY${summaryFY}` : ''}</th>
              <th class="td-number">Total OB${summaryFY ? ` FY${summaryFY}` : ''}</th>
              <th class="td-number">Absolute Variance</th>
              <th class="td-number">Percent Variance</th>
            </tr>
          </thead>
          <tbody>
            ${summaryMetrics.map(metric => {
              const actual = actualTotals[metric.key];
              const ob = obTotals[metric.key];
              const variance = actual != null && ob != null ? ob - actual : null;
              const variancePct = ob ? variance / Math.abs(ob) : null;
              const cls = varianceClass(metric, actual, ob);
              return `<tr>
                <td><strong>${metric.label}</strong></td>
                <td class="td-number">${formatSummaryValue(actual, metric.decimals)}</td>
                <td class="td-number">${formatSummaryValue(ob, metric.decimals)}</td>
                <td class="td-number ${cls}"><strong>${formatSummaryValue(variance, metric.decimals)}</strong></td>
                <td class="td-number ${cls}">${variancePct != null ? (variancePct * 100).toFixed(1) + '%' : '&mdash;'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card section-gap">
      <div class="card-title" style="margin-bottom:14px">OB vs Actual</div>
      <div class="chart-container">
        ${detailRows.length ? '<canvas id="budgetChart" aria-label="OB vs actual bar chart">OB vs actual comparison</canvas>' : '<div class="empty"><p>No actual months available for OB vs Actual chart.</p></div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:14px">Monthly OB Variance Detail</div>
      <div class="card-subtitle" style="margin-bottom:12px">Shows only months with ACT data. Monthly variance uses Actual - OB, so positive cost variance is unfavorable while positive volume variance is favorable.</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th>
            <th>Util OB (₱ thousands)</th><th>Util Actual (₱ thousands)</th><th>Util Var (₱ thousands)</th><th>Util Var %</th>
            <th>R&M OB (₱ thousands)</th><th>R&M Actual (₱ thousands)</th><th>R&M Var (₱ thousands)</th><th>R&M Var %</th>
            <th>Vol OB (MT)</th><th>Vol Actual (MT)</th><th>Vol Var</th><th>Vol Var %</th>
          </tr></thead>
          <tbody>
            ${detailRows.length ? detailRows.map(r=>{
              const uv=r.utility_cost!=null?calcVariance(r.utility_cost,r.utility_budget):null;
              const uvp=r.utility_cost!=null?calcVariancePct(r.utility_cost,r.utility_budget):null;
              const rv=r.rm_cost!=null?calcVariance(r.rm_cost,r.rm_budget):null;
              const rvp=r.rm_cost!=null?calcVariancePct(r.rm_cost,r.rm_budget):null;
              const vv=r.volume!=null?calcVariance(r.volume,r.volume_budget):null;
              const vvp=r.volume!=null?calcVariancePct(r.volume,r.volume_budget):null;
              return `<tr>
                <td><strong>${fmtMonthLabel(r.month)}</strong></td>
                <td class="td-number">${fmtN(r.utility_budget,2)}</td>
                <td class="td-number">${r.utility_cost!=null?fmtN(r.utility_cost,2):'—'}</td>
                <td class="td-number ${uv!==null?(uv>0?'td-red':'td-green'):''}"><strong>${uv!==null?fmtN(uv,2):'—'}</strong></td>
                <td class="td-number ${uvp!==null?(uvp>0?'td-red':'td-green'):''}">${uvp!==null?((uvp*100).toFixed(1)+'%'):'—'}</td>
                <td class="td-number">${fmtN(r.rm_budget,2)}</td>
                <td class="td-number">${r.rm_cost!=null?fmtN(r.rm_cost,2):'—'}</td>
                <td class="td-number ${rv!==null?(rv>0?'td-red':'td-green'):''}"><strong>${rv!==null?fmtN(rv,2):'—'}</strong></td>
                <td class="td-number ${rvp!==null?(rvp>0?'td-red':'td-green'):''}">${rvp!==null?((rvp*100).toFixed(1)+'%'):'—'}</td>
                <td class="td-number">${fmtN(r.volume_budget,3)}</td>
                <td class="td-number">${r.volume!=null?fmtN(r.volume,3):'—'}</td>
                <td class="td-number ${vv!==null?(vv<0?'td-red':'td-green'):''}"><strong>${vv!==null?fmtN(vv,3):'—'}</strong></td>
                <td class="td-number ${vvp!==null?(vvp<0?'td-red':'td-green'):''}">${vvp!==null?((vvp*100).toFixed(1)+'%'):'—'}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="13"><div class="empty"><p>No months with actual data yet. Enter or import ACT values to calculate monthly variance.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
 
  destroyChart('budgetChart');
  const ctx=document.getElementById('budgetChart');
  if(ctx && detailRows.length){
    const labels=detailRows.map(r=>fmtMonthLabel(r.month)).reverse();
    const ubud=detailRows.map(r=>r.utility_budget).reverse(), uact=detailRows.map(r=>r.utility_cost).reverse();
    const rbud=detailRows.map(r=>r.rm_budget).reverse(), ract=detailRows.map(r=>r.rm_cost).reverse();
    charts['budgetChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels, 
        datasets: [
          { label: 'Util OB', data: ubud, backgroundColor: '#bfdbfe', borderRadius: 4, barPercentage: 0.6 },
          { label: 'Util Actual', data: uact, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 },
          { label: 'R&M OB', data: rbud, backgroundColor: '#fcd34d', borderRadius: 4, barPercentage: 0.6 },
          { label: 'R&M Actual', data: ract, backgroundColor: '#f59e0b', borderRadius: 4, barPercentage: 0.6 }
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},
        scales:{y:{grid:{color:'#f1f5f9'},ticks:{font:{size:11}}},x:{grid:{display:false},ticks:{font:{size:11},maxRotation:45,autoSkip:false}}}}
    });
  }
}

export { renderExecutive, renderCost, renderProduction, renderManhours, renderLoss, renderBudget };
