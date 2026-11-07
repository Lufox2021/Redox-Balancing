/* ===================== Redox engine =====================
   Parser, oxidation numbers, half-reaction split, balancing.
   No dependencies. Works in the browser and in node (for testing). */

// ---------- Fractions ----------
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
function lcm(a, b) { return Math.abs(a * b) / (gcd(a, b) || 1); }
function Fr(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; }
const fadd = (a, b) => Fr(a.n * b.d + b.n * a.d, a.d * b.d);
const fsub = (a, b) => Fr(a.n * b.d - b.n * a.d, a.d * b.d);
const fmul = (a, b) => Fr(a.n * b.n, a.d * b.d);
const fdiv = (a, b) => Fr(a.n * b.d, a.d * b.n);
const feq = (a, b) => a.n === b.n && a.d === b.d;
function fstr(a) {
  if (a.n === 0) return '0';
  const s = a.n > 0 ? '+' : '−';
  return a.d === 1 ? s + Math.abs(a.n) : s + Math.abs(a.n) + '/' + a.d;
}

// ---------- Elements ----------
const ELEMENT_LIST = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os ' +
  'Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu').split(' ');
const ELEMENT_SET = new Set(ELEMENT_LIST);
const EN = { H: 2.20, Li: .98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: .93, Mg: 1.31, Al: 1.61, Si: 1.90,
  P: 2.19, S: 2.58, Cl: 3.16, K: .82, Ca: 1.00, Sc: 1.36, Ti: 1.54, V: 1.63, Cr: 1.66, Mn: 1.55, Fe: 1.83, Co: 1.88, Ni: 1.91,
  Cu: 1.90, Zn: 1.65, Ga: 1.81, Ge: 2.01, As: 2.18, Se: 2.55, Br: 2.96, Kr: 3.0, Rb: .82, Sr: .95, Mo: 2.16, Ag: 1.93,
  Cd: 1.69, Sn: 1.96, Sb: 2.05, Te: 2.1, I: 2.66, Xe: 2.6, Cs: .79, Ba: .89, Ce: 1.12, W: 2.36, Pt: 2.28, Au: 2.54,
  Hg: 2.00, Tl: 1.62, Pb: 2.33, Bi: 2.02, U: 1.38, Pd: 2.20, Ru: 2.2 };
const enOf = el => EN[el] ?? 1.5;
const ANION = { N: -3, P: -3, As: -3, Sb: -3, O: -2, S: -2, Se: -2, Te: -2, F: -1, Cl: -1, Br: -1, I: -1, C: -4, Si: -4, H: -1 };
const NONMETALS = new Set(['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Se', 'Br', 'I', 'As', 'Te', 'He', 'Ne', 'Ar', 'Kr', 'Xe']);
const ALKALI = new Set(['Li', 'Na', 'K', 'Rb', 'Cs']);
const ALKEARTH = new Set(['Be', 'Mg', 'Ca', 'Sr', 'Ba']);

// ---------- Text normalisation ----------
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
function normalize(s) {
  s = String(s).replace(/[−–—]/g, '-').replace(/[₀-₉]/g, c => SUB[c]);
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, m => '^' + [...m].map(c => SUP[c]).join(''));
  return s;
}

// ---------- Formula / species parsing ----------
function parseFormula(s) {
  let i = 0;
  function readNum() { let m = ''; while (i < s.length && /\d/.test(s[i])) m += s[i++]; return m ? parseInt(m, 10) : 1; }
  function group(depth) {
    const comp = {};
    while (i < s.length) {
      const c = s[i];
      if (c === '(' || c === '[') {
        i++;
        const inner = group(depth + 1);
        if (s[i] !== ')' && s[i] !== ']') throw new Error(`A parenthesis isn't closed in "${s}".`);
        i++;
        const n = readNum();
        for (const e in inner) comp[e] = (comp[e] || 0) + inner[e] * n;
      } else if (c === ')' || c === ']') {
        if (depth === 0) throw new Error(`Extra ")" in "${s}".`);
        break;
      } else if (/[A-Z]/.test(c)) {
        let sym = c; i++;
        if (i < s.length && /[a-z]/.test(s[i])) { sym += s[i]; i++; }
        if (!ELEMENT_SET.has(sym)) throw new Error(`"${sym}" in "${s}" is not an element symbol (check capital letters).`);
        const n = readNum();
        comp[sym] = (comp[sym] || 0) + n;
      } else if (/[a-z]/.test(c)) {
        throw new Error(`Element symbols start with a capital letter: check "${s}".`);
      } else if (/\d/.test(c)) {
        throw new Error(`A number in "${s}" isn't attached to an element.`);
      } else {
        throw new Error(`Unexpected character "${c}" in "${s}".`);
      }
    }
    return comp;
  }
  const comp = group(0);
  if (i < s.length) throw new Error(`Couldn't read "${s}".`);
  if (!Object.keys(comp).length) throw new Error('Empty formula.');
  return comp;
}

