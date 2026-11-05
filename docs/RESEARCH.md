# Weight-management site: research

Status: research + working projection engine (`src/`). Last updated 2026-11-05.

How claims are labelled:

- **Documented**: stated in the cited primary or official source, which I read.
- **Secondary**: found only in secondary sources (calculators, blogs, summaries). Check before you rely on it.
- **Inference**: my own reasoning or design choice, not taken from a source.
- **⚠️ VERIFY**: not confirmed. It says how to check.

---

## 1. Summary

1. **Don't use the "3500 kcal = 1 lb" rule for projections.** It assumes the deficit never shrinks, so it predicts loss going on forever in a straight line. Real loss slows down and levels off. In our 2-year example it predicts 7.6 kg for a woman who would really reach about 52 kg. (Documented: Hall 2011; Thomas 2013.)
2. **Use the NIH/Hall dynamic model instead.** It is the model behind the NIH Body Weight Planner. It is published with every equation and parameter, it was validated against controlled feeding studies, and it is now implemented in `src/hallModel.js`. Our implementation reproduces the paper's own worked example within 0.1 kg. (Documented + tested.)
3. **Always show a range, never one number.** A person's daily energy needs can't be estimated better than about ±5%. Over a year that becomes several kg of uncertainty. (Documented: Hall 2011.)
4. **The real product is the feedback loop.** Logged weight plus logged intake lets the site re-estimate each user's true maintenance calories, which beats any formula. (Inference, based on how adaptive-TDEE apps describe their method.)
5. **Safety rules are part of the product.** That means minimum intakes, rate caps, no underweight goals, and no plans for minors or during pregnancy. (Sources in §5.)

---

## 2. Feature catalogue

Priority: **P0** = MVP, **P1** = next, **P2** = later.

### 2.1 Calculators (no account needed)

| Feature | Priority | Notes |
|---|---|---|
| BMI + category + healthy weight range for height | P0 | WHO cut-offs; optional lower Asian cut-offs (23 / 27.5). `body.js: bmi, bmiCategory, healthyWeightRange` |
| Waist-to-height ratio | P0 | Bands: <0.5 healthy, 0.5–0.59 increased, ≥0.6 high. `waistToHeight` |
| Resting metabolic rate (RMR/BMR) | P0 | Mifflin-St Jeor by default; Katch-McArdle if the user knows their body-fat %. |
| Maintenance calories (TDEE) | P0 | RMR × activity level (PAL). Use the FAO PAL bands (§4.3). |
| Body-fat estimate | P1 | US Navy tape method; Jackson BMI-based estimate as fallback. |
| Protein target | P1 | g/kg body weight during a deficit (§4.6). |

### 2.2 Planner (the core feature)

| Feature | Priority | Function in `src/planner.js` |
|---|---|---|
| **"If I eat X kcal/day, what will I weigh on each date?"** Curve + table, with a ±5% band | P0 | `projectByDate`, `projectRange`, `weekly` |
| **"When will I reach my goal at X kcal/day?"** Returns a date, or "never" plus the plateau weight | P0 | `dateToReachGoal` |
| **"What must I eat to weigh Y kg by date D?"** | P0 | `intakeForGoal` (bisection on the model) |
| **Maintenance calories after reaching the goal** (lower than before the diet) | P0 | returned by `intakeForGoal`; `maintenanceKcalForState` |
| Comparison with the 3500-kcal rule (teaching moment) | P1 | `staticRuleWeight` |
| Multi-phase plans (diet → diet break → maintenance; activity changes on dates) | P1 | `phases` option of `projectByDate` |
| Activity change ("I'll go from sedentary to active on 1 March") | P1 | phase `pal` |
| Carb change (low-carb plans show a bigger first-week drop from glycogen and water) | P2 | phase `carbFraction` |
| Safety checks on every plan | P0 | `safetyChecks` |

### 2.3 Tracking

| Feature | Priority | Notes |
|---|---|---|
| Daily weigh-in log + **trend line** | P0 | Exponential moving average; one common choice moves 10% toward each new reading. Daily scale noise (water, food in gut) hides real change. (Secondary) |
| **Actual vs. projected** chart | P0 | Shows whether the user is on track. Re-project from today's trend weight. |
| Calorie / food log | P1 | Needs a food database. ⚠️ VERIFY: USDA FoodData Central API terms and licence before use (check fdc.nal.usda.gov). |
| **Adaptive maintenance estimate** from logs | P1 | Real maintenance ≈ average logged intake − (trend change in kg × energy per kg) ÷ days. Needs about 2–4 weeks of data. (Secondary/Inference.) A better version fits the Hall model to the user's data. |
| Measurements (waist, hip, neck) | P1 | Feeds waist-to-height and body fat. |
| Progress photos | P2 | Store privately; these are sensitive data. |
| Reminders, streaks, habit check-ins | P2 | |

