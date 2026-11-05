// Dynamic adult body-weight model from Hall KD et al., "Quantification of the
// effect of energy imbalance on bodyweight", Lancet 2011;378:826-37,
// supplementary webappendix, equations 1-9. This is the model behind the NIH
// Body Weight Planner.
//
// Internal units follow the paper: kJ, kg, days. Public inputs/outputs are kcal.
//
// One simplification: the paper's lean mass L excludes the initial
// extracellular fluid (ECF). We fold the initial ECF into L and track only the
// change in ECF. This is exact for the dynamics, because the constant K is
// fitted to the baseline and absorbs the fixed offset (gamma_L * ECF_init).

import { mifflinStJeor, jacksonFatMassKg } from './body.js';
import { kcalToKj, kjToKcal } from './units.js';

/** Parameters, verbatim from the webappendix (kJ, kg, days). */
export const PARAMS = Object.freeze({
  rhoF: 39500, // kJ/kg, energy density of fat
  rhoL: 7600, // kJ/kg, energy density of lean tissue
  rhoG: 17600, // kJ/kg, energy density of glycogen
  gammaF: 13, // kJ/kg/day, RMR per kg fat
  gammaL: 92, // kJ/kg/day, RMR per kg lean
  etaF: 750, // kJ/kg, cost of fat synthesis
  etaL: 960, // kJ/kg, cost of lean synthesis
  betaTEF: 0.1, // thermic effect of feeding
  betaAT: 0.14, // adaptive thermogenesis
  tauAT: 14, // days
  forbesC: 10.4, // kg
  glycogenInitKg: 0.5,
  glycogenWaterRatio: 2.7, // g water stored per g glycogen
  sodiumConc: 3220, // mg/L ([Na] = 3.22 mg/ml)
  xiNa: 3000, // mg/L/day
  xiCI: 4000, // mg/day
});

const DT = 0.1; // integration step, days (RK4)

/**
 * Validate and set up the baseline state for one adult, assumed weight-stable
 * at baseline (intake = expenditure), as in the paper.
 *
 * @param {object} person
 * @param {'male'|'female'} person.sex
 * @param {number} person.age years, adults only (>= 18)
 * @param {number} person.heightCm
 * @param {number} person.weightKg
 * @param {number} [person.pal=1.5] physical activity level (paper default: 1.5)
 * @param {number} [person.fatKg] measured fat mass; estimated if omitted
 * @param {number} [person.rmrKcal] measured resting rate; Mifflin-St Jeor if omitted
 * @param {number} [person.carbFraction=0.5] share of calories from carbohydrate
 */
export function createBaseline(person) {
  const { sex, age, heightCm, weightKg } = person;
  const pal = person.pal ?? 1.5;
  const carbFraction = person.carbFraction ?? 0.5;
  if (!(age >= 18)) throw new RangeError('The adult model is only valid for age 18 and over');
  // FAO/WHO/UNU 2001: PAL values sustainable long term range from about 1.40 to 2.40.
  if (!(pal >= 1.4 && pal <= 2.4)) throw new RangeError(`pal must be between 1.4 and 2.4, got ${pal}`);
  if (!(carbFraction >= 0 && carbFraction <= 1)) throw new RangeError('carbFraction must be in [0, 1]');

  const P = PARAMS;
  const rmr = kcalToKj(person.rmrKcal ?? mifflinStJeor({ sex, weightKg, heightCm, age }));
  const eiB = pal * rmr; // weight-stable baseline: intake = expenditure
  const delta = ((1 - P.betaTEF) * pal - 1) * rmr / weightKg; // eq 8

  const fat0 = person.fatKg ?? jacksonFatMassKg({ sex, weightKg, heightCm, age });
  const glycogenMass0 = P.glycogenInitKg * (1 + P.glycogenWaterRatio);
  const lean0 = weightKg - fat0 - glycogenMass0;
  if (!(fat0 > 0) || !(lean0 > 0)) {
    throw new RangeError('Estimated body composition is out of range; enter a measured fat mass');
  }

  const K = eiB - P.gammaF * fat0 - P.gammaL * lean0 - delta * weightKg; // eq 5 at baseline
  const ciB = carbFraction * eiB;
  const kG = ciB / (P.glycogenInitKg ** 2);

  return Object.freeze({
    sex, age, heightCm, weightKg, pal, carbFraction,
    rmrKj: rmr, eiBKj: eiB, delta, K, ciBKj: ciB, kG,
    initialState: Object.freeze({ F: fat0, L: lean0, G: P.glycogenInitKg, dECF: 0, AT: 0 }),
  });
}

/** Body weight from state (kg). */
export function bodyWeight(s) {
  return s.F + s.L + s.G * (1 + PARAMS.glycogenWaterRatio) + s.dECF;
}

/** Delta (activity coefficient) for a new PAL, relative to baseline RMR and weight. */
function deltaForPal(base, pal) {
  return ((1 - PARAMS.betaTEF) * pal - 1) * base.rmrKj / base.weightKg;
}