function compKey(comp, charge) {
  return Object.keys(comp).sort().map(e => e + comp[e]).join('') + '|' + charge;
}

const KEY_E = 'e', KEY_H2O = 'H2O1|0', KEY_HP = 'H1|1', KEY_OH = 'H1O1|-1';

function parseSpecies(raw) {
  let t = normalize(raw).trim().replace(/\s*\((aq|s|l|g)\)\s*$/i, '').trim();
  if (/^e\^?(-1|1-|-)$/.test(t)) return { text: 'e^-', electron: true, comp: {}, charge: -1, key: KEY_E };
  let formula = t, charge = 0, ambiguous = null;
  const k = t.lastIndexOf('^');
  if (k >= 0) {
    formula = t.slice(0, k);
    const c = t.slice(k + 1).replace(/\s/g, '');
    let num, sign, m;
    if ((m = c.match(/^(\d*)([+-])$/))) { num = m[1]; sign = m[2]; }
    else if ((m = c.match(/^([+-])(\d+)$/))) { sign = m[1]; num = m[2]; }
    else throw new Error(`The charge "^${c}" should look like ^2+ or ^3- (number, then sign).`);
    charge = (num ? parseInt(num, 10) : 1) * (sign === '-' ? -1 : 1);
    if (charge === 0) throw new Error('A charge of 0 is written by leaving the charge off.');
  } else {
    const m = t.match(/^(.*?)([+-])$/);
    if (m) {
      formula = m[1]; charge = m[2] === '-' ? -1 : 1;
      const d = formula.match(/^(.*[A-Za-z)\]])(\d+)$/);
      if (d) ambiguous = d[1] + '^' + d[2] + m[2];
    }
  }
  if (!formula.trim()) throw new Error(`"${raw}" has a charge but no formula.`);
  if (/\s/.test(formula.trim())) throw new Error(`"${formula.trim()}" has a space inside it. Put " + " between species.`);
  const comp = parseFormula(formula.trim());
  return { text: t, comp, charge, key: compKey(comp, charge), ambiguous };
}

// split one side of an equation into terms. A "+" separates species when it has a space before it,
// or when it is followed by a letter/digit (Cu+Ag^+). A "+" right after "^..." or followed by a space/end is a charge.
function splitTerms(side) {
  const terms = []; let cur = '';
  for (let i = 0; i < side.length; i++) {
    const ch = side[i];
    if (ch !== '+') { cur += ch; continue; }
    const prev = i > 0 ? side[i - 1] : ' ';
    const next = i + 1 < side.length ? side[i + 1] : '';
    const afterCaret = /\^\s*\d*$/.test(cur);
    let isCharge;
    if (/\s/.test(prev) || i === 0) isCharge = false;
    else if (afterCaret) isCharge = true;
    else if (next === '' || /\s/.test(next)) isCharge = true;
    else isCharge = false;
    if (isCharge) cur += ch; else { terms.push(cur); cur = ''; }
  }
  terms.push(cur);
  return terms.map(s => s.trim());
}

function parseEquation(str) {
  const s = normalize(str).trim();
  if (!s) throw new Error('Type an equation.');
  const parts = s.split(/\s*(?:<?-+>|→|⟶|⇒|=>|=)\s*/);
  if (parts.length !== 2) throw new Error(parts.length < 2 ? 'Use -> (or →) between the left and right sides.' : 'Use only one arrow.');
  const sides = parts.map((p, si) => {
    if (!p.trim()) throw new Error(si === 0 ? 'The left side is empty.' : 'The right side is empty.');
    const terms = splitTerms(p);
    const out = [];
    for (const term of terms) {
      if (!term) throw new Error('There is an extra "+" sign.');
      const m = term.match(/^(\d+)\s*(.+)$/);
      let coef = 1, body = term;
      if (m && !/^\d+$/.test(term)) { coef = parseInt(m[1], 10); body = m[2]; }
      if (/^\d*\/\d+/.test(term)) throw new Error('Use whole-number coefficients, not fractions.');
      if (coef === 0) throw new Error(`A coefficient of 0 isn't allowed ("${term}").`);
      const sp = parseSpecies(body);
      const prev = out.find(o => o.sp.key === sp.key);
      if (prev) prev.coef += coef; else out.push({ coef, sp });
    }
    return out;
  });
  return { left: sides[0], right: sides[1] };
}

// ---------- Inventory ----------
function inventory(eq) {
  const L = {}, R = {}; let cL = 0, cR = 0;
  for (const t of eq.left) { for (const e in t.sp.comp) L[e] = (L[e] || 0) + t.coef * t.sp.comp[e]; cL += t.coef * t.sp.charge; }
  for (const t of eq.right) { for (const e in t.sp.comp) R[e] = (R[e] || 0) + t.coef * t.sp.comp[e]; cR += t.coef * t.sp.charge; }
  const els = [...new Set([...Object.keys(L), ...Object.keys(R)])];
  // order: not O/H first (alphabetical, C first), then O, then H
  const ord = e => (e === 'O' ? 2 : e === 'H' ? 3 : e === 'C' ? 0 : 1);
  els.sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
  const rows = els.map(e => ({ el: e, L: L[e] || 0, R: R[e] || 0 }));
  return { rows, cL, cR, atomsOK: rows.every(r => r.L === r.R), chargeOK: cL === cR };
}

