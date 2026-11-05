import {
  projectRange, dateToReachGoal, intakeForGoal, staticRuleWeight, safetyChecks, daysBetween,
} from '../src/planner.js';
import { bmi, bmiCategory, healthyWeightRange, PAL_BANDS } from '../src/body.js';
import { lbToKg, kgToLb, inchToCm } from '../src/units.js';

const form = document.getElementById('form');
const els = {
  alerts: document.getElementById('alerts'),
  tiles: document.getElementById('tiles'),
  chart: document.getElementById('chart'),
  chartPanel: document.getElementById('chartPanel'),
  chartNote: document.getElementById('chartNote'),
  legend: document.getElementById('legend'),
  table: document.getElementById('table'),
  tablePanel: document.getElementById('tablePanel'),
  tooltip: document.getElementById('tooltip'),
};
const STORE_KEY = 'lunelle.form.v1';

// ---------- helpers ----------
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
};
const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};
const addMonths = (iso, months) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const fmtShortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
  month: 'short', year: '2-digit', timeZone: 'UTC',
});
const kcal = (n) => `${Math.round(n).toLocaleString()} kcal`;

let units = 'metric';
const wUnit = () => (units === 'us' ? 'lb' : 'kg');
const toDisplayW = (kg) => (units === 'us' ? kgToLb(kg) : kg);
const fmtW = (kg, digits = 1) => `${toDisplayW(kg).toFixed(digits)} ${wUnit()}`;

// ---------- form ----------
function fillActivityOptions() {
  const select = document.getElementById('pal');
  for (const band of Object.values(PAL_BANDS)) {
    select.append(el('option', { value: String(band.default), title: band.label }, `${band.short} · ${band.default}`));
  }
}

function restoreForm() {
  form.startDate.value = todayIso();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved) {
      for (const [k, v] of Object.entries(saved)) {
        const field = form.elements.namedItem(k);
        if (!field || k === 'startDate') continue;
        if (field.type === 'checkbox') field.checked = Boolean(v); else field.value = v;
      }
    }
  } catch { /* storage unavailable: use defaults */ }
}

