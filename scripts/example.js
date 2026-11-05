// Prints a sample projection: dynamic model vs. the old 3500-kcal rule.
// Usage: node scripts/example.js [intakeKcal]
import { projectByDate, staticRuleWeight, dateToReachGoal, intakeForGoal, safetyChecks } from '../src/planner.js';

const person = { sex: 'female', age: 35, heightCm: 165, weightKg: 85, pal: 1.5 };
const intakeKcal = Number(process.argv[2] ?? 1500);
const startDate = '2026-01-01';

const { baselineMaintenanceKcal, rows } = projectByDate(person, { startDate, intakeKcal, days: 730 });
console.log(`Person: ${JSON.stringify(person)}`);
console.log(`Estimated maintenance: ${baselineMaintenanceKcal.toFixed(0)} kcal/day; plan: ${intakeKcal} kcal/day\n`);
console.log('date        day   model kg  fat kg  lean kg  3500-rule kg');
for (const day of [0, 7, 14, 28, 56, 91, 182, 273, 365, 547, 730]) {
  const r = rows[day];
  const rule = staticRuleWeight({ startWeightKg: person.weightKg, maintenanceKcal: baselineMaintenanceKcal, intakeKcal, days: day });
  console.log(`${r.date}  ${String(day).padStart(4)}  ${r.weightKg.toFixed(1).padStart(8)}  ${r.fatKg.toFixed(1).padStart(6)}  ${r.leanKg.toFixed(1).padStart(7)}  ${rule.toFixed(1).padStart(12)}`);
}

const goal = dateToReachGoal(person, { startDate, intakeKcal, goalKg: 75 });
console.log(`\nReach 75 kg: ${goal.reached ? goal.date : 'never'} (plateau ${goal.plateauKg.toFixed(1)} kg)`);

const plan = intakeForGoal(person, { startDate, goalDate: '2026-07-01', goalKg: 78 });
if (plan.feasible) {
  console.log(`To be 78 kg on 2026-07-01: eat ${plan.intakeKcal.toFixed(0)} kcal/day, then ${plan.maintenanceAfterGoalKcal.toFixed(0)} kcal/day to stay there.`);
}
console.log('Safety:', safetyChecks(person, { intakeKcal, rows }));