// ---------- Oxidation numbers ----------
function rankOf(el) {
  if (el === 'F') return 0; if (ALKALI.has(el)) return 1; if (ALKEARTH.has(el)) return 2;
  if (el === 'H') return 3; if (el === 'O') return 4; if (el === 'Cl') return 5; if (el === 'Br') return 6; if (el === 'I') return 7;
  return -1;
}
function assignON(comp, charge) {
  const els = Object.keys(comp);
  const on = {};
  if (els.length === 1) { on[els[0]] = Fr(charge, comp[els[0]]); return on; }
  const ranked = els.filter(e => rankOf(e) >= 0).sort((a, b) => rankOf(a) - rankOf(b));
  const others = els.filter(e => rankOf(e) < 0).sort((a, b) => enOf(b) - enOf(a));
  const hydride = els.every(e => e === 'H' || !NONMETALS.has(e));
  let solveEl;
  if (!others.length) solveEl = ranked.pop();
  for (const e of ranked) {
    let v;
    if (e === 'F') v = -1; else if (ALKALI.has(e)) v = 1; else if (ALKEARTH.has(e)) v = 2;
    else if (e === 'H') v = hydride ? -1 : 1; else if (e === 'O') v = -2; else v = -1;
    on[e] = Fr(v);
  }
  if (others.length) {
    while (others.length > 1) { const e = others.shift(); on[e] = Fr(ANION[e] ?? 0); }
    solveEl = others[0];
  }
  let sum = Fr(0);
  for (const e in on) sum = fadd(sum, Fr(on[e].n * comp[e], on[e].d));
  on[solveEl] = fdiv(fsub(Fr(charge), sum), Fr(comp[solveEl]));
  return on;
}
function parseONInput(s) {
  s = String(s).trim().replace(/[−–—]/g, '-').replace(/\s/g, '');
  if (!s) return null;
  let m = s.match(/^([+-]?)(\d+)\/(\d+)$/);
  if (m) { const v = Fr(parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1), parseInt(m[3], 10)); return v.d ? v : undefined; }
  m = s.match(/^([+-]?)(\d+(?:\.\d+)?|\.\d+)$/);
  if (m) return { approx: parseFloat(m[2]) * (m[1] === '-' ? -1 : 1) };
  m = s.match(/^(\d+)([+-])$/); // "2+" style
  if (m) return Fr(parseInt(m[1], 10) * (m[2] === '-' ? -1 : 1));
  return undefined; // unreadable
}
function onMatches(input, frac) {
  if (!input) return false;
  if (input.approx !== undefined) return Math.abs(input.approx - frac.n / frac.d) < 0.011;
  return feq(input, frac);
}

// ---------- Half-reaction split ----------
function keyEls(sp) {
  const k = Object.keys(sp.comp).filter(e => e !== 'H' && e !== 'O');
  if (k.length) return k;
  return sp.comp.O ? ['O'] : ['H'];
}

function analyzeSkeleton(skeletonStr) {
  const eq = parseEquation(skeletonStr);
  const R = eq.left.map(t => t.sp), P = eq.right.map(t => t.sp);
  if (R.some(s => s.electron) || P.some(s => s.electron)) throw new Error('A skeleton equation should not contain electrons.');
  const all = [...R, ...P];
  for (const s of all) s.on = assignON(s.comp, s.charge);
  const ox = { R: new Set(), P: new Set(), els: new Set() }, red = { R: new Set(), P: new Set(), els: new Set() };
  for (const r of R) for (const p of P) {
    const shared = keyEls(r).filter(e => keyEls(p).includes(e));
    for (const e of shared) {
      const a = r.on[e], b = p.on[e];
      const diff = a.n * b.d - b.n * a.d; // >0 means r higher than p
      if (diff < 0) { ox.R.add(r.key); ox.P.add(p.key); ox.els.add(e); }
      else if (diff > 0) { red.R.add(r.key); red.P.add(p.key); red.els.add(e); }
    }
  }
  if (!ox.R.size || !red.R.size) {
    if (!ox.R.size && !red.R.size) throw new Error('No element changes oxidation number, so this is not a redox reaction.');
    throw new Error(!ox.R.size ? 'Nothing is oxidized in this equation. Check the formulas.' : 'Nothing is reduced in this equation. Check the formulas.');
  }
  // attach species that didn't link (e.g. NH3 released from Ag(NH3)2+)
  for (const [list, side] of [[R, 'R'], [P, 'P']]) for (const s of list) {
    if (ox[side].has(s.key) || red[side].has(s.key)) continue;
    const els = Object.keys(s.comp).filter(e => e !== 'H' && e !== 'O');
    const shares = key => { const o = all.find(x => x.key === key); return o && els.some(e => o.comp[e]); };
    const inOx = [...ox.R, ...ox.P].some(shares), inRed = [...red.R, ...red.P].some(shares);
    if (inOx && !inRed) ox[side].add(s.key);
    else if (inRed && !inOx) red[side].add(s.key);
    else throw new Error(`Can't tell which half-reaction ${s.text} belongs to.`);
  }
  const byKey = {}; for (const s of all) byKey[s.key] = s;
  const mk = h => ({ R: [...h.R].map(k => byKey[k]), P: [...h.P].map(k => byKey[k]), els: [...h.els] });
  const prob = {
    skeleton: skeletonStr, eq, R, P, byKey,
    ox: mk(ox), red: mk(red),
  };
  prob.oxidizedEls = prob.ox.els; prob.reducedEls = prob.red.els;
  prob.reducingAgents = prob.ox.R.map(s => s.key);
  prob.oxidizingAgents = prob.red.R.map(s => s.key);
  return prob;
}

