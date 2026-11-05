import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectByDate, projectRange, dateToReachGoal, intakeForGoal, staticRuleWeight, safetyChecks, daysBetween, weekly,
} from '../src/planner.js';
import { bmi } from '../src/body.js';

const woman = { sex: 'female', age: 35, heightCm: 165, weightKg: 85, pal: 1.5 };

test('projection rows carry calendar dates', () => {
  const { rows } = projectByDate(woman, { startDate: '2026-01-01', intakeKcal: 1600, days: 31 });
  assert.equal(rows[0].date, '2026-01-01');
  assert.equal(rows.at(-1).date, '2026-02-01');
  assert.equal(weekly(rows).length, 6);
});

test('phases can start on a calendar date', () => {
  const { rows } = projectByDate(woman, {
    startDate: '2026-01-01',
    endDate: '2026-03-01',
    phases: [{ startDate: '2026-01-01', intakeKcal: 1500 }, { startDate: '2026-02-01', intakeKcal: 2300 }],
  });
  assert.equal(rows.find((r) => r.date === '2026-02-10').intakeKcal.toFixed(0), '2300');
});

test('goal date is found, and the dynamic model is slower than the 3500-kcal rule', () => {
  const res = dateToReachGoal(woman, { startDate: '2026-01-01', intakeKcal: 1500, goalKg: 75 });
  assert.equal(res.reached, true);
  const { baselineMaintenanceKcal } = projectByDate(woman, { startDate: '2026-01-01', intakeKcal: 1500, days: 1 });
  const staticAtSameDay = staticRuleWeight({
    startWeightKg: 85, maintenanceKcal: baselineMaintenanceKcal, intakeKcal: 1500, days: 365,
  });
  const { rows } = projectByDate(woman, { startDate: '2026-01-01', intakeKcal: 1500, days: 365 });
  assert.ok(staticAtSameDay < rows.at(-1).weightKg, 'static rule should predict more loss after a year');
});

test('unreachable goal reports the plateau', () => {
  const res = dateToReachGoal(woman, { startDate: '2026-01-01', intakeKcal: 2000, goalKg: 60, maxDays: 3650 });
  assert.equal(res.reached, false);
  assert.ok(res.plateauKg > 60);
});

test('intakeForGoal hits the goal on the goal date', () => {
  const res = intakeForGoal(woman, { startDate: '2026-01-01', goalDate: '2026-07-01', goalKg: 78 });
  assert.equal(res.feasible, true);
  const { rows } = projectByDate(woman, { startDate: '2026-01-01', endDate: '2026-07-01', intakeKcal: res.intakeKcal });
  assert.ok(Math.abs(rows.at(-1).weightKg - 78) < 0.01);
  assert.ok(res.maintenanceAfterGoalKcal < res.baselineMaintenanceKcal);
  assert.ok(res.maintenanceAfterGoalKcal > res.intakeKcal);
});

test('intakeForGoal flags impossible deadlines', () => {
  const res = intakeForGoal(woman, { startDate: '2026-01-01', goalDate: '2026-01-15', goalKg: 70 });
  assert.equal(res.feasible, false);
});

test('safety checks', () => {
  const codes = (r) => r.map((x) => x.code);
  assert.deepEqual(codes(safetyChecks(woman, { intakeKcal: 700 })), ['vlcd']);
  assert.deepEqual(codes(safetyChecks(woman, { intakeKcal: 1100 })), ['low-intake']);
  assert.deepEqual(codes(safetyChecks(woman, { intakeKcal: 1600 })), []);
  assert.deepEqual(codes(safetyChecks(woman, { goalKg: 48 })), ['underweight-goal']);
  assert.deepEqual(codes(safetyChecks({ ...woman, age: 16 }, {})), ['minor']);
  const big = { sex: 'male', age: 40, heightCm: 180, weightKg: 150, pal: 1.5 };
  const { rows } = projectByDate(big, { startDate: '2026-01-01', intakeKcal: 1500, days: 60 });
  assert.ok(codes(safetyChecks(big, { rows })).includes('fast-loss'));
  const long = projectByDate(woman, { startDate: '2026-01-01', intakeKcal: 1500, days: 365 * 4 }).rows;
  assert.ok(codes(safetyChecks(woman, { rows: long })).includes('underweight-projection'));
});

test('projectRange brackets the central projection', () => {
  const { rows } = projectRange(woman, { startDate: '2026-01-01', intakeKcal: 1600, days: 180 });
  const last = rows.at(-1);
  assert.ok(last.lowKg < last.weightKg && last.weightKg < last.highKg);
  assert.equal(rows[0].lowKg, 85);
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-01-01', '2026-12-31'), 364);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
});

test('any calorie amount gets a projection (very low intake warns, never blocks)', () => {
  for (const intakeKcal of [0, 300, 799, 8000]) {
    const res = projectRange(woman, { startDate: '2026-01-01', intakeKcal, days: 365 * 2 });
    assert.ok(res.rows.length > 1);
    const checks = safetyChecks(woman, { intakeKcal, rows: res.rows });
    assert.ok(checks.every((c) => c.level !== 'block'));
  }
  const starve = projectRange(woman, { startDate: '2026-01-01', intakeKcal: 0, days: 365 * 2 });
  assert.equal(starve.stopReason, 'survival-limit');
  const lastBmi = bmi(starve.rows.at(-1).weightKg, woman.heightCm);
  assert.ok(lastBmi < 12 && lastBmi > 11.5, `got ${lastBmi}`);
  const goal = dateToReachGoal(woman, { startDate: '2026-01-01', intakeKcal: 0, goalKg: 25 });
  assert.equal(goal.reached, false);
  assert.equal(goal.stopReason, 'survival-limit');
});