function saveForm() {
  const data = {};
  for (const field of form.elements) {
    if (!field.name) continue;
    data[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function setUnits(next, convert) {
  if (convert && next !== units) {
    const w = parseFloat(form.weight.value);
    const g = parseFloat(form.goal.value);
    const conv = next === 'us' ? kgToLb : lbToKg;
    if (Number.isFinite(w)) form.weight.value = conv(w).toFixed(1);
    if (Number.isFinite(g)) form.goal.value = conv(g).toFixed(1);
    if (next === 'us') {
      const totalIn = parseFloat(form.heightCm.value) / 2.54;
      if (Number.isFinite(totalIn)) {
        form.heightFt.value = Math.floor(totalIn / 12);
        form.heightIn.value = (totalIn % 12).toFixed(1);
      }
    } else {
      const cm = inchToCm(parseFloat(form.heightFt.value) * 12 + parseFloat(form.heightIn.value || 0));
      if (Number.isFinite(cm)) form.heightCm.value = cm.toFixed(1);
    }
  }
  units = next;
  document.body.classList.toggle('units-us', units === 'us');
  for (const span of document.querySelectorAll('[data-unit="w"]')) span.textContent = wUnit();
}

function readInputs() {
  const num = (name) => {
    const v = parseFloat(form.elements.namedItem(name).value);
    return Number.isFinite(v) ? v : undefined;
  };
  const weightIn = num('weight');
  const goalIn = num('goal');
  const heightCm = units === 'us'
    ? inchToCm((num('heightFt') ?? 0) * 12 + (num('heightIn') ?? 0))
    : num('heightCm');
  const toKg = (v) => (v === undefined ? undefined : units === 'us' ? lbToKg(v) : v);
  return {
    person: {
      sex: form.sex.value,
      age: num('age'),
      heightCm,
      weightKg: toKg(weightIn),
      pal: num('pal'),
      pregnant: form.pregnant.checked,
    },
    intakeKcal: num('intake'),
    startDate: form.startDate.value || todayIso(),
    months: Number(form.months.value),
    goalKg: toKg(goalIn),
    goalDate: form.goalDate.value || undefined,
  };
}

function validate(inp) {
  const problems = [];
  const mark = (name, bad) => {
    const field = form.elements.namedItem(name);
    if (field) field.setAttribute('aria-invalid', bad ? 'true' : 'false');
    return bad;
  };
  const { person } = inp;
  if (mark('age', !(person.age >= 1 && person.age <= 110))) problems.push('Enter your age.');
  const hBad = !(person.heightCm >= 120 && person.heightCm <= 230);
  mark('heightCm', hBad); mark('heightFt', hBad); mark('heightIn', hBad);
  if (hBad) problems.push('Enter a height between 120 and 230 cm (3 ft 11 in to 7 ft 6 in).');
  if (mark('weight', !(person.weightKg >= 30 && person.weightKg <= 350))) problems.push('Enter a weight between 30 and 350 kg (66 to 770 lb).');
  if (mark('intake', !(inp.intakeKcal >= 0))) problems.push('Enter daily calories (0 or more).');
  return problems;
}

// ---------- rendering ----------
const ICONS = { block: '✕', warn: '!' };

function renderAlerts(items) {
  els.alerts.replaceChildren();
  for (const item of items) {
    const box = el('div', { class: `alert ${item.level}`, role: item.level === 'block' ? 'alert' : 'note' });
    const body = el('div');
    body.append(el('strong', {}, item.level === 'block' ? 'Not available' : 'Check this'));
    body.append(document.createTextNode(item.message));
    box.append(el('span', { class: 'icon', 'aria-hidden': 'true' }, ICONS[item.level] ?? '!'), body);
    els.alerts.append(box);
  }
}

function tile(label, value, detail) {
  const t = el('div', { class: 'tile' }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value));
  if (detail) t.append(el('div', { class: 'detail' }, detail));
  return t;
}

function renderLegend(hasGoal) {
  const item = (label, draw) => {
    const icon = svg('svg', { width: 18, height: 10, 'aria-hidden': 'true' });
    icon.append(draw());
    const li = el('li');
    li.append(icon, label);
    return li;
  };
  els.legend.replaceChildren(
    item('Projection', () => svg('line', { x1: 0, y1: 5, x2: 18, y2: 5, stroke: 'var(--series-1)', 'stroke-width': 2 })),
    item('Likely range (±5%)', () => svg('rect', { x: 0, y: 1, width: 18, height: 8, rx: 2, fill: 'var(--band)' })),
    item('Old 3,500-kcal rule', () => svg('line', { x1: 0, y1: 5, x2: 18, y2: 5, stroke: 'var(--series-2)', 'stroke-width': 2, 'stroke-dasharray': '4 3' })),
  );
  if (hasGoal) {
    els.legend.append(item('Goal', () => svg('line', { x1: 0, y1: 5, x2: 18, y2: 5, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '2 3' })));
  }
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

let chartState = null;

function renderChart(data) {
  const { rows, rule, goalKg } = data;
  const width = Math.max(320, els.chart.clientWidth || 600);
  const height = Math.round(Math.min(380, Math.max(240, width * 0.5)));
  const m = { top: 12, right: 16, bottom: 28, left: 44 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const disp = (kg) => toDisplayW(kg);
  const values = rows.flatMap((r) => [r.lowKg, r.highKg]).map(disp);
  if (goalKg !== undefined) values.push(disp(goalKg));
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  const pad = Math.max(1, (yMax - yMin) * 0.08);
  yMin -= pad; yMax += pad;
  const n = rows.length - 1;
  const x = (day) => m.left + (day / n) * iw;
  const y = (v) => m.top + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`, role: 'img', tabindex: '0',
    'aria-label': `Projected weight from ${fmtDate(rows[0].date)} to ${fmtDate(rows[n].date)}. Use left and right arrow keys to read values.`,
  });
  const clipId = 'plot-clip';
  const defs = svg('defs');
  const clip = svg('clipPath', { id: clipId });
  clip.append(svg('rect', { x: m.left, y: m.top, width: iw, height: ih }));
  defs.append(clip);
  root.append(defs);

  // grid + y axis
  for (const t of niceTicks(yMin, yMax)) {
    root.append(svg('line', { x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
    const label = svg('text', { x: m.left - 8, y: y(t) + 4, 'text-anchor': 'end' });
    label.textContent = Number.isInteger(t) ? t : t.toFixed(1);
    root.append(label);
  }
  const unitLabel = svg('text', { x: m.left - 8, y: m.top - 2, 'text-anchor': 'end' });
  unitLabel.textContent = wUnit();
  root.append(unitLabel);
  root.append(svg('line', { x1: m.left, x2: m.left + iw, y1: m.top + ih, y2: m.top + ih, stroke: 'var(--axis)', 'stroke-width': 1 }));

  // x ticks: month boundaries, thinned to fit
  const monthTicks = rows.filter((r, i) => i === 0 || r.date.endsWith('-01'));
  const every = Math.ceil(monthTicks.length / Math.max(2, Math.floor(iw / 70)));
  let lastTickX = -Infinity;
  monthTicks.forEach((r, i) => {
    if (i % every !== 0) return;
    if (x(r.day) - lastTickX < 56) return; // avoid overlapping labels
    lastTickX = x(r.day) + (i === 0 ? 28 : 0); // the first label is left-anchored, so it extends right
    const label = svg('text', { x: x(r.day), y: height - 8, 'text-anchor': i === 0 ? 'start' : 'middle' });
    label.textContent = fmtShortDate(r.date);
    root.append(label);
  });

  const plot = svg('g', { 'clip-path': `url(#${clipId})` });
  const path = (pts) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const band = rows.map((r) => [x(r.day), y(disp(r.lowKg))]).concat([...rows].reverse().map((r) => [x(r.day), y(disp(r.highKg))]));
  plot.append(svg('path', { d: `${path(band)}Z`, fill: 'var(--band)' }));
  plot.append(svg('path', { d: path(rule.map((w, i) => [x(i), y(disp(w))])), fill: 'none', stroke: 'var(--series-2)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  if (goalKg !== undefined) {
    plot.append(svg('line', { x1: m.left, x2: m.left + iw, y1: y(disp(goalKg)), y2: y(disp(goalKg)), stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
  }
  plot.append(svg('path', { d: path(rows.map((r) => [x(r.day), y(disp(r.weightKg))])), fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  root.append(plot);

  // end label (selective direct label)
  const last = rows[n];
  const endLabel = svg('text', { x: x(n) - 4, y: y(disp(last.weightKg)) - 10, 'text-anchor': 'end', class: 'end-label' });
  endLabel.textContent = fmtW(last.weightKg);
  root.append(endLabel);

  // hover layer
  const cross = svg('g', { visibility: 'hidden' });
  const vline = svg('line', { y1: m.top, y2: m.top + ih, stroke: 'var(--axis)', 'stroke-width': 1 });
  const dotMain = svg('circle', { r: 4.5, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2 });
  const dotRule = svg('circle', { r: 4, fill: 'var(--series-2)', stroke: 'var(--surface)', 'stroke-width': 2 });
  cross.append(vline, dotMain, dotRule);
  root.append(cross);
  const hit = svg('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent' });
  root.append(hit);

  els.chart.replaceChildren(root);
  chartState = { root, rows, rule, x, y, disp, cross, vline, dotMain, dotRule, n, width, yMin, yMax, mTop: m.top, ih, day: null };

  const dayFromEvent = (ev) => {
    const rect = root.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * width;
    return Math.max(0, Math.min(n, Math.round(((px - m.left) / iw) * n)));
  };
  hit.addEventListener('pointermove', (ev) => showAt(dayFromEvent(ev), ev.clientX, ev.clientY));
  hit.addEventListener('pointerdown', (ev) => showAt(dayFromEvent(ev), ev.clientX, ev.clientY));
  hit.addEventListener('pointerleave', hideTip);
  root.addEventListener('blur', hideTip);
  root.addEventListener('keydown', (ev) => {
    const step = ev.shiftKey ? 30 : 7;
    let day = chartState.day ?? 0;
    if (ev.key === 'ArrowRight') day = Math.min(n, day + step);
    else if (ev.key === 'ArrowLeft') day = Math.max(0, day - step);
    else if (ev.key === 'Home') day = 0;
    else if (ev.key === 'End') day = n;
    else return;
    ev.preventDefault();
    const rect = root.getBoundingClientRect();
    showAt(day, rect.left + (x(day) / width) * rect.width, rect.top + rect.height * 0.3);
  });
}

function showAt(day, clientX, clientY) {
  const s = chartState;
  if (!s) return;
  s.day = day;
  const r = s.rows[day];
  const clampY = (v) => Math.max(s.mTop, Math.min(s.mTop + s.ih, s.y(v)));
  s.cross.setAttribute('visibility', 'visible');
  s.vline.setAttribute('x1', s.x(day)); s.vline.setAttribute('x2', s.x(day));
  s.dotMain.setAttribute('cx', s.x(day)); s.dotMain.setAttribute('cy', s.y(s.disp(r.weightKg)));
  const ruleV = s.disp(s.rule[day]);
  const ruleVisible = ruleV >= s.yMin && ruleV <= s.yMax;
  s.dotRule.setAttribute('visibility', ruleVisible ? 'visible' : 'hidden');
  s.dotRule.setAttribute('cx', s.x(day)); s.dotRule.setAttribute('cy', clampY(ruleV));

  const tip = els.tooltip;
  tip.replaceChildren();
  tip.append(el('div', { class: 't-date' }, `${fmtDate(r.date)} · day ${day}`));
  // Keys mirror the line style of each series (the tooltip is inverted, so colour can't carry it).
  const KEY_STYLE = {
    solid: '',
    band: 'border-top-width: 6px; opacity: 0.35;',
    dashed: 'border-top-style: dashed;',
  };
  const row = (style, value, label) => {
    const key = el('i', { class: 'key', style: KEY_STYLE[style] });
    tip.append(el('div', { class: 't-row' }, key, el('b', {}, value), el('span', {}, label)));
  };
  row('solid', fmtW(r.weightKg), 'projected');
  row('band', `${toDisplayW(r.lowKg).toFixed(1)}–${fmtW(r.highKg)}`, 'likely range');
  row('dashed', fmtW(s.rule[day]), '3,500-kcal rule');
  tip.hidden = false;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = clientX + 14;
  if (left + tw > window.innerWidth - 8) left = clientX - tw - 14;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, Math.min(window.innerHeight - th - 8, clientY - th / 2))}px`;
}

function hideTip() {
  els.tooltip.hidden = true;
  if (chartState) chartState.cross.setAttribute('visibility', 'hidden');
}

function renderTable(rows, heightCm) {
  const step = rows.length - 1 <= 190 ? 7 : 28;
  const pick = rows.filter((r, i) => i % step === 0 || i === rows.length - 1);
  const head = el('tr');
  for (const h of ['Date', 'Day', `Weight (${wUnit()})`, 'Likely range', `Fat (${wUnit()})`, `Lean (${wUnit()})`, 'BMI', 'Burn (kcal/day)']) {
    head.append(el('th', { scope: 'col' }, h));
  }
  const body = el('tbody');
  for (const r of pick) {
    const tr = el('tr');
    const cells = [
      fmtDate(r.date), String(r.day), toDisplayW(r.weightKg).toFixed(1),
      `${toDisplayW(r.lowKg).toFixed(1)}–${toDisplayW(r.highKg).toFixed(1)}`,
      toDisplayW(r.fatKg).toFixed(1), toDisplayW(r.leanKg).toFixed(1),
      bmi(r.weightKg, heightCm).toFixed(1), Math.round(r.expenditureKcal).toLocaleString(),
    ];
    cells.forEach((c, i) => tr.append(el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, c)));
    body.append(tr);
  }
  els.table.replaceChildren(el('thead', {}, head), body);
}

// ---------- main update ----------
let lastData = null;

function update() {
  saveForm();
  const inp = readInputs();
  const problems = validate(inp);
  if (problems.length) {
    renderAlerts(problems.map((message) => ({ level: 'warn', message })));
    return;
  }
  const { person, intakeKcal, startDate, months } = inp;

  const gate = safetyChecks(person, { intakeKcal });
  const blocks = gate.filter((g) => g.level === 'block' && g.code !== 'underweight-goal');
  if (blocks.length) {
    renderAlerts(blocks);
    els.tiles.replaceChildren();
    els.chartPanel.hidden = true;
    els.tablePanel.hidden = true;
    lastData = null;
    return;
  }
  els.chartPanel.hidden = false;
  els.tablePanel.hidden = false;

  const endDate = addMonths(startDate, months);
  const days = daysBetween(startDate, endDate);
  let projection;
  try {
    projection = projectRange(person, { startDate, intakeKcal, days });
  } catch (err) {
    renderAlerts([{ level: 'block', message: err.message }]);
    return;
  }
  const { rows, baselineMaintenanceKcal, stoppedOnDate, stopReason } = projection;
  const rule = rows.map((r) => staticRuleWeight({
    startWeightKg: person.weightKg, maintenanceKcal: baselineMaintenanceKcal, intakeKcal, days: r.day,
  }));

  // goal handling
  let goalKg = inp.goalKg;
  const alerts = [];
  const goalChecks = goalKg !== undefined ? safetyChecks(person, { goalKg }) : [];
  if (goalChecks.some((g) => g.code === 'underweight-goal')) {
    alerts.push(...goalChecks);
    goalKg = undefined;
  }
  alerts.push(...safetyChecks(person, { intakeKcal, rows }).filter((a) => a.code !== 'underweight-goal'));
  if (stoppedOnDate) {
    alerts.unshift({ level: 'warn', code: 'projection-stopped', message: stopReason === 'survival-limit'
      ? `At this intake your BMI falls to 12 around ${fmtDate(stoppedOnDate)}, about the lower limit of human survival seen in starvation studies. The projection stops there.`
      : `At this intake your body-fat stores run out around ${fmtDate(stoppedOnDate)}. The projection stops there: this would not be survivable.` });
  }

  const tiles = [];
  const last = rows.at(-1);
  const change = last.weightKg - person.weightKg;
  tiles.push(tile('Maintenance today', kcal(baselineMaintenanceKcal), 'Estimated calories to stay at your current weight'));
  const diff = intakeKcal - baselineMaintenanceKcal;
  tiles.push(tile(diff <= 0 ? 'Daily deficit' : 'Daily surplus', kcal(Math.abs(diff)), `Eating ${kcal(intakeKcal)} a day`));
  tiles.push(tile(`Weight on ${fmtDate(last.date)}${stoppedOnDate ? ' (projection end)' : ''}`, fmtW(last.weightKg),
    `${change <= 0 ? '−' : '+'}${toDisplayW(Math.abs(change)).toFixed(1)} ${wUnit()} · range ${toDisplayW(last.lowKg).toFixed(1)}–${fmtW(last.highKg)}`));
  const bNow = bmi(person.weightKg, person.heightCm);
  const bEnd = bmi(last.weightKg, person.heightCm);
  const healthy = healthyWeightRange(person.heightCm);
  tiles.push(tile('BMI', `${bNow.toFixed(1)} → ${bEnd.toFixed(1)}`,
    `${bmiCategory(bNow)} → ${bmiCategory(bEnd)} · healthy ${toDisplayW(healthy.minKg).toFixed(0)}–${fmtW(healthy.maxKg, 0)}`));

  if (goalKg !== undefined && Math.abs(goalKg - person.weightKg) > 0.05) {
    const reach = dateToReachGoal(person, { startDate, intakeKcal, goalKg });
    tiles.push(reach.reached
      ? tile(`Reach ${fmtW(goalKg)}`, fmtDate(reach.date), `${reach.day} days at ${kcal(intakeKcal)}/day`)
      : tile(`Reach ${fmtW(goalKg)}`, 'Not at this intake', reach.stoppedOnDate
        ? `You would reach the survival limit around ${fmtDate(reach.stoppedOnDate)} first`
        : `You would level off around ${fmtW(reach.plateauKg)}`));

    if (inp.goalDate) {
      const plan = daysBetween(startDate, inp.goalDate) >= 1
        ? intakeForGoal(person, { startDate, goalDate: inp.goalDate, goalKg })
        : { feasible: false, reason: 'Pick a goal date after the start date.' };
      if (plan.feasible) {
        tiles.push(tile(`To hit it by ${fmtDate(inp.goalDate)}`, `${kcal(plan.intakeKcal)}/day`,
          `Then about ${kcal(plan.maintenanceAfterGoalKcal)}/day to stay there`));
        for (const a of safetyChecks(person, { intakeKcal: plan.intakeKcal })) {
          alerts.push({ ...a, level: 'warn', message: `Reaching your goal by that date needs ${kcal(plan.intakeKcal)}/day. ${a.message}` });
        }
      } else {
        tiles.push(tile(`To hit it by ${fmtDate(inp.goalDate)}`, 'Not realistic', plan.reason));
      }
    }
  }

  renderAlerts(alerts);
  els.tiles.replaceChildren(...tiles);
  renderLegend(goalKg !== undefined);
  lastData = { rows, rule, goalKg };
  renderChart(lastData);
  const ruleEnd = rule.at(-1);
  els.chartNote.textContent = `By ${fmtDate(last.date)} the old rule predicts ${fmtW(ruleEnd)}, ${toDisplayW(Math.abs(last.weightKg - ruleEnd)).toFixed(1)} ${wUnit()} ${ruleEnd < last.weightKg ? 'more loss' : 'less loss'} than the dynamic model.`;
  renderTable(rows, person.heightCm);
}

// ---------- wiring ----------
fillActivityOptions();
restoreForm();
setUnits(form.units.value, false);

let timer = null;
const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 150); };
form.addEventListener('input', (ev) => {
  if (ev.target.name === 'units') return;
  schedule();
});
form.addEventListener('change', (ev) => {
  if (ev.target.name === 'units') {
    setUnits(ev.target.value, true);
    update();
  }
});
form.addEventListener('submit', (ev) => ev.preventDefault());
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastData) renderChart(lastData); }, 120);
});
update();