// ---------- Linear algebra (nullspace over rationals) ----------
function nullspace(A, ncols) {
  const M = A.map(r => r.map(v => Fr(v)));
  const rows = M.length; let lead = 0; const pivCols = [];
  for (let r = 0; r < rows && lead < ncols; r++) {
    let i = r;
    while (lead < ncols) {
      i = r; while (i < rows && M[i][lead].n === 0) i++;
      if (i < rows) break;
      lead++;
    }
    if (lead >= ncols) break;
    [M[i], M[r]] = [M[r], M[i]];
    const lv = M[r][lead];
    M[r] = M[r].map(v => fdiv(v, lv));
    for (let j = 0; j < rows; j++) if (j !== r && M[j][lead].n !== 0) {
      const f = M[j][lead];
      M[j] = M[j].map((v, c) => fsub(v, fmul(f, M[r][c])));
    }
    pivCols.push(lead); lead++;
  }
  const free = []; for (let c = 0; c < ncols; c++) if (!pivCols.includes(c)) free.push(c);
  return free.map(fc => {
    const v = Array(ncols).fill(null).map(() => Fr(0)); v[fc] = Fr(1);
    pivCols.forEach((pc, r) => { v[pc] = fsub(Fr(0), M[r][fc]); });
    return v;
  });
}
function toIntegers(v) {
  let L = 1; for (const x of v) L = lcm(L, x.d);
  let ints = v.map(x => x.n * (L / x.d));
  let g = 0; for (const x of ints) g = gcd(g, x);
  return ints.map(x => x / (g || 1));
}

const SPECIAL = {
  [KEY_H2O]: { text: 'H2O', comp: { H: 2, O: 1 }, charge: 0, key: KEY_H2O },
  [KEY_HP]: { text: 'H^+', comp: { H: 1 }, charge: 1, key: KEY_HP },
  [KEY_OH]: { text: 'OH^-', comp: { O: 1, H: 1 }, charge: -1, key: KEY_OH },
  [KEY_E]: { text: 'e^-', electron: true, comp: {}, charge: -1, key: KEY_E },
};

// Solve one half reaction in acid. Returns {vec:{key:signedInt}, sp:{key:species}, order:[keys], electrons, type}
function solveHalf(half, type) {
  const cols = [];
  for (const s of half.R) cols.push({ sp: s, side: 1, skel: true });
  for (const s of half.P) if (!cols.find(c => c.sp.key === s.key)) cols.push({ sp: s, side: -1, skel: true });
  for (const k of [KEY_H2O, KEY_HP, KEY_E]) if (!cols.find(c => c.sp.key === k)) cols.push({ sp: SPECIAL[k], side: 0, skel: false });
  const solve = cs => {
    const els = [...new Set(cs.flatMap(c => Object.keys(c.sp.comp)))];
    const A = els.map(e => cs.map(c => c.sp.comp[e] || 0));
    A.push(cs.map(c => c.sp.charge));
    return nullspace(A, cs.length);
  };
  let ns = solve(cols);
  // e.g. H2O2 -> O2: water would make the answer ambiguous, so try without the added H2O
  if (ns.length > 1) {
    const i = cols.findIndex(c => !c.skel && c.sp.key === KEY_H2O);
    if (i >= 0) { const trial = cols.filter((_, j) => j !== i); const t = solve(trial); if (t.length === 1) { cols.splice(i, 1); ns = t; } }
  }
  if (ns.length !== 1) throw new Error(`The ${type === 'ox' ? 'oxidation' : 'reduction'} half-reaction can't be balanced uniquely (check the formulas).`);
  let v = toIntegers(ns[0]);
  const first = cols.findIndex(c => c.side !== 0);
  if (v[first] * cols[first].side < 0) v = v.map(x => -x);
  cols.forEach((c, i) => {
    if (c.side !== 0 && (v[i] === 0 || Math.sign(v[i]) !== c.side))
      throw new Error(`The ${type === 'ox' ? 'oxidation' : 'reduction'} half-reaction doesn't balance with ${c.sp.text} on that side. Check the formulas.`);
  });
  const vec = {}, sp = {};
  cols.forEach((c, i) => { if (v[i] !== 0) { vec[c.sp.key] = v[i]; sp[c.sp.key] = c.sp; } });
  const e = vec[KEY_E] || 0;
  if (type === 'ox' && !(e < 0)) throw new Error('The oxidation half-reaction should lose electrons. Check the formulas.');
  if (type === 'red' && !(e > 0)) throw new Error('The reduction half-reaction should gain electrons. Check the formulas.');
  const skelKeys = new Set(cols.filter(c => c.skel).map(c => c.sp.key));
  return { vec, sp, electrons: Math.abs(e), type, skelKeys, order: cols.map(c => c.sp.key).filter(k => vec[k]) };
}

