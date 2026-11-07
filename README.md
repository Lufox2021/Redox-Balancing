# Balancing Redox Reactions

A student tool for balancing oxidation–reduction reactions by the half-reaction method, in acidic and basic solution. Built for General Chemistry at Campbell University (Tad Fox).

**Live tool:** https://lufox2021.github.io/redox-balancing/ (once GitHub Pages is on: Settings → Pages → Deploy from a branch → `main`, `/ (root)`).

## Tabs

- **Review:** oxidation-number rules, the method step by step, and two worked examples (acidic and basic).
- **Coaching:** students work through each step, and each one is checked before the next unlocks:
  1. oxidation numbers and who is oxidized/reduced
  2. split into half-reactions
  3. balance atoms other than O and H
  4. balance O with H₂O (skipped when a half has no O)
  5. balance H with H⁺ (skipped when a half has no O or H)
  6. balance charge with electrons
  7. equalize electrons
  8. add and cancel
  9. convert to basic (basic problems only)

  A live atom and charge count sits under every equation box. Feedback goes hint → rule → "Show me".
- **Testing:** levels 1–5 with unlimited tries:
  1. metals and ions
  2. acidic
  3. basic
  4. disproportionation and multi-element
  5. organic

  Answers that aren't in lowest terms count as correct, with a note.
- **Instructor:** upload a spreadsheet of problems and get a `problems.json`.

## Updating the problems students see

1. Make a spreadsheet with the columns `id, level, equation, medium`, and save it as `.csv` or tab-delimited `.txt`. The tool balances every problem itself, so no answer key is needed.
   - `level` is 1–5.
   - `equation` is written the way students type it, e.g. `Cr2O7^2- + Fe^2+ -> Cr^3+ + Fe^3+`.
   - `medium` is `acidic` or `basic`.
2. In the Instructor tab, upload it, fix any flagged rows, then click **Download problems.json**.
3. On GitHub: **Add file → Upload files**, upload `problems.json`, and commit. The page reads it when it opens. Without the file, the page uses its 56 built-in problems.

## Files

- `index.html`: the complete tool, a single self-contained page. This is what students load.
- `src/`: the pieces `index.html` is built from: `engine.js` (parser, oxidation numbers, balancing), `problems.js` (built-in problems), `ui.js` and `template.html`. Rebuild with `python3 build.py`.
- `test/`: checks used during development (`node test/solve_all.js` solves and verifies every built-in problem).
