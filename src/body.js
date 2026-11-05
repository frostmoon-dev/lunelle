// Body measurement and energy-requirement formulas.
// Every formula cites its source in docs/RESEARCH.md (section "Formulas").
import { cmToInch } from './units.js';

function assertSex(sex) {
  if (sex !== 'male' && sex !== 'female') {
    throw new RangeError(`sex must be "male" or "female", got ${sex}`);
  }
}

function assertPositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

/** Body mass index, kg/m². */
export function bmi(weightKg, heightCm) {
  assertPositive('weightKg', weightKg);
  assertPositive('heightCm', heightCm);
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * Adult BMI category. WHO cut-offs by default; `asian: true` uses the lower
 * WHO 2004 / NICE action points (23 and 27.5).
 */
export function bmiCategory(value, { asian = false } = {}) {
  const [over, obese] = asian ? [23, 27.5] : [25, 30];
  if (value < 18.5) return 'underweight';
  if (value < over) return 'healthy';
  if (value < obese) return 'overweight';
  return 'obese';
}

/** Weight range (kg) that maps to a "healthy" BMI at this height. */
export function healthyWeightRange(heightCm, { asian = false } = {}) {
  assertPositive('heightCm', heightCm);
  const m2 = (heightCm / 100) ** 2;
  return { minKg: 18.5 * m2, maxKg: (asian ? 23 : 25) * m2 };
}

/** Waist-to-height ratio with NICE bands (healthy < 0.5, increased 0.5–0.59, high ≥ 0.6). */
export function waistToHeight(waistCm, heightCm) {
  assertPositive('waistCm', waistCm);
  assertPositive('heightCm', heightCm);
  const ratio = waistCm / heightCm;
  let band = 'healthy';
  if (ratio >= 0.6) band = 'high';
  else if (ratio >= 0.5) band = 'increased';
  return { ratio, band };
}

/** Mifflin-St Jeor resting metabolic rate, kcal/day. */
export function mifflinStJeor({ sex, weightKg, heightCm, age }) {
  assertSex(sex);
  assertPositive('weightKg', weightKg);
  assertPositive('heightCm', heightCm);
  assertPositive('age', age);
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Katch-McArdle resting metabolic rate, kcal/day. Needs a measured body-fat %. */
export function katchMcArdle({ weightKg, bodyFatPercent }) {
  assertPositive('weightKg', weightKg);
  if (!(bodyFatPercent >= 0 && bodyFatPercent < 100)) {
    throw new RangeError(`bodyFatPercent must be in [0, 100), got ${bodyFatPercent}`);
  }
  const leanKg = weightKg * (1 - bodyFatPercent / 100);
  return 370 + 21.6 * leanKg;
}

/**
 * Physical activity level (PAL = total expenditure / resting rate).
 * Bands from FAO/WHO/UNU 2001, Table 5.3. `default` is the value the user
 * starts with; 1.5 for sedentary matches Hall et al. 2011.
 */
export const PAL_BANDS = Object.freeze({
  sedentary: Object.freeze({ min: 1.4, max: 1.69, default: 1.5, label: 'Sedentary or light activity', short: 'Sedentary' }),
  active: Object.freeze({ min: 1.7, max: 1.99, default: 1.85, label: 'Active or moderately active', short: 'Active' }),
  vigorous: Object.freeze({ min: 2.0, max: 2.4, default: 2.2, label: 'Vigorous or vigorously active', short: 'Vigorous' }),
});

/** Total daily energy expenditure estimate, kcal/day. */
export function tdee(rmrKcal, pal) {
  assertPositive('rmrKcal', rmrKcal);
  assertPositive('pal', pal);
  return rmrKcal * pal;
}

/**
 * US Navy circumference body-fat %. Inputs in cm; the published constants
 * are for inches, so we convert before taking logs.
 */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }) {
  assertSex(sex);
  const h = cmToInch(heightCm);
  const neck = cmToInch(neckCm);
  const waist = cmToInch(waistCm);
  if (sex === 'male') {
    if (!(waist > neck)) throw new RangeError('waist must be larger than neck');
    return 86.01 * Math.log10(waist - neck) - 70.041 * Math.log10(h) + 36.76;
  }
  assertPositive('hipCm', hipCm);
  const hip = cmToInch(hipCm);
  if (!(waist + hip > neck)) throw new RangeError('waist + hip must be larger than neck');
  return 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(h) - 78.387;
}

/**
 * Jackson et al. (2002) fat mass from BMI, age and sex, kg.
 * This is equation 4 of the Hall et al. (2011) Lancet webappendix.
 */
export function jacksonFatMassKg({ sex, weightKg, heightCm, age }) {
  assertSex(sex);
  const b = bmi(weightKg, heightCm);
  const [slope, intercept] = sex === 'male' ? [37.31, -103.94] : [39.96, -102.01];
  return (weightKg / 100) * (0.14 * age + slope * Math.log(b) + intercept);
}