function reduceVec(vec) {
  let g = 0; for (const k in vec) g = gcd(g, vec[k]);
  const out = {}; for (const k in vec) if (vec[k]) out[k] = vec[k] / (g || 1);
  return out;
}

function combineHalves(oxH, redH) {
  const L = lcm(oxH.electrons, redH.electrons);
  const mo = L / oxH.electrons, mr = L / redH.electrons;
  const vec = {}, sp = {}, order = [];
  const add = (h, m) => { for (const k of h.order) { vec[k] = (vec[k] || 0) + h.vec[k] * m; sp[k] = h.sp[k]; if (!order.includes(k)) order.push(k); } };
  add(oxH, mo); add(redH, mr);
  delete vec[KEY_E];
  for (const k in vec) if (!vec[k]) delete vec[k];
  let g = 0; for (const k in vec) g = gcd(g, vec[k]);
  return { vec: reduceVec(vec), sp, order: order.filter(k => vec[k]), mo, mr, eTransferred: L / (g || 1) };
}

function toBasic(acid) {
  const vec = { ...acid.vec }, sp = { ...acid.sp, [KEY_OH]: SPECIAL[KEY_OH], [KEY_H2O]: SPECIAL[KEY_H2O] };
  const h = vec[KEY_HP] || 0;
  if (!h) return { vec, sp, order: acid.order.slice(), ohAdded: 0 };
  delete vec[KEY_HP];
  vec[KEY_H2O] = (vec[KEY_H2O] || 0) + h;
  vec[KEY_OH] = (vec[KEY_OH] || 0) - h;
  for (const k in vec) if (!vec[k]) delete vec[k];
  const order = acid.order.filter(k => k !== KEY_HP && vec[k]);
  if (vec[KEY_OH] && !order.includes(KEY_OH)) order.push(KEY_OH);
  if (vec[KEY_H2O] && !order.includes(KEY_H2O)) order.push(KEY_H2O);
  return { vec: reduceVec(vec), sp, order, ohAdded: Math.abs(h) };
}

// "Acid then add OH-" intermediate: both sides get h OH-, before combining into water
function basicIntermediate(acid) {
  const h = acid.vec[KEY_HP] || 0;
  return { h: Math.abs(h), hSide: h > 0 ? 'left' : 'right' };
}

// ---------- Formatting ----------
function vecToString(vec, sp, order, opts = {}) {
  const keys = order.filter(k => vec[k]);
  const fmt = k => { const c = Math.abs(vec[k]); return (c === 1 ? '' : c) + sp[k].text; };
  const left = keys.filter(k => vec[k] > 0).map(fmt), right = keys.filter(k => vec[k] < 0).map(fmt);
  return left.join(' + ') + ' -> ' + right.join(' + ');
}
// a half at a given stage (3: skeleton atoms, 4: +H2O, 5: +H+, 6: +e-)
function halfStage(h, stage) {
  const keep = k => h.skelKeys.has(k) || (stage >= 4 && k === KEY_H2O) || (stage >= 5 && k === KEY_HP) || (stage >= 6 && k === KEY_E);
  const vec = {}; for (const k in h.vec) if (keep(k)) vec[k] = h.vec[k];
  return vecToString(vec, h.sp, h.order);
}