### 2.4 Content and support

- Short explainers: why the scale jumps day to day, why the first week is fast (glycogen + water), why loss slows, why maintenance is lower after weight loss. (P1)
- A "plateau helper": when the trend is flat for 2–3 weeks, compare the logged intake with the model's current maintenance. (P2, Inference)
- Export data (CSV) and delete account. (P1)

### 2.5 Safety and trust (non-negotiable)

- Screening on sign-up: age, pregnancy or breastfeeding, history of an eating disorder. Show no calorie-deficit plans to blocked groups; point them to a professional. (Inference; standard practice)
- Floors, rate warnings and underweight blocks (§5).
- A clear "not medical advice" notice, plus "talk to a doctor" for BMI ≥ 40, diabetes medication, or GLP-1/obesity medication. (Inference)
- Health data is sensitive. ⚠️ VERIFY your legal duties for the countries you serve (for example GDPR "special category" data in the EU/UK, or US state health-privacy laws) with a lawyer.

---

## 3. How much weight over the dates: the core question

### 3.1 Why the simple rule fails

The old rule: 1 lb of body weight ≈ 3500 kcal (≈ 7700 kcal/kg), so a 500 kcal/day deficit = 1 lb/week, forever.

Problems (Documented, Hall 2011 and Hall & Chow 2013):

- **The deficit shrinks.** As you get lighter, you burn less: there's less tissue to maintain and less weight to carry around. Eating the same amount then produces a smaller and smaller deficit.
- **Adaptive thermogenesis.** Expenditure drops a bit more than body size alone explains.
- **Loss isn't pure fat.** Some lean tissue is lost too, and lean tissue holds far less energy per kg (7.6 MJ/kg vs 39.5 MJ/kg for fat).
- **The first weeks are mostly water.** Lower intake drains glycogen, and each gram of glycogen is stored with about 2.7 g of water.

Evidence: Thomas et al. (2013) compared the rule with seven tightly controlled studies. People lost **20.1 ± 11.3 lb vs 27.6 ± 16.0 lb predicted**. (Secondary: abstract-level check.)

### 3.2 The rule of thumb that works

> For an average overweight adult, every 10 kcal/day of permanent change in intake gives about 1 lb of eventual weight change (100 kJ/day per kg). About half of it happens in ~1 year and 95% in ~3 years. (Hall 2011, Documented.)

Example: cutting 250 kcal/day permanently → about 25 lb (≈ 11 kg) eventually, **not** 26 lb per year forever.

The same rule applied to maintenance: someone who has lost 10 kg needs about **220 kcal/day less** than before the diet to stay there. (Inference from the rule; our model agrees: 100 → 80 kg needs 12.7 → 10.9 MJ/day.)

### 3.3 The dynamic model (implemented)

Source: Hall et al. 2011 Lancet supplementary webappendix, equations 1–9 (Documented; read from the PDF).

State variables: fat mass **F**, lean mass **L**, glycogen **G**, change in extracellular fluid **ΔECF**, adaptive thermogenesis **AT**.

```
Glycogen:      ρG·dG/dt = CI − kG·G²                      kG = CI_b / G_init²
ECF:           dECF/dt  = (ΔNa − ξNa·(ECF−ECF_init) − ξCI·(1 − CI/CI_b)) / [Na]
Fat:           ρF·dF/dt = (1−p)·(EI − EE − ρG·dG/dt)
Lean:          ρL·dL/dt =    p ·(EI − EE − ρG·dG/dt)
Partition:     p = C/(C+F),   C = 10.4 kg × ρL/ρF          (Forbes curve)
Expenditure:   EE = K + γF·F + γL·L + δ·BW + TEF + AT + ηL·dL/dt + ηF·dF/dt
TEF:           TEF = βTEF·ΔEI
Adaptation:    τAT·dAT/dt = βAT·ΔEI − AT
Activity:      δ = [(1−βTEF)·PAL − 1]·RMR / BW             (RMR from Mifflin-St Jeor)
Body weight:   BW = F + L + G·(1+2.7) + ΔECF
```

