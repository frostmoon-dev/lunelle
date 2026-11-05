# Lunelle

Weight-management site. See how your weight is likely to change, date by date, at a given daily calorie intake.

## Run it

Requires Node 20+. No packages to install.

```bash
npm start
```

Then open http://localhost:5173

In Visual Studio: **File → Open → Folder** (needs the **Node.js development** workload), right-click `package.json` → **Npm** → **npm run script start**, then open the URL above.

Other commands:

```bash
npm test
```

```bash
npm run example -- 1800
```

## What's here

- `web/`: the page (plain HTML/CSS/JS, brutalist monochrome theme, light and dark)
- `src/`: the dependency-free projection engine, which runs in the browser or in Node
  - `hallModel.js`: dynamic body-weight model (Hall et al., Lancet 2011, the model behind the NIH Body Weight Planner)
  - `planner.js`: date-by-date projections with a ±5% band, goal date, calories needed for a goal date, maintenance after the goal, safety checks
  - `body.js`: BMI, waist-to-height, Mifflin-St Jeor, Katch-McArdle, US Navy body fat, Jackson fat mass, PAL bands
  - `units.js`: kcal/kJ, kg/lb, cm/inch
- `scripts/serve.js`: tiny local web server
- `docs/RESEARCH.md`: research, feature plan, formulas, safety rules, sources

Not medical advice. Projections assume perfect adherence and carry about ±5% uncertainty in energy needs.