// ---------- Full solution ----------
function solveProblem(skeletonStr, medium) {
  const prob = analyzeSkeleton(skeletonStr);
  prob.medium = medium === 'basic' ? 'basic' : 'acidic';
  prob.oxHalf = solveHalf(prob.ox, 'ox');
  prob.redHalf = solveHalf(prob.red, 'red');
  prob.acid = combineHalves(prob.oxHalf, prob.redHalf);
  prob.basic = toBasic(prob.acid);
  // list species in skeleton order, then H+/OH-/H2O
  const skelOrder = [...prob.R, ...prob.P].map(x => x.key);
  const rank = k => { const i = skelOrder.indexOf(k); return i >= 0 ? i : 100 + [KEY_HP, KEY_OH, KEY_H2O].indexOf(k); };
  for (const f of [prob.acid, prob.basic]) f.order = Object.keys(f.vec).sort((a, b) => rank(a) - rank(b));
  prob.final = prob.medium === 'basic' ? prob.basic : prob.acid;
  prob.answerText = vecToString(prob.final.vec, prob.final.sp, prob.final.order);
  prob.acidText = vecToString(prob.acid.vec, prob.acid.sp, prob.acid.order);
  prob.needsWaterOrH = !!(prob.acid.vec[KEY_H2O] || prob.acid.vec[KEY_HP]);
  // halves with no O or H at all skip the H2O / H+ steps
  const hasOH = h => [...h.R, ...h.P].some(x => x.comp.O || x.comp.H);
  prob.oxHalf.noOH = !hasOH(prob.ox); prob.redHalf.noOH = !hasOH(prob.red);
  // no O in a half -> no H2O needed (step 4 skipped); no O and no H -> no H+ either (step 5 skipped)
  const hasO = h => [...h.R, ...h.P].some(x => x.comp.O);
  prob.oxHalf.noO = !hasO(prob.ox); prob.redHalf.noO = !hasO(prob.red);
  prob.noOH = prob.oxHalf.noOH && prob.redHalf.noOH;
  return prob;
}

// ---------- Checking student work ----------
function eqVec(eq) {
  const vec = {}, sp = {};
  for (const t of eq.left) { vec[t.sp.key] = (vec[t.sp.key] || 0) + t.coef; sp[t.sp.key] = t.sp; }
  for (const t of eq.right) { vec[t.sp.key] = (vec[t.sp.key] || 0) - t.coef; sp[t.sp.key] = t.sp; }
  return { vec, sp };
}
function bothSides(eq) {
  const l = new Set(eq.left.map(t => t.sp.key));
  return eq.right.filter(t => l.has(t.sp.key)).map(t => t.sp);
}
function balanceMsgs(inv, which) {
  const msgs = [];
  for (const r of inv.rows) {
    if (r.L === r.R) continue;
    if (which === 'nonOH' && (r.el === 'O' || r.el === 'H')) continue;
    if (which === 'O' && r.el === 'H') continue;
    msgs.push({ kind: r.el === 'O' ? 'O' : r.el === 'H' ? 'H' : 'atoms', text: `${r.el}: ${r.L} on the left, ${r.R} on the right.` });
  }
  return msgs;
}
function suggest(sp) { return sp.ambiguous ? ` Did you mean ${sp.ambiguous}? Charges go after ^.` : ''; }
const NICE = { [KEY_H2O]: 'H₂O', [KEY_HP]: 'H⁺', [KEY_OH]: 'OH⁻', [KEY_E]: 'electrons' };

