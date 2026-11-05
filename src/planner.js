// User-facing planning functions built on the dynamic model:
// date-by-date projections, goal dates, calories needed for a goal date,
// maintenance after reaching a goal, and safety checks.

import { createBaseline, simulate, baselineMaintenanceKcal, maintenanceKcalForState } from './hallModel.js';
import * as bodyFns from './body.js';

const { bmi, healthyWeightRange } = bodyFns;
import { KG_PER_LB } from './units.js';

const MS_PER_DAY = 86_400_000;

/**
 * Projections stop at this BMI. A mean BMI of about 12 has been proposed as the
 * lower limit of human survival (James et al. 1988; Henry's review). Below it the
 * model's numbers describe no living person. See docs/RESEARCH.md §5.
 */
export const SURVIVAL_LIMIT_BMI = 12;

function toUtcDate(date) {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date: ${date}`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const isoDate = (d) => d.toISOString().slice(0, 10);

/** Whole days between two dates (UTC calendar days). */
export function daysBetween(start, end) {
  return Math.round((toUtcDate(end) - toUtcDate(start)) / MS_PER_DAY);
}

/**
 * Day-by-day projection with calendar dates.
 * @param {object} person see createBaseline
 * @param {object} opts
 * @param {string|Date} opts.startDate
 * @param {number} [opts.intakeKcal] constant daily intake, or
 * @param {Array} [opts.phases] list of { startDay | startDate, intakeKcal, pal?, carbFraction? }
 * @param {number} [opts.days] length; or
 * @param {string|Date} [opts.endDate]
 */
export function projectByDate(person, opts) {
  const base = createBaseline(person);
  const start = toUtcDate(opts.startDate);
  const days = opts.days ?? daysBetween(start, opts.endDate);
  const phases = normalisePhases(opts, start);
  const sim = simulate(base, phases, days);
  let rows = sim.map((r) => ({
    ...r,
    date: isoDate(new Date(start.getTime() + r.day * MS_PER_DAY)),
  }));
  let stoppedOnDay = sim.stoppedOnDay;
  let stopReason = stoppedOnDay === undefined ? undefined : 'fat-depleted';
  const limit = rows.findIndex((r) => bmi(r.weightKg, person.heightCm) < SURVIVAL_LIMIT_BMI);
  if (limit > 0) {
    rows = rows.slice(0, limit + 1);
    stoppedOnDay = rows.at(-1).day;
    stopReason = 'survival-limit';
  }
  return {
    baselineMaintenanceKcal: baselineMaintenanceKcal(base),
    rows,
    stoppedOnDay,
    stopReason,
    stoppedOnDate: stoppedOnDay === undefined ? undefined : rows.at(-1).date,
  };
}

function normalisePhases(opts, start) {
  if (opts.phases) {
    return opts.phases.map((ph) => ({
      ...ph,
      startDay: ph.startDay ?? daysBetween(start, ph.startDate),
    }));
  }
  if (opts.intakeKcal === undefined) throw new RangeError('give intakeKcal or phases');
  return [{ startDay: 0, intakeKcal: opts.intakeKcal }];
}

/**
 * Projection with a low/high band. Hall et al. 2011 note that a free-living
 * person's energy needs cannot be estimated better than about ±5%, so we re-run
 * the model with the resting rate scaled by (1 ± uncertainty).
 * Returns rows with weightKg (central), lowKg (needs 5% higher → more loss) and highKg.
 */
export function projectRange(person, opts, uncertainty = 0.05) {
  const { mifflinStJeor } = bodyFns;
  const rmr = person.rmrKcal ?? mifflinStJeor(person);
  const central = projectByDate(person, opts);
  const low = projectByDate({ ...person, rmrKcal: rmr * (1 + uncertainty) }, opts);
  const high = projectByDate({ ...person, rmrKcal: rmr * (1 - uncertainty) }, opts);
  // The central run decides the length. If an edge of the band stops earlier
  // (it hit the survival limit), it holds its last value from then on.
  const edge = (run, i) => (run.rows[i] ?? run.rows.at(-1)).weightKg;
  const rows = central.rows.map((r, i) => ({ ...r, lowKg: edge(low, i), highKg: edge(high, i) }));
  const { stoppedOnDay, stopReason } = central;
  return {
    baselineMaintenanceKcal: central.baselineMaintenanceKcal,
    rows,
    stoppedOnDay,
    stopReason,
    stoppedOnDate: stoppedOnDay === undefined ? undefined : rows.at(-1).date,
  };
}

/** Weekly summary rows (every 7th day plus the last day). */
export function weekly(rows) {
  return rows.filter((r, i) => r.day % 7 === 0 || i === rows.length - 1);
}

/**
 * First day the projected weight reaches the goal at a constant intake.
 * Returns null if it never does within maxDays (the plateau is above the goal).
 */
export function dateToReachGoal(person, { startDate, intakeKcal, goalKg, maxDays = 365 * 10 }) {
  const { rows, stoppedOnDate, stopReason } = projectByDate(person, { startDate, intakeKcal, days: maxDays });
  const losing = goalKg < person.weightKg;
  const hit = rows.find((r) => (losing ? r.weightKg <= goalKg : r.weightKg >= goalKg));
  const plateauKg = rows[rows.length - 1].weightKg;
  return hit
    ? { reached: true, date: hit.date, day: hit.day, plateauKg }
    : { reached: false, plateauKg, stoppedOnDate, stopReason };
}

/**
 * Constant daily intake needed to be at goalKg on goalDate (bisection; weight on a
 * given day rises monotonically with intake). Also returns the intake that
 * maintains the goal weight afterwards.
 */
export function intakeForGoal(person, { startDate, goalDate, goalKg }) {
  const days = daysBetween(startDate, goalDate);
  if (!(days >= 1)) throw new RangeError('goalDate must be after startDate');
  const base = createBaseline(person);
  const weightAt = (kcal) => simulate(base, [{ startDay: 0, intakeKcal: kcal }], days).at(-1);

  let lo = 0;
  let hi = 10_000;
  if (weightAt(lo).weightKg > goalKg) {
    return { feasible: false, reason: 'Goal cannot be reached by this date even with zero intake' };
  }
  if (weightAt(hi).weightKg < goalKg) {
    return { feasible: false, reason: 'Goal needs more than 10,000 kcal/day' };
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (weightAt(mid).weightKg < goalKg) lo = mid; else hi = mid;
  }
  const intakeKcal = (lo + hi) / 2;
  const end = weightAt(intakeKcal);
  return {
    feasible: true,
    intakeKcal,
    days,
    baselineMaintenanceKcal: baselineMaintenanceKcal(base),
    maintenanceAfterGoalKcal: maintenanceKcalForState(base, end),
  };
}

/** Steady-state ("plateau") weight for a constant intake, found by simulating 20 years. */
export function plateauWeight(person, intakeKcal) {
  const base = createBaseline(person);
  return simulate(base, [{ startDay: 0, intakeKcal }], 365 * 20).at(-1).weightKg;
}

/**
 * The old static rule (3500 kcal per lb, ~7700 kcal per kg), for comparison only.
 * It assumes the deficit never shrinks, so it overestimates loss over time.
 */
export function staticRuleWeight({ startWeightKg, maintenanceKcal, intakeKcal, days }) {
  const kcalPerKg = 3500 / KG_PER_LB;
  return startWeightKg - ((maintenanceKcal - intakeKcal) * days) / kcalPerKg;
}

/**
 * Safety checks for a plan. Returns a list of { level: 'block'|'warn', code, message }.
 * Thresholds and their sources are listed in docs/RESEARCH.md ("Safety rules").
 */
export function safetyChecks(person, { intakeKcal, goalKg, rows }) {
  const out = [];
  const add = (level, code, message) => out.push({ level, code, message });

  if (person.age < 18) add('block', 'minor', 'Not for under-18s. Children need a growth-aware plan from a clinician.');
  if (person.pregnant) add('block', 'pregnancy', 'Weight-loss plans are not appropriate during pregnancy.');

  if (intakeKcal !== undefined) {
    if (intakeKcal < 800) {
      add('warn', 'vlcd', 'Under 800 kcal/day is a very-low-calorie diet, normally done only under medical supervision.');
    } else {
      const floor = person.sex === 'male' ? 1500 : 1200;
      if (intakeKcal < floor) add('warn', 'low-intake', `Below ${floor} kcal/day, the commonly cited minimum without medical supervision.`);
    }
  }

  if (goalKg !== undefined) {
    const goalBmi = bmi(goalKg, person.heightCm);
    if (goalBmi < 18.5) {
      const { minKg } = healthyWeightRange(person.heightCm);
      add('block', 'underweight-goal', `Goal BMI ${goalBmi.toFixed(1)} is underweight. Lowest healthy weight is about ${minKg.toFixed(1)} kg.`);
    }
  }

  if (rows && rows.length > 0) {
    const under = rows.find((r) => bmi(r.weightKg, person.heightCm) < 18.5);
    if (under) {
      add('warn', 'underweight-projection', `Staying on this plan makes BMI drop below 18.5 around ${under.date ?? `day ${under.day}`}. Switch to maintenance before then.`);
    }
  }

  if (rows && rows.length > 21) {
    // Skip the first 2 weeks: early loss is mostly glycogen and water.
    let maxWeekly = 0;
    for (let i = 14; i + 7 < rows.length; i += 7) {
      maxWeekly = Math.max(maxWeekly, rows[i].weightKg - rows[i + 7].weightKg);
    }
    if (maxWeekly > 1) {
      add('warn', 'fast-loss', `Projected loss up to ${maxWeekly.toFixed(2)} kg/week after week 2; guidance is about 0.5-1 kg (1-2 lb) per week.`);
    }
  }
  return out;
}
