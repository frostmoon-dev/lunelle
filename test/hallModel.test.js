import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBaseline, simulate, maintenanceKcalForState } from '../src/hallModel.js';
import { kcalToKj, kjToKcal } from '../src/units.js';

// Worked example from Hall et al. 2011 (Lancet), Figure 3: a 100 kg, 180 cm,
// 23-year-old man at 12.7 MJ/day cuts intake by 5 MJ/day to reach 80 kg in
// 180 days, then needs 10.9 MJ/day to stay there.
const man = { sex: 'male', age: 23, heightCm: 180, weightKg: 100 };

test('baseline expenditure matches the paper (12.7 MJ/day)', () => {
  const base = createBaseline(man);
  assert.ok(Math.abs(base.eiBKj / 1000 - 12.7) < 0.1, `got ${base.eiBKj / 1000} MJ`);
});

test('no change in intake keeps weight stable', () => {
  const base = createBaseline(man);
  const rows = simulate(base, [{ startDay: 0, intakeKcal: kjToKcal(base.eiBKj) }], 365);
  assert.ok(Math.abs(rows.at(-1).weightKg - 100) < 1e-6);
});

test('Lancet Figure 3: about 80 kg after 180 days at -5 MJ/day', () => {
  const base = createBaseline(man);
  const intakeKcal = kjToKcal(base.eiBKj - 5000);
  const rows = simulate(base, [{ startDay: 0, intakeKcal }], 180);
  assert.ok(Math.abs(rows.at(-1).weightKg - 80) < 0.5, `got ${rows.at(-1).weightKg}`);
});

test('Lancet Figure 3: maintenance after reaching 80 kg is about 10.9 MJ/day', () => {
  const base = createBaseline(man);
  const rows = simulate(base, [{ startDay: 0, intakeKcal: kjToKcal(base.eiBKj - 5000) }], 180);
  const maintMJ = kcalToKj(maintenanceKcalForState(base, rows.at(-1))) / 1000;
  assert.ok(Math.abs(maintMJ - 10.9) < 0.15, `got ${maintMJ} MJ`);
});

test('rule of thumb: ~10 kcal/day per lb of eventual change (100 kJ/day per kg)', () => {
  const base = createBaseline(man);
  const cutKj = 2000;
  const rows = simulate(base, [{ startDay: 0, intakeKcal: kjToKcal(base.eiBKj - cutKj) }], 365 * 15);
  const lostKg = 100 - rows.at(-1).weightKg;
  const kjPerKg = cutKj / lostKg;
  assert.ok(kjPerKg > 80 && kjPerKg < 120, `got ${kjPerKg} kJ/day per kg`);
});

test('weight loss slows over time (curve, not a straight line)', () => {
  const base = createBaseline(man);
  const rows = simulate(base, [{ startDay: 0, intakeKcal: kjToKcal(base.eiBKj) - 500 }], 730);
  const firstYear = rows[0].weightKg - rows[365].weightKg;
  const secondYear = rows[365].weightKg - rows[730].weightKg;
  assert.ok(secondYear < firstYear / 2);
});

test('rejects under-18s and impossible inputs', () => {
  assert.throws(() => createBaseline({ ...man, age: 16 }), RangeError);
  assert.throws(() => createBaseline({ ...man, pal: 3 }), RangeError);
  const base = createBaseline(man);
  assert.throws(() => simulate(base, [{ startDay: 0, intakeKcal: -1 }], 10), RangeError);
  assert.throws(() => simulate(base, [{ startDay: 5, intakeKcal: 2000 }], 10), RangeError);
});

test('zero intake stops the run when fat runs out instead of throwing', () => {
  const base = createBaseline(man);
  const rows = simulate(base, [{ startDay: 0, intakeKcal: 0 }], 365 * 3);
  assert.ok(rows.stoppedOnDay > 30 && rows.stoppedOnDay < 365 * 3);
  assert.equal(rows.length, rows.stoppedOnDay + 1);
  assert.ok(rows.at(-1).fatKg <= 0.5);
});