function checkHalf(input, h, stage) {
  let eq;
  try { eq = parseEquation(input); } catch (e) { return { ok: false, msgs: [{ kind: 'parse', text: e.message }] }; }
  const msgs = [];
  const sideOf = k => (h.vec[k] > 0 ? 'left' : 'right');
  const allowed = new Set([...h.skelKeys]);
  if (stage >= 4 && !h.noO) allowed.add(KEY_H2O);
  if (stage >= 5 && !h.noOH) allowed.add(KEY_HP);
  if (stage >= 6) allowed.add(KEY_E);
  const present = new Map();
  for (const [side, terms] of [['left', eq.left], ['right', eq.right]]) for (const t of terms) {
    const k = t.sp.key;
    if (!allowed.has(k)) {
      if (h.noO && !h.noOH && k === KEY_H2O) msgs.push({ kind: 'noO', text: 'Leave out H₂O: this half-reaction has no O, so no water is needed. Balance H with H⁺ only.' });
      else if (h.noOH && [KEY_H2O, KEY_HP, KEY_OH].includes(k)) msgs.push({ kind: 'noOH', text: `Leave out ${NICE[k]}: this half-reaction has no O or H, so it needs only electrons.` });
      else if (k === KEY_OH) msgs.push({ kind: 'species', text: 'Balance each half as if in acid, with H₂O and H⁺. OH⁻ is added only at the end, for basic solutions.' });
      else if (k === KEY_H2O) msgs.push({ kind: 'species', text: 'Not yet: this step balances only the atoms other than O and H. H₂O comes in the next step.' });
      else if (k === KEY_HP) msgs.push({ kind: 'species', text: `Not yet: ${stage === 3 ? 'H⁺ comes two steps later.' : 'balance O with H₂O only in this step. H⁺ comes next.'}` });
      else if (k === KEY_E) msgs.push({ kind: 'species', text: 'Not yet: electrons are added in the last step of the half-reaction, to balance charge.' });
      else msgs.push({ kind: 'species', text: `${t.sp.text} isn't part of this half-reaction.${suggest(t.sp)}` });
      continue;
    }
    if (present.has(k) && present.get(k) !== side) continue; // reported below
    present.set(k, side);
  }
  for (const s of bothSides(eq)) if (!(h.noOH && [KEY_H2O, KEY_HP, KEY_OH].includes(s.key)) && !(h.noO && s.key === KEY_H2O)) msgs.push({ kind: 'cancel', text: `${s.electron ? 'Electrons appear' : s.text + ' appears'} on both sides. Cancel so it appears on one side only.` });
  const hadSpecies = msgs.some(m => m.kind === 'species');
  for (const k of (hadSpecies ? [] : h.skelKeys)) {
    const s = h.sp[k];
    if (!present.has(k)) msgs.push({ kind: 'missing', text: `${s.text} is missing. Every species in the half-reaction stays in.` });
    else if (present.get(k) !== sideOf(k) && !(eq.left.some(t => t.sp.key === k) && eq.right.some(t => t.sp.key === k)))
      msgs.push({ kind: 'side', text: `${s.text} belongs on the ${sideOf(k)} side.` });
  }
  if (stage >= 6 && present.has(KEY_E)) {
    const want = h.type === 'ox' ? 'right' : 'left';
    if (present.get(KEY_E) !== want) msgs.push({ kind: 'eside', text: h.type === 'ox' ? 'Oxidation is loss of electrons, so electrons go on the product (right) side.' : 'Reduction is gain of electrons, so electrons go on the reactant (left) side.' });
  }
  if (msgs.length) return { ok: false, msgs, eq };
  const inv = inventory(eq);
  const which = stage === 3 ? 'nonOH' : stage === 4 ? 'O' : 'all';
  const bm = balanceMsgs(inv, which);
  msgs.push(...bm);
  if (stage >= 6 && !inv.chargeOK) msgs.push({ kind: 'charge', text: `Charge: ${fmtCharge(inv.cL)} on the left, ${fmtCharge(inv.cR)} on the right.` });
  if (stage === 6 && !present.has(KEY_E) && !msgs.length) msgs.push({ kind: 'charge', text: 'Add electrons to balance charge.' });
  if (msgs.length) return { ok: false, msgs, eq, inv };
  // ok; work out electrons and lowest-terms note
  const ev = eqVec(eq);
  if (stage === 6) {
    let ratio = null, prop = true;
    for (const k of new Set([...Object.keys(ev.vec), ...Object.keys(h.vec)])) {
      const a = h.vec[k] || 0, b = ev.vec[k] || 0;
      if (!a || !b) { prop = false; break; }
      if (ratio === null) ratio = b / a; else if (Math.abs(b / a - ratio) > 1e-9) { prop = false; break; }
    }
    if (!prop) return { ok: false, msgs: [{ kind: 'extraWater', text: 'This balances, but it uses more H₂O and H⁺ than needed. Start again from the skeleton species and add only the H₂O needed to balance O.' }], eq, inv };
  }
  let g = 0; for (const k in ev.vec) g = gcd(g, ev.vec[k]);
  const note = g > 1 ? `Correct. You could divide every coefficient by ${g}, but it isn't required.` : '';
  const eCount = Math.abs(ev.vec[KEY_E] || 0);
  return { ok: true, msgs: [], eq, inv, note, electrons: eCount, vec: ev.vec, sp: ev.sp };
}
function fmtCharge(c) { return c === 0 ? '0' : (c > 0 ? '+' : '−') + Math.abs(c); }

