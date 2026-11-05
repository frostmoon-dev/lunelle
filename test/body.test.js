import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bmi, bmiCategory, healthyWeightRange, waistToHeight, mifflinStJeor,
  katchMcArdle, navyBodyFat, jacksonFatMassKg,
} from '../src/body.js';

test('BMI and categories', () => {
  assert.ok(Math.abs(bmi(70, 175) - 22.857) < 0.001);
  assert.equal(bmiCategory(24), 'healthy');
  assert.equal(bmiCategory(24, { asian: true }), 'overweight');
  assert.equal(bmiCategory(31), 'obese');
  assert.equal(bmiCategory(17), 'underweight');
  const r = healthyWeightRange(170);
  assert.ok(Math.abs(r.minKg - 53.465) < 0.001 && Math.abs(r.maxKg - 72.25) < 0.001);
});

test('waist-to-height bands', () => {
  assert.equal(waistToHeight(80, 170).band, 'healthy');
  assert.equal(waistToHeight(90, 170).band, 'increased');
  assert.equal(waistToHeight(105, 170).band, 'high');
});

test('Mifflin-St Jeor', () => {
  assert.equal(mifflinStJeor({ sex: 'male', weightKg: 100, heightCm: 180, age: 23 }), 2015);
  assert.equal(mifflinStJeor({ sex: 'female', weightKg: 70, heightCm: 165, age: 40 }), 1370.25);
});

test('Katch-McArdle', () => {
  assert.equal(katchMcArdle({ weightKg: 80, bodyFatPercent: 25 }), 370 + 21.6 * 60);
});

test('Navy body fat gives plausible values', () => {
  const m = navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 90 });
  assert.ok(m > 15 && m < 22, `got ${m}`);
  const f = navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75, hipCm: 100 });
  assert.ok(f > 25 && f < 33, `got ${f}`);
});

test('Jackson fat mass is plausible', () => {
  const fm = jacksonFatMassKg({ sex: 'female', weightKg: 80, heightCm: 165, age: 40 });
  assert.ok(fm > 30 && fm < 40, `got ${fm}`);
});