/** Right-hand side of the ODE system. Inputs: EI, CI in kJ/day. */
function derivatives(base, s, input) {
  const P = PARAMS;
  const { EI, CI, delta, sodiumChangeMg } = input;
  const dEI = EI - base.eiBKj;

  const dG = (CI - base.kG * s.G * s.G) / P.rhoG; // eq 1
  const dECF = (sodiumChangeMg - P.xiNa * s.dECF - P.xiCI * (1 - (base.ciBKj > 0 ? CI / base.ciBKj : 1)))
    / P.sodiumConc; // eq 2 (litres ≈ kg)

  const TEF = P.betaTEF * dEI; // eq 6
  const BW = bodyWeight(s);
  const c = P.forbesC * P.rhoL / P.rhoF;
  const p = c / (c + s.F);
  const w = p * P.etaL / P.rhoL + (1 - p) * P.etaF / P.rhoF;
  const storedG = P.rhoG * dG;

  // eq 9: closed form for total energy expenditure
  const EE = (base.K + P.gammaF * s.F + P.gammaL * s.L + delta * BW + TEF + s.AT + (EI - storedG) * w) / (1 + w);
  const imbalance = EI - EE - storedG;

  return {
    d: {
      F: (1 - p) * imbalance / P.rhoF, // eq 3
      L: p * imbalance / P.rhoL, // eq 3
      G: dG,
      dECF,
      AT: (P.betaAT * dEI - s.AT) / P.tauAT, // eq 7
    },
    EE,
  };
}

function addScaled(s, d, h) {
  return { F: s.F + h * d.F, L: s.L + h * d.L, G: s.G + h * d.G, dECF: s.dECF + h * d.dECF, AT: s.AT + h * d.AT };
}

function rk4Step(base, s, input, h) {
  const k1 = derivatives(base, s, input).d;
  const k2 = derivatives(base, addScaled(s, k1, h / 2), input).d;
  const k3 = derivatives(base, addScaled(s, k2, h / 2), input).d;
  const k4 = derivatives(base, addScaled(s, k3, h), input).d;
  const out = {};
  for (const key of Object.keys(s)) {
    out[key] = s[key] + (h / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]);
  }
  return out;
}

/**
 * Normalise a plan into a function day -> input.
 * A plan is a list of phases, each starting on `startDay` (0-based) and lasting
 * until the next phase: { startDay, intakeKcal, pal?, carbFraction?, sodiumChangeMg? }.
 */
function planToInputs(base, phases) {
  if (!Array.isArray(phases) || phases.length === 0) throw new RangeError('phases must be a non-empty array');
  const sorted = [...phases].sort((a, b) => a.startDay - b.startDay);
  if (sorted[0].startDay !== 0) throw new RangeError('the first phase must start on day 0');
  for (const ph of sorted) {
    if (!(ph.intakeKcal >= 0)) throw new RangeError(`intakeKcal must be >= 0, got ${ph.intakeKcal}`);
  }
  return (day) => {
    let ph = sorted[0];
    for (const candidate of sorted) if (candidate.startDay <= day) ph = candidate;
    const EI = kcalToKj(ph.intakeKcal);
    const carb = ph.carbFraction ?? base.carbFraction;
    if (ph.pal !== undefined && !(ph.pal >= 1.4 && ph.pal <= 2.4)) {
      throw new RangeError(`phase pal must be between 1.4 and 2.4, got ${ph.pal}`);
    }
    return {
      EI,
      CI: carb * EI,
      delta: ph.pal === undefined ? base.delta : deltaForPal(base, ph.pal),
      sodiumChangeMg: ph.sodiumChangeMg ?? 0,
    };
  };
}

/**
 * Simulate `days` days. Returns one record per day (day 0 = start).
 * Inputs are held constant within each day.
 * If fat mass runs out (below 0.5 kg) the model is no longer meaningful, so the
 * run stops early: the array is shorter and carries `stoppedOnDay`.
 */
export function simulate(base, phases, days) {
  if (!(Number.isInteger(days) && days >= 0 && days <= 365 * 20)) {
    throw new RangeError('days must be an integer between 0 and 7300');
  }
  const inputFor = planToInputs(base, phases);
  let s = { ...base.initialState };
  const records = [];
  const record = (day, input) => {
    const { EE } = derivatives(base, s, input);
    records.push({
      day,
      weightKg: bodyWeight(s),
      fatKg: s.F,
      leanKg: s.L,
      glycogenKg: s.G,
      intakeKcal: kjToKcal(input.EI),
      expenditureKcal: kjToKcal(EE),
    });
  };

  for (let day = 0; day < days; day++) {
    const input = inputFor(day);
    record(day, input);
    const steps = Math.round(1 / DT);
    for (let i = 0; i < steps; i++) s = rk4Step(base, s, input, DT);
    if (!(s.F > 0.5)) {
      record(day + 1, input);
      records.stoppedOnDay = day + 1;
      return records;
    }
  }
  record(days, inputFor(days));
  return records;
}

/** Baseline maintenance intake (kcal/day). */
export function baselineMaintenanceKcal(base) {
  return kjToKcal(base.eiBKj);
}

/**
 * Intake (kcal/day) that holds the given state's fat and lean mass steady.
 * At steady state dF/dt = dL/dt = 0, AT = betaAT*dEI and TEF = betaTEF*dEI,
 * so EI = (K + gF*F + gL*L + delta*BW - beta*EI_b) / (1 - beta).
 */
export function maintenanceKcalForState(base, state, pal) {
  const P = PARAMS;
  const beta = P.betaAT + P.betaTEF;
  const delta = pal === undefined ? base.delta : deltaForPal(base, pal);
  const bw = state.weightKg ?? bodyWeight(state);
  const F = state.F ?? state.fatKg;
  const L = state.L ?? state.leanKg;
  const ei = (base.K + P.gammaF * F + P.gammaL * L + delta * bw - beta * base.eiBKj) / (1 - beta);
  return kjToKcal(ei);
}