// overall equation check. form: 'acidic' | 'basic'
function checkOverall(input, prob, form) {
  let eq;
  try { eq = parseEquation(input); } catch (e) { return { ok: false, msgs: [{ kind: 'parse', text: e.message }] }; }
  const ans = form === 'basic' ? prob.basic : prob.acid;
  const msgs = [];
  const allowed = new Set([...prob.R, ...prob.P].map(s => s.key));
  if (!prob.noOH) { allowed.add(KEY_H2O); allowed.add(form === 'basic' ? KEY_OH : KEY_HP); }
  for (const t of [...eq.left, ...eq.right]) {
    const k = t.sp.key;
    if (allowed.has(k)) continue;
    if (prob.noOH && [KEY_H2O, KEY_HP, KEY_OH].includes(k)) { msgs.push({ kind: 'noOH', text: `Leave out ${NICE[k]}: nothing in this reaction contains O or H, so no H₂O, H⁺ or OH⁻ is needed.` }); continue; }
    if (k === KEY_E) msgs.push({ kind: 'electrons', text: 'Electrons should not appear in the overall equation. Multiply the half-reactions so the electrons cancel.' });
    else if (k === KEY_HP) msgs.push({ kind: 'basic', text: 'In basic solution the final equation has no H⁺. Add as many OH⁻ to both sides as there are H⁺, combine H⁺ + OH⁻ into H₂O, and cancel water.' });
    else if (k === KEY_OH) msgs.push({ kind: 'acidspecies', text: 'This reaction is in acidic solution, so use H⁺ and H₂O, not OH⁻.' });
    else msgs.push({ kind: 'species', text: `${t.sp.text} isn't in this reaction.${suggest(t.sp)}` });
  }
  for (const s of bothSides(eq)) if (!(prob.noOH && [KEY_H2O, KEY_HP, KEY_OH].includes(s.key))) msgs.push({ kind: 'cancel', text: `${s.text} appears on both sides. Cancel so it appears on one side only.` });
  const ev = eqVec(eq);
  const hadSpecies = msgs.some(m => m.kind === 'species');
  for (const s of (hadSpecies ? [] : [...prob.R, ...prob.P])) {
    const want = ans.vec[s.key];
    if (!want) continue;
    if (!ev.vec[s.key]) msgs.push({ kind: 'missing', text: `${s.text} is missing.` });
    else if (Math.sign(ev.vec[s.key]) !== Math.sign(want)) msgs.push({ kind: 'side', text: `${s.text} belongs on the ${want > 0 ? 'left' : 'right'} side.` });
  }
  if (msgs.length) return { ok: false, msgs, eq };
  const inv = inventory(eq);
  msgs.push(...balanceMsgs(inv, 'all'));
  if (!inv.chargeOK) msgs.push({ kind: 'charge', text: `Charge: ${fmtCharge(inv.cL)} on the left, ${fmtCharge(inv.cR)} on the right.` });
  if (msgs.length) return { ok: false, msgs, eq, inv };
  // balanced. proportional to answer?
  const keys = new Set([...Object.keys(ev.vec), ...Object.keys(ans.vec)]);
  let ratio = null, prop = true;
  for (const k of keys) {
    const a = ans.vec[k] || 0, b = ev.vec[k] || 0;
    if (!a || !b) { prop = false; break; }
    const r = b / a;
    if (ratio === null) ratio = r; else if (Math.abs(r - ratio) > 1e-9) { prop = false; break; }
  }
  if (!prop || ratio <= 0) return { ok: false, msgs: [{ kind: 'electrons', text: 'Atoms and charge balance, but electrons lost don\'t equal electrons gained, so this isn\'t the right ratio. Check the multipliers on your half-reactions.' }], eq, inv };
  const note = ratio > 1 + 1e-9 ? `Correct, but not in lowest terms: you can divide every coefficient by ${Math.round(ratio)}.` : '';
  return { ok: true, msgs: [], eq, inv, note };
}

const RULES = {
  parse: 'Write species like MnO4^- or Fe^3+ (charge after ^), with " + " between species and -> between the sides.',
  species: 'Use only the species in the skeleton equation, plus H₂O and H⁺ (acidic) or H₂O and OH⁻ (basic).',
  missing: 'Every species in the skeleton equation must appear in the balanced equation.',
  side: 'Reactants stay on the left and products on the right. Only H₂O, H⁺, OH⁻ and electrons can be added to either side.',
  cancel: 'After adding the half-reactions, cancel anything that appears on both sides (H₂O, H⁺, OH⁻, electrons).',
  atoms: 'Balance the atoms other than O and H first, by changing coefficients of the skeleton species.',
  O: 'Balance O by adding H₂O to the side that needs oxygen.',
  H: 'Balance H by adding H⁺ to the side that needs hydrogen.',
  charge: 'Balance charge in each half-reaction with electrons. Then multiply the halves so electrons lost = electrons gained before adding them.',
  electrons: 'Multiply each half-reaction so the electrons lost in oxidation equal the electrons gained in reduction, then add and cancel.',
  basic: 'For basic solution: finish in acid, add one OH⁻ to both sides for every H⁺, combine H⁺ + OH⁻ → H₂O, then cancel water.',
  acidspecies: 'In acidic solution, use H⁺ and H₂O to balance O and H.',
  noO: 'Add H₂O only to balance O. A half-reaction with no O needs no water.',
  noOH: 'Add H₂O and H⁺ only when the species contain O or H. Here, balance the atoms, then the charge with electrons.',
  extraWater: 'Use the fewest H₂O and H⁺ that balance the half-reaction. The O atoms come from the skeleton species first.',
  eside: 'Oxidation is loss of electrons (electrons are products). Reduction is gain of electrons (electrons are reactants).',
};

if (typeof module !== 'undefined') module.exports = {
  Fr, fstr, feq, parseSpecies, parseEquation, parseFormula, splitTerms, inventory, assignON, parseONInput, onMatches,
  analyzeSkeleton, solveHalf, combineHalves, toBasic, solveProblem, halfStage, vecToString, checkHalf, checkOverall,
  basicIntermediate, KEY_E, KEY_H2O, KEY_HP, KEY_OH, RULES, normalize,
};
