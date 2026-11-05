# Lunelle

Weight-management site. This first step contains the research and the weight-projection engine.

- **Research and feature plan:** [`docs/RESEARCH.md`](docs/RESEARCH.md)
- **Engine:** dependency-free ES modules in `src/`
  - `hallModel.js`: dynamic body-weight model (Hall et al., Lancet 2011, the model behind the NIH Body Weight Planner)
  - `planner.js`: date-by-date projections with an uncertainty band, goal date, calories needed for a goal date, maintenance after the goal, and safety checks
  - `body.js`: BMI, waist-to-height, Mifflin-St Jeor, Katch-McArdle, US Navy body fat, Jackson fat mass, PAL bands
  - `units.js`: kcal/kJ, kg/lb, cm/inch

```bash
npm test
```

```bash
npm run example -- 1800
```

Requires Node 20+. Not medical advice: projections assume perfect adherence and carry about ±5% uncertainty in energy needs.