EE depends on dF/dt and dL/dt, and they depend on EE. The paper solves this in closed form (eq. 9), and we use that.

| Parameter | Value | Meaning |
|---|---|---|
| ρF, ρL, ρG | 39.5, 7.6, 17.6 MJ/kg | energy per kg of fat, lean tissue, glycogen |
| γF, γL | 13, 92 kJ/kg/day | resting burn per kg of fat, of lean tissue |
| ηF, ηL | 750, 960 kJ/kg | energy cost of building fat, lean tissue |
| βTEF | 0.10 | thermic effect of food |
| βAT, τAT | 0.14, 14 days | size and speed of adaptive thermogenesis |
| C (Forbes) | 10.4 kg | how fat vs lean loss splits, by body fat |
| G_init | 0.5 kg | starting glycogen |
| [Na], ξNa, ξCI | 3.22 mg/ml, 3000 mg/L/d, 4000 mg/d | sodium and fluid balance |
| PAL default | 1.5 | sedentary |
| Starting fat mass | Jackson et al. equation from BMI, age, sex (eq. 4) | unless the user enters a measured value |

Baseline assumption: the user is weight-stable when they start, so today's intake equals today's expenditure. K is set so this holds.

**Implementation notes** (Inference / engineering):

- Integrated with 4th-order Runge-Kutta at 0.1-day steps. Inputs are constant within a day; output is daily.
- The initial ECF is folded into L, and only ΔECF is tracked. This is exact, because K absorbs the constant.
- PAL is limited to 1.4–2.4, the long-term sustainable range per FAO/WHO/UNU. Age must be 18 or over; Hall's model for children is different.

**Validation (tests in `test/hallModel.test.js`):**

| Check | Paper | Ours |
|---|---|---|
| 100 kg, 180 cm, 23 y man; baseline needs | 12.7 MJ/day | 12.65 MJ/day |
| Same man, −5 MJ/day for 180 days | ≈ 80 kg | 79.9 kg |
| Intake to maintain 80 kg afterwards | 10.9 MJ/day | 10.87 MJ/day |
| Eventual change per unit intake change | ≈ 100 kJ/day per kg | within 80–120 (test) |

### 3.4 Example projections

The model gives a central value, with the range for ±5% uncertainty in energy needs in brackets. The "3500 rule" column is the static rule at the same date. Start date 2026-01-01. All people sedentary (PAL 1.5).

**Woman, 35 y, 165 cm, 85 kg. Estimated maintenance 2318 kcal/day.**

| Intake | 4 weeks | 3 months | 6 months | 1 year | 2 years | Plateau | 3500 rule at 1 y / 2 y |
|---|---|---|---|---|---|---|---|
| 1500 | 81.9 (81.5–82.3) | 77.4 (76.3–78.4) | 71.6 (69.7–73.5) | 62.4 (59.3–65.5) | 51.8 (47.6–56.2) | 45.9 ⚠️ underweight | 46.3 / 7.6 |
| 1800 | 83.0 (82.6–83.5) | 80.2 (79.1–81.2) | 76.6 (74.7–78.4) | 70.9 (67.8–74.0) | 64.0 (59.7–68.5) | 58.7 | 60.5 / 36.0 |
| 2000 | 83.8 (83.4–84.2) | 82.1 (81.0–83.1) | 79.9 (78.0–81.7) | 76.4 (73.3–79.5) | 72.1 (67.7–76.7) | 68.3 | 70.0 / 54.9 |

**Man, 40 y, 178 cm, 100 kg. Estimated maintenance 2876 kcal/day.**

| Intake | 4 weeks | 3 months | 6 months | 1 year | 2 years | Plateau | 3500 rule at 1 y / 2 y |
|---|---|---|---|---|---|---|---|
| 1800 | 96.0 (95.5–96.5) | 89.9 (88.6–91.2) | 82.1 (79.7–84.5) | 69.8 (65.7–73.9) | 57.4 (52.5–62.5) | 53.9 ⚠️ underweight | 49.1 / −1.8 |
| 2200 | 97.5 (97.0–98.0) | 93.7 (92.4–95.0) | 88.9 (86.6–91.3) | 81.5 (77.6–85.4) | 73.2 (68.0–78.6) | 68.6 | 68.0 / 36.0 |
| 2500 | 98.6 (98.1–99.1) | 96.5 (95.2–97.8) | 93.9 (91.6–96.2) | 89.8 (86.0–93.7) | 85.1 (79.7–90.7) | 81.5 | 82.2 / 64.4 |

What these tables teach (Inference from model output):

- For the first ~3 months the two methods agree within ~2–3 kg. That's why the old rule seems to work at first.
- After that they diverge badly. The static rule eventually predicts negative body weight.
- A fixed diet that is fine at the start can **end underweight** if followed forever. So the planner must offer a **switch to maintenance** at the goal (`underweight-projection` warning).
- The range widens over time: ±3 kg at 1 year, ±4–5 kg at 2 years. Show it, and narrow it using the user's own logged data (§2.3).

Regenerate with `npm run example [kcal]`.

### 3.5 What the model does NOT capture (tell users)

- **Adherence.** The model assumes perfect adherence. Real intake drifts back up over time, which is the main reason real-world loss is smaller. (Documented: Hall 2011 notes predictions assume adherence. In Hall 2010, an outpatient fit suggested the initial intake cut was kept for only ~6 weeks.)
- **Individual differences** in metabolism (±5% or more).
- Exercise effects on body composition (muscle gain from strength training), medications, illness, menstrual-cycle water changes.
- Children, pregnancy, very lean athletes.

---

## 4. Formulas (reference)

### 4.1 BMI and categories

BMI = kg / m². WHO: <18.5 underweight, 18.5–24.9 healthy, 25–29.9 overweight, ≥30 obese. Lower action points for Asian populations: 23 and 27.5 (WHO 2004 consultation, used by NICE). *(Secondary; ⚠️ VERIFY against the current NICE obesity guideline at nice.org.uk. Some sources write the boundary as 27.4, others as 27.5.)*

### 4.2 Resting metabolic rate

- **Mifflin-St Jeor (default):** `10·kg + 6.25·cm − 5·age + 5` (men) or `− 161` (women), kcal/day. The Frankenfield 2005 systematic review found it the most likely of the tested equations to land within 10% of measured RMR, with notable individual errors. Older adults and ethnic minorities were under-represented in the validation studies. *(Documented at abstract level.)*
- **Katch-McArdle:** `370 + 21.6 × lean mass (kg)`. Only useful with a decent body-fat measurement. *(Secondary.)*

### 4.3 Physical activity level (PAL)

FAO/WHO/UNU 2001, Table 5.3 *(Documented)*:

| Lifestyle | PAL |
|---|---|
| Sedentary or light activity | 1.40–1.69 |
| Active or moderately active | 1.70–1.99 |
| Vigorous or vigorously active | 2.00–2.40 |

"PAL values > 2.40 are difficult to maintain over a long period of time." Hall uses 1.5 for sedentary.

### 4.4 Body fat

- **US Navy** (inches; convert cm ÷ 2.54 first). Men: `86.010·log10(waist − neck) − 70.041·log10(height) + 36.76`. Women: `163.205·log10(waist + hip − neck) − 97.684·log10(height) − 78.387`. *(Secondary; consistent across several sources. Accuracy claims of ±3–4% vs DEXA are unverified.)*
- **Jackson et al. 2002** (used by Hall for the starting fat mass): `F = BW/100 × (0.14·age + 37.31·ln(BMI) − 103.94)` for men, `(0.14·age + 39.96·ln(BMI) − 102.01)` for women. *(Documented.)*

### 4.5 Waist-to-height ratio

<0.5 healthy, 0.5–0.59 increased, ≥0.6 high. *(Secondary, attributed to NICE. ⚠️ VERIFY against the current NICE guideline.)*

### 4.6 Protein during weight loss

Roughly 1.2–1.6 g/kg/day is widely recommended to protect lean mass. One review describes ~1.6 g/kg as the point beyond which there is little extra benefit. *(Secondary. ⚠️ VERIFY against the ISSN position stand and a dietitian before showing it as a target.)* For VLCDs, the 1993 NIH task force advised at least 1 g/kg of ideal body weight. *(Documented, abstract level.)*

---

## 5. Safety rules (implemented in `safetyChecks`)

| Rule | Level | Source / label |
|---|---|---|
| Age < 18 → no plan | block | Inference + Hall's adult model isn't valid for children; the `bw` R package warns for age < 18 |
| Pregnancy → no plan | block | Inference (standard practice) |
| Intake < 800 kcal/day → only under medical supervision | block | NICE CG189 defines VLCDs as 450–800 kcal/day; the NIH 1993 task force found them safe under medical supervision. Documented at abstract/summary level |
| Intake < 1200 (women) / 1500 (men) | warn | Commonly attributed to Harvard Health. ⚠️ VERIFY: secondary sources only, and one attributes different figures to NIH. Check Harvard Health Publishing directly |
| Goal BMI < 18.5 | block | WHO BMI categories |
| Projection goes below BMI 18.5 | warn | Inference from model output (§3.4) |
| > 1 kg/week after week 2 | warn | CDC: "about 1 to 2 pounds per week", linked to a 500–1000 kcal/day deficit. Secondary: archived CDC pages (2009, 2018) |

Also recommended (not yet implemented):

- An eating-disorder screening question that blocks deficit plans.
- A doctor prompt for BMI ≥ 40 or diabetes/obesity medication.

---

## 6. Suggested architecture (Inference)

- **The engine runs client-side.** `src/` is dependency-free ES modules and runs in a browser or in Node. Projections are instant and need no server, and calculator use needs no health data to leave the device.
- A server is needed only for accounts, logs and sync.
- Charting: weight-vs-date with the band (`lowKg`/`highKg`), a goal line, and actual-weight dots with the trend line.
- Store everything in metric and convert units only in the UI (`src/units.js`).

---

## 7. Sources

Primary, read directly:

- Hall KD, Sacks G, Chandramohan D, et al. *Quantification of the effect of energy imbalance on bodyweight.* Lancet 2011;378:826–37. https://pubmed.ncbi.nlm.nih.gov/21872751/ · author manuscript https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/
- Supplementary webappendix (all model equations and parameters): https://www.niddk.nih.gov/-/media/Files/Labs-Branches-Sections/laboratory-biological-modeling/integrative-physiology-section/Hall-Lancet-Web-Appendix_508.pdf
- Hall KD. *Predicting metabolic adaptation, body weight change, and energy intake in humans.* Am J Physiol Endocrinol Metab 2010;298:E449–66. https://pmc.ncbi.nlm.nih.gov/articles/PMC2838532/
- FAO/WHO/UNU. *Human energy requirements* (2001 consultation), ch. 5, Table 5.3. http://www.fao.org/4/y5686e/y5686e07.htm

Checked at abstract or summary level:

- NIDDK Body Weight Planner research page: https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner
- Frankenfield D et al. *Comparison of predictive equations for resting metabolic rate…: a systematic review.* J Am Diet Assoc 2005. https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/
- Thomas DM et al. 2013, and Hall & Chow 2013 reply, Int J Obes 37:1611–1615. https://pmc.ncbi.nlm.nih.gov/articles/PMC3859816/ · https://www.nature.com/articles/ijo2013112.pdf
- NIH National Task Force. *Very low-calorie diets.* JAMA 1993. https://pubmed.ncbi.nlm.nih.gov/8345648/
- NICE obesity guideline evidence (VLCD definition): https://www.ncbi.nlm.nih.gov/books/NBK311324/
- `bw` R package (an implementation of the same model; default PAL 1.5, warns for age < 18): https://rdrr.io/cran/bw/man/adult_weight.html · https://rdrr.io/cran/bw/src/R/adult_weight.R

Secondary (verify before relying on them):

- CDC "Losing Weight" (archived 2018): https://webharvest.gov/congress115th/20181203203029/https://www.cdc.gov/healthyweight/losing_weight/index.html
- Waist-to-height bands: https://gpnotebook.com/pages/obesity/waist-to-height-ratio-whr
- Asian BMI thresholds: https://patient.info/doctor/obesity-in-adults
- US Navy body-fat formula: https://med.libretexts.org/Courses/Irvine_Valley_College/Physiology_Labs_at_Home/03%3A_Anthropometrics/3.02%3A_Part_B-_Circumference_Measures/3.2.04%3A_Part_B4-_The_U.S._Navy_body_fat_estimation_formula
- Mifflin-St Jeor / Katch-McArdle formulas: https://www.inchcalculator.com/bmr-calculator/
- Protein and lean mass review: https://core.ac.uk/download/234043132.pdf
- Adaptive TDEE / trend-weight methods (blogs and open-source descriptions): https://rfivesix.github.io/train-libre/adaptive-nutrition/
