/* ===================== User interface ===================== */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LEVELS = { 1: 'Metals & ions', 2: 'Acidic', 3: 'Basic', 4: 'Disproportionation & more', 5: 'Organic' };
const LS_KEY = 'redoxLab.uploadedProblems';

// ---------- Rendering chemistry ----------
function spHTML(t) {
  t = normalize(t).trim();
  if (/^e\^?(-1|1-|-)$/.test(t)) return 'e<sup>−</sup>';
  let state = '';
  const sm = t.match(/\s*(\((aq|s|l|g)\))\s*$/i);
  if (sm) { state = sm[1]; t = t.slice(0, sm.index); }
  let f = t, ch = '';
  const k = t.lastIndexOf('^');
  if (k >= 0) { f = t.slice(0, k); ch = t.slice(k + 1).trim(); }
  else { const m = t.match(/^(.*?)([+-])$/); if (m) { f = m[1]; ch = m[2]; } }
  ch = ch.replace(/^([+-])(\d+)$/, '$2$1').replace('-', '−');
  const body = esc(f).replace(/([A-Za-z)\]])(\d+)/g, '$1<sub>$2</sub>');
  return body + (ch ? '<sup>' + ch + '</sup>' : '') + (state ? '<span class="state">' + state + '</span>' : '');
}
function eqHTML(str) {
  try {
    const s = normalize(str).trim();
    const parts = s.split(/\s*(?:<?-+>|→|⟶|⇒|=>|=)\s*/);
    const side = p => splitTerms(p).filter(x => x).map(term => {
      const m = term.match(/^(\d+)\s*(.+)$/);
      return m ? `<span class="coef">${m[1]}</span>${spHTML(m[2])}` : spHTML(term);
    }).join('<span class="plus">+</span>');
    if (parts.length === 1) return side(parts[0]);
    return side(parts[0]) + '<span class="arrow">→</span>' + side(parts.slice(1).join(' '));
  } catch (e) { return esc(str); }
}
const eqSpan = (str, cls = 'eq') => `<span class="${cls}">${eqHTML(str)}</span>`;
const onFmt = f => fstr(f);
const medBadge = p => p.noOH ? '<span class="badge lvl">aqueous solution · no H₂O or H⁺ needed</span>' : `<span class="badge ${p.medium}">${p.medium} solution</span>`;

// focus: 3 = only atoms other than O/H matter, 4 = +O, 5 = all atoms, 6 = atoms + charge
function invHTML(eq, focus = 6) {
  const inv = inventory(eq);
  let h = '<table class="inv"><tr><th></th><th>Left</th><th>Right</th><th></th></tr>';
  for (const r of inv.rows) {
    const later = (focus === 3 && (r.el === 'O' || r.el === 'H')) || (focus === 4 && r.el === 'H');
    const ok = r.L === r.R;
    h += `<tr class="${later ? 'later' : ''}"><td>${r.el}</td><td>${r.L}</td><td>${r.R}</td><td class="${later ? '' : ok ? 'good' : 'badc'}">${later ? 'later' : ok ? '✓' : '✗'}</td></tr>`;
  }
  const cl = focus < 6;
  const cs = c => (c > 0 ? '+' + c : c < 0 ? '−' + Math.abs(c) : '0');
  h += `<tr class="${cl ? 'later' : ''}"><td>charge</td><td>${cs(inv.cL)}</td><td>${cs(inv.cR)}</td><td class="${cl ? '' : inv.chargeOK ? 'good' : 'badc'}">${cl ? 'later' : inv.chargeOK ? '✓' : '✗'}</td></tr>`;
  return h + '</table>';
}

// equation input with live preview + inventory
function eqBox(id, value, opts = {}) {
  const dis = opts.disabled ? 'disabled' : '';
  return `<input type="text" class="eqin" id="${id}" data-focus="${opts.focus || 6}" data-inv="${opts.inv === false ? 0 : 1}" value="${esc(value || '')}" ${dis} spellcheck="false" autocomplete="off" placeholder="${esc(opts.placeholder || 'e.g. MnO4^- + 8H^+ + 5e^- -> Mn^2+ + 4H2O')}">
    <div class="preview" id="${id}-pv"></div><div id="${id}-iv"></div>`;
}
function updateEqBox(inp) {
  const pv = $(inp.id + '-pv'), iv = $(inp.id + '-iv');
  const v = inp.value;
  if (!v.trim()) { pv.innerHTML = ''; iv.innerHTML = ''; return; }
  let eq = null, err = '';
  try { eq = parseEquation(v); } catch (e) { err = e.message; }
  pv.innerHTML = `<span class="lbl">Reads as:</span><span class="eq">${eqHTML(v)}</span>` + (err && /->|→|=/.test(v) ? ` <span class="small" style="color:var(--bad)">${esc(err)}</span>` : '');
  if (inp.dataset.inv === '1' && eq && showInventory) iv.innerHTML = invHTML(eq, +inp.dataset.focus);
  else iv.innerHTML = '';
}
let showInventory = true;
function bindEqBoxes(root, store) {
  root.querySelectorAll('input.eqin').forEach(inp => {
    updateEqBox(inp);
    inp.addEventListener('input', () => { if (store) store[inp.id] = inp.value; updateEqBox(inp); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $(inp.id + '-check'); if (b && !b.disabled) b.click(); } });
  });
}

function fbHTML(kind, msgs, rule, extra = '') {
  if (!msgs || !msgs.length) return '';
  msgs = [...new Set(msgs)];
  const list = msgs.length === 1 ? esc(msgs[0]) : '<ul>' + msgs.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>';
  return `<div class="fb ${kind}">${list}${rule ? `<div class="rule"><b>Rule:</b> ${esc(rule)}</div>` : ''}${extra}</div>`;
}
// Feedback ladder: try 1 -> what's wrong; try 2 -> + rule; try 3+ -> + "show me"
function ladderFB(res, tries, showId) {
  const msgs = res.msgs.map(m => m.text);
  const rule = tries >= 2 ? RULES[res.msgs[0].kind] || '' : '';
  const extra = tries >= 3 && showId ? `<div class="row"><button class="btn secondary small" id="${showId}">Show me</button></div>` : '';
  return fbHTML('bad', msgs, rule, extra);
}

// ---------- Problem bank ----------
let PROBLEMS = BUILTIN_PROBLEMS.slice();
let bankSource = 'built-in';
function uploadedProblems() { try { const j = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } }
function rebuildBank(base) {
  const map = new Map(base.map(p => [p.id, p]));
  for (const p of uploadedProblems()) map.set(p.id, p);
  PROBLEMS = [...map.values()].sort((a, b) => a.level - b.level || String(a.id).localeCompare(String(b.id)));
}
async function loadBank() {
  let base = BUILTIN_PROBLEMS;
  try {
    const r = await fetch('problems.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) { base = j; bankSource = 'problems.json'; } }
  } catch (e) { /* stay with built-in */ }
  rebuildBank(base);
}
const levelCount = lv => PROBLEMS.filter(p => lv === 'all' || p.level == lv).length;
function levelChips(cur, attr) {
  return `<div class="chips">` + ['all', 1, 2, 3, 4, 5].map(lv =>
    `<button ${attr}="${lv}" class="${String(cur) === String(lv) ? 'active' : ''}">${lv === 'all' ? 'All' : 'Level ' + lv + ': ' + LEVELS[lv]}<span class="count">${levelCount(lv)}</span></button>`).join('') + '</div>';
}

// ======================================================
//                      COACHING
// ======================================================
const C = { level: 'all', pid: null, prob: null, vals: {}, err: '' };

function resetCoach(prob) {
  Object.assign(C, {
    prob, vals: {}, err: '',
    on: { tries: 0, done: false, marks: {} }, id: { tries: 0, done: false },
    split: { tries: 0, done: false, fb: {} },
    half: { ox: { stage: 3, acc: {}, tries: {}, fb: '' }, red: { stage: 3, acc: {}, tries: {}, fb: '' } },
    mult: { tries: 0, done: false }, sum: { tries: 0, done: false }, basic: { tries: 0, done: false },
  });
}

function renderCoachPick() {
  const list = PROBLEMS.filter(p => C.level === 'all' || p.level == C.level);
  $('coach-pick').innerHTML = `
    <h2>Choose a reaction</h2>
    ${levelChips(C.level, 'data-clevel')}
    <div class="row">
      <select id="c-select" style="min-width:420px">
        <option value="">— pick a problem (${list.length}) —</option>
        ${list.map(p => `<option value="${esc(p.id)}" ${p.id === C.pid ? 'selected' : ''}>${esc(p.id)} · ${esc(p.eq.replace(/->/, '→'))} (${p.medium})</option>`).join('')}
      </select>
      <button class="btn secondary" id="c-random">Pick one for me</button>
    </div>
    <details style="margin-top:10px" ${C.pid === 'custom' ? 'open' : ''}><summary>…or type your own skeleton equation</summary>
      <div class="row"><div style="flex:1;min-width:380px">${eqBox('c-custom', C.customText || '', { inv: false, placeholder: 'e.g. Cr2O7^2- + Fe^2+ -> Cr^3+ + Fe^3+' })}</div></div>
      <div class="row"><label>Solution: <select id="c-custom-med"><option value="acidic">acidic</option><option value="basic" ${C.customMed === 'basic' ? 'selected' : ''}>basic</option></select></label>
      <button class="btn" id="c-custom-go">Coach me on this one</button></div>
      <div id="c-custom-fb"></div>
    </details>
    <div class="small muted" style="margin-top:8px">Typing tips: put charges after <code>^</code> (<code>Fe^3+</code>, <code>MnO4^-</code>, <code>Cr2O7^2-</code>), electrons as <code>e^-</code>,
      and " + " between species. Use <code>-&gt;</code> for the arrow. The line under each box shows how your typing was read.</div>`;
  const root = $('coach-pick');
  root.querySelectorAll('[data-clevel]').forEach(b => b.onclick = () => { C.level = b.dataset.clevel; renderCoachPick(); });
  $('c-select').onchange = e => { if (e.target.value) startCoach(PROBLEMS.find(p => p.id === e.target.value)); };
  $('c-random').onclick = () => {
    const pool = list.filter(p => p.id !== C.pid);
    if (pool.length) startCoach(pool[Math.floor(Math.random() * pool.length)]);
  };
  bindEqBoxes(root);
  $('c-custom').addEventListener('input', e => { C.customText = e.target.value; });
  $('c-custom-go').onclick = () => {
    const txt = $('c-custom').value, med = $('c-custom-med').value;
    C.customText = txt; C.customMed = med;
    try { solveProblem(txt, med); } catch (e) { $('c-custom-fb').innerHTML = fbHTML('bad', [e.message]); return; }
    startCoach({ id: 'custom', level: 0, medium: med, eq: txt });
  };
}

function startCoach(p) {
  let prob;
  try { prob = solveProblem(p.eq, p.medium); } catch (e) { $('coach-steps').innerHTML = fbHTML('bad', ['This problem could not be set up: ' + e.message]); return; }
  prob.meta = p;
  C.pid = p.id;
  resetCoach(prob);
  renderCoachPick();
  renderCoach();
  $('coach-steps').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function stepCard(n, title, state, body) {
  return `<div class="card step ${state}" id="step-${n}"><h2><span class="num">${state === 'done' ? '✓' : n}</span>${title}</h2><div class="body">${body}</div></div>`;
}

function uniqueSpecies(prob) {
  const seen = new Set(), out = [];
  for (const s of [...prob.R, ...prob.P]) if (!seen.has(s.key)) { seen.add(s.key); out.push(s); }
  return out;
}

function renderCoach() {
  const p = C.prob;
  if (!p) { $('coach-steps').innerHTML = ''; return; }
  const basic = p.medium === 'basic';
  let h = `<div class="card"><div class="problem"><span class="eq">${eqHTML(p.skeleton)}</span>
      ${medBadge(p)}${p.meta.level ? `<span class="badge lvl">Level ${p.meta.level}</span>` : ''}</div>
      <div class="small muted">Work through the steps in order. Each step unlocks when the one before it is right.</div></div>`;

  // ---- Step 1: oxidation numbers + identification
  const s1done = C.on.done && C.id.done;
  {
    const sps = uniqueSpecies(p);
    let rows = sps.map((s, i) => `<tr><td class="sp">${spHTML(s.text)}</td><td>${Object.keys(s.comp).map(el => {
      const id = `on-${i}-${el}`; const mark = C.on.marks[id] || '';
      return `<span class="oncell"><b>${el}</b><input type="text" id="${id}" class="${mark}" value="${esc(C.vals[id] || '')}" ${C.on.done ? 'disabled' : ''} autocomplete="off"></span>`;
    }).join('')}</td></tr>`).join('');
    let body = `<div class="instr">Enter the oxidation number of each element in each species (use <code>+3</code>, <code>-2</code>, <code>0</code>; averages like <code>8/3</code> are fine).</div>
      <table class="on">${rows}</table>
      <div class="row"><button class="btn" id="on-check" ${C.on.done ? 'disabled' : ''}>Check oxidation numbers</button></div>
      <div id="on-fb">${C.on.fb || ''}</div>`;
    if (C.on.done) {
      const els = [...new Set(sps.flatMap(s => Object.keys(s.comp)))];
      const reacts = p.R;
      const cb = (name, items, lab) => items.map(it => {
        const v = typeof it === 'string' ? it : it.key; const id = `${name}-${v}`;
        return `<label><input type="checkbox" id="${esc(id)}" data-group="${name}" value="${esc(v)}" ${C.vals[id] ? 'checked' : ''} ${C.id.done ? 'disabled' : ''}> ${lab(it)}</label>`;
      }).join('');
      body += `<h3>Who is oxidized, who is reduced?</h3>
        <div class="instr">Check every answer that applies.</div>
        <div class="idgrid">
          <div><span class="oxt">Oxidized</span> element(s) <span class="small muted">(oxidation number goes up)</span></div><div>${cb('idox', els, e => e)}</div>
          <div><span class="redt">Reduced</span> element(s) <span class="small muted">(oxidation number goes down)</span></div><div>${cb('idred', els, e => e)}</div>
          <div>Oxidizing agent(s) <span class="small muted">(the reactant that gets reduced)</span></div><div>${cb('idoa', reacts, s => spHTML(s.text))}</div>
          <div>Reducing agent(s) <span class="small muted">(the reactant that gets oxidized)</span></div><div>${cb('idra', reacts, s => spHTML(s.text))}</div>
        </div>
        <div class="row"><button class="btn" id="id-check" ${C.id.done ? 'disabled' : ''}>Check</button></div>
        <div id="id-fb">${C.id.fb || ''}</div>`;
    }
    h += stepCard(1, 'Assign oxidation numbers', s1done ? 'done' : '', body);
  }

  // ---- Step 2: split
  const s2state = !s1done ? 'locked' : C.split.done ? 'done' : '';
  {
    const body = `<div class="instr">Write the two skeleton half-reactions. Use only the species from the equation, no coefficients needed yet.
        The oxidation half has the species whose element is oxidized; the reduction half has the species whose element is reduced.</div>
      <div class="split2">
        <div><b class="oxt">Oxidation half-reaction</b>${eqBox('split-ox', C.vals['split-ox'], { inv: false, disabled: C.split.done, placeholder: 'e.g. Fe^2+ -> Fe^3+' })}<div>${C.split.fb.ox || ''}</div></div>
        <div><b class="redt">Reduction half-reaction</b>${eqBox('split-red', C.vals['split-red'], { inv: false, disabled: C.split.done, placeholder: 'e.g. MnO4^- -> Mn^2+' })}<div>${C.split.fb.red || ''}</div></div>
      </div>
      <div class="row"><button class="btn" id="split-check" ${C.split.done ? 'disabled' : ''}>Check</button>
      ${C.split.tries >= 3 && !C.split.done ? '<button class="btn secondary small" id="split-show">Show me</button>' : ''}</div>`;
    h += stepCard(2, 'Split into two half-reactions', s2state, body);
  }

  // ---- Steps 3–6: balance each half
  const halvesDone = C.half.ox.stage > 6 && C.half.red.stage > 6;
  const s36state = !C.split.done ? 'locked' : halvesDone ? 'done' : '';
  {
    const skipText = (hh, name) => hh.noOH ? `The ${name} half has no O or H, so it skips steps 4 and 5.` : hh.noO ? `The ${name} half has no O, so it skips step 4 (no H₂O needed).` : '';
    const skipNote = p.noOH ? ' There is no O or H anywhere in this reaction, so steps 4 and 5 are skipped: no H₂O or H⁺ is needed.'
      : [skipText(p.oxHalf, 'oxidation'), skipText(p.redHalf, 'reduction')].filter(x => x).map(x => ' ' + x).join('');
    const body = `<div class="instr">Balance each half-reaction separately, one step at a time${p.noOH ? '' : `, as if the solution were acidic${basic ? ' (you will switch to basic at the end)' : ''}`}.${skipNote}
      The table under the box counts atoms and charge on each side as you type.</div>
      <div class="halves">${halfColumn('ox')}${halfColumn('red')}</div>`;
    h += stepCard('3–6', 'Balance each half-reaction', s36state, body);
  }

  // ---- Step 7: equalize electrons
  const s7state = !halvesDone ? 'locked' : C.mult.done ? 'done' : '';
  {
    let body = '';
    if (halvesDone) {
      const ho = C.half.ox, hr = C.half.red;
      body = `<div class="instr">Multiply each half-reaction by a whole number so that the electrons lost in oxidation equal the electrons gained in reduction.</div>
        <div class="multline"><input type="number" min="1" id="m-ox" value="${esc(C.vals['m-ox'] || '')}" ${C.mult.done ? 'disabled' : ''}> × <span class="eq">${eqHTML(ho.acc[6])}</span> <span class="small muted">(${ho.electrons} e⁻ lost)</span></div>
        <div class="multline"><input type="number" min="1" id="m-red" value="${esc(C.vals['m-red'] || '')}" ${C.mult.done ? 'disabled' : ''}> × <span class="eq">${eqHTML(hr.acc[6])}</span> <span class="small muted">(${hr.electrons} e⁻ gained)</span></div>
        <div class="row"><button class="btn" id="mult-check" ${C.mult.done ? 'disabled' : ''}>Check</button>
        ${C.mult.tries >= 3 && !C.mult.done ? '<button class="btn secondary small" id="mult-show">Show me</button>' : ''}</div>
        <div id="mult-fb">${C.mult.fb || ''}</div>`;
    }
    h += stepCard(7, 'Make electrons lost = electrons gained', s7state, body);
  }

  // ---- Step 8: add and cancel
  const s8state = !C.mult.done ? 'locked' : C.sum.done ? 'done' : '';
  {
    let body = '';
    if (C.mult.done) {
      body = `<div class="instr">Add the multiplied half-reactions. Cancel the electrons${p.noOH ? '' : ', and cancel any H₂O or H⁺ that appears on both sides'}. Type the overall equation.</div>
        <div style="margin:6px 0 10px"><div class="eq">${eqHTML(C.mult.oxText)}</div><div class="eq">${eqHTML(C.mult.redText)}</div></div>
        ${eqBox('sum-in', C.vals['sum-in'], { disabled: C.sum.done })}
        <div class="row"><button class="btn" id="sum-in-check" ${C.sum.done ? 'disabled' : ''}>Check</button></div>
        <div id="sum-fb">${C.sum.fb || ''}</div>`;
    }
    h += stepCard(8, 'Add the half-reactions and cancel', s8state, body);
  }

  // ---- Step 9: basic
  if (basic) {
    const s9state = !C.sum.done ? 'locked' : C.basic.done ? 'done' : '';
    let body = '';
    if (C.sum.done) {
      const hp = p.acid.vec[KEY_HP] || 0;
      const n = Math.abs(hp), side = hp > 0 ? 'left' : 'right';
      body = `<div class="instr">The reaction runs in basic solution, so the final equation can't contain H⁺.</div>
        <ol class="small">
          <li>Count the H⁺ in your equation${n ? '' : ' (there are none, so nothing changes!)'}. Add the same number of OH⁻ to <b>both</b> sides.</li>
          <li>On the side with H⁺, combine each H⁺ + OH⁻ into H₂O.</li>
          <li>Cancel H₂O that appears on both sides.</li>
        </ol>
        <div class="eq" style="margin-bottom:8px">${eqHTML(C.vals['sum-in'] || p.acidText)}</div>
        ${eqBox('basic-in', C.vals['basic-in'], { disabled: C.basic.done })}
        <div class="row"><button class="btn" id="basic-in-check" ${C.basic.done ? 'disabled' : ''}>Check</button></div>
        <div id="basic-fb">${C.basic.fb || ''}</div>`;
    }
    h += stepCard(9, 'Convert to basic solution', s9state, body);
  }

  // ---- Done
  const allDone = basic ? C.basic.done : C.sum.done;
  if (allDone) {
    const sp = s => s.map(k => spHTML(p.byKey[k].text)).join(', ');
    h += `<div class="donebox"><h2 style="margin:0 0 4px">Balanced!</h2>
      <div class="final eq">${eqHTML(p.answerText)}</div>
      <div><b>Electrons transferred:</b> ${p.acid.eTransferred} &nbsp;·&nbsp; <b>Oxidizing agent:</b> ${sp(p.oxidizingAgents)} &nbsp;·&nbsp; <b>Reducing agent:</b> ${sp(p.reducingAgents)}</div>
      <div class="row"><button class="btn" id="c-next">Next problem</button></div></div>`;
  }

  $('coach-steps').innerHTML = h;
  wireCoach();
}

const STAGE = {
  3: ['Balance atoms other than O and H', 'Change coefficients only. Don\'t add anything yet.', 3],
  4: ['Balance O by adding H₂O', 'Add H₂O to the side that needs oxygen.', 4],
  5: ['Balance H by adding H⁺', 'Add H⁺ to the side that needs hydrogen.', 5],
  6: ['Balance charge by adding electrons', 'Add e^- to the more positive side.', 6],
};
function halfColumn(t) {
  const hs = C.half[t];
  let h = `<div class="halfcol ${t}"><h3>${t === 'ox' ? 'Oxidation' : 'Reduction'} half-reaction</h3>`;
  for (const st of [3, 4, 5, 6]) {
    const [title, tip] = STAGE[st];
    if (hs.skipped && hs.skipped[st]) {
      h += `<div class="substep future"><div class="t">Step ${st}. ${title}: not needed</div><div class="small">${st === 4 ? 'No O in this half-reaction, so no H₂O.' : 'No O or H in this half-reaction.'}</div></div>`;
    } else if (hs.acc[st] !== undefined) {
      h += `<div class="substep"><div class="t">Step ${st}. ${title} <span class="tick">✓</span></div><div class="done-eq eq">${eqHTML(hs.acc[st])}</div></div>`;
    } else if (hs.stage === st && C.split.done) {
      const id = `h-${t}-${st}`;
      const val = C.vals[id] !== undefined ? C.vals[id] : (st === 3 ? C.split.acc[t] : hs.acc[st - 1]);
      C.vals[id] = val;
      h += `<div class="substep"><div class="t">Step ${st}. ${title}</div><div class="small muted">${tip}</div>
        ${eqBox(id, val, { focus: st })}
        <div class="row"><button class="btn small" id="${id}-check">Check</button></div>
        <div>${hs.fb || ''}</div></div>`;
    } else {
      h += `<div class="substep future"><div class="t">Step ${st}. ${title}</div></div>`;
    }
  }
  if (hs.stage > 6) h += `<div class="small" style="margin-top:4px"><b>${hs.electrons}</b> electron${hs.electrons === 1 ? '' : 's'} ${t === 'ox' ? 'lost' : 'gained'}.</div>`;
  return h + '</div>';
}

function checkSplit(input, half) {
  let eq;
  try { eq = parseEquation(input); } catch (e) { return { ok: false, msg: e.message }; }
  const skel = new Set([...half.R, ...half.P].map(s => s.key));
  const ignore = k => [KEY_H2O, KEY_HP, KEY_OH, KEY_E].includes(k) && !skel.has(k);
  const L = new Set(eq.left.map(t => t.sp.key).filter(k => !ignore(k)));
  const R = new Set(eq.right.map(t => t.sp.key).filter(k => !ignore(k)));
  const wantL = new Set(half.R.map(s => s.key)), wantR = new Set(half.P.map(s => s.key));
  const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  if (same(L, wantL) && same(R, wantR)) return { ok: true, L, R };
  return { ok: false, L, R, eq };
}

function wireCoach() {
  const root = $('coach-steps'), p = C.prob;
  bindEqBoxes(root, C.vals);
  root.querySelectorAll('input[type=text]:not(.eqin), input[type=number]').forEach(i => i.addEventListener('input', () => { C.vals[i.id] = i.value; }));
  root.querySelectorAll('input[type=checkbox]').forEach(i => i.addEventListener('change', () => { C.vals[i.id] = i.checked; }));
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };

  // Step 1a
  on('on-check', () => {
    const sps = uniqueSpecies(p); let wrong = 0, blank = 0, unreadable = 0; C.on.marks = {};
    sps.forEach((s, i) => Object.keys(s.comp).forEach(el => {
      const id = `on-${i}-${el}`; const raw = C.vals[id] || '';
      const v = parseONInput(raw);
      if (v === null) blank++;
      if (v === undefined) unreadable++;
      const ok = v && onMatches(v, s.on[el]);
      C.on.marks[id] = ok ? 'right' : 'wrong';
      if (!ok) wrong++;
    }));
    if (!wrong) { C.on.done = true; C.on.fb = fbHTML('ok', ['All oxidation numbers are right.']); renderCoach(); return; }
    C.on.tries++;
    const msgs = [`${wrong} oxidation number${wrong > 1 ? 's are' : ' is'} not right yet (marked in red).`];
    if (blank) msgs.push(`${blank} box${blank > 1 ? 'es are' : ' is'} empty.`);
    if (unreadable) msgs.push('Some entries could not be read. Use forms like +3, -2, 0 or 8/3.');
    const rule = C.on.tries >= 2 ? 'Free elements are 0. Monatomic ions equal their charge. F is −1; group 1 metals +1; group 2 metals +2; H is +1 (−1 with metals); O is −2 (−1 in peroxides). The oxidation numbers add up to the charge of the species.' : '';
    C.on.fb = fbHTML('bad', msgs, rule, C.on.tries >= 3 ? '<div class="row"><button class="btn secondary small" id="on-show">Show me</button></div>' : '');
    renderCoach();
  });
  on('on-show', () => {
    uniqueSpecies(p).forEach((s, i) => Object.keys(s.comp).forEach(el => { const id = `on-${i}-${el}`; C.vals[id] = onFmt(s.on[el]).replace('−', '-'); C.on.marks[id] = 'right'; }));
    C.on.done = true; C.on.fb = fbHTML('hint', ['Here are the oxidation numbers. Compare each one with what you had.']); renderCoach();
  });

  // Step 1b
  on('id-check', () => {
    const got = g => new Set([...root.querySelectorAll(`input[data-group=${g}]`)].filter(i => i.checked).map(i => i.value));
    const same = (a, b) => a.size === b.length && b.every(x => a.has(x));
    const msgs = [];
    if (!same(got('idox'), p.oxidizedEls)) msgs.push('Oxidized element(s): not right. Find the element whose oxidation number goes up from reactant to product.');
    if (!same(got('idred'), p.reducedEls)) msgs.push('Reduced element(s): not right. Find the element whose oxidation number goes down.');
    if (!same(got('idoa'), p.oxidizingAgents)) msgs.push('Oxidizing agent: not right. It is the reactant that contains the element being reduced.');
    if (!same(got('idra'), p.reducingAgents)) msgs.push('Reducing agent: not right. It is the reactant that contains the element being oxidized.');
    if (!msgs.length) { C.id.done = true; C.id.fb = fbHTML('ok', ['Right. Now split the reaction into its two halves.']); renderCoach(); return; }
    C.id.tries++;
    const rule = C.id.tries >= 2 ? 'Oxidation is loss of electrons (oxidation number increases). Reduction is gain of electrons (oxidation number decreases). The oxidizing agent is reduced; the reducing agent is oxidized.' : '';
    C.id.fb = fbHTML('bad', msgs, rule, C.id.tries >= 3 ? '<div class="row"><button class="btn secondary small" id="id-show">Show me</button></div>' : '');
    renderCoach();
  });
  on('id-show', () => {
    root.querySelectorAll('input[type=checkbox]').forEach(i => {
      const g = i.dataset.group, v = i.value;
      const want = g === 'idox' ? p.oxidizedEls : g === 'idred' ? p.reducedEls : g === 'idoa' ? p.oxidizingAgents : p.reducingAgents;
      C.vals[i.id] = want.includes(v);
    });
    C.id.done = true; C.id.fb = fbHTML('hint', ['Here are the answers.']); renderCoach();
  });

  // Step 2
  on('split-check', () => {
    const fb = {}; let allOK = true;
    for (const t of ['ox', 'red']) {
      const half = t === 'ox' ? p.ox : p.red, other = t === 'ox' ? p.red : p.ox;
      const r = checkSplit(C.vals['split-' + t] || '', half);
      if (r.ok) { fb[t] = fbHTML('ok', ['✓']); continue; }
      allOK = false;
      if (r.msg) { fb[t] = fbHTML('bad', [r.msg]); continue; }
      if (checkSplit(C.vals['split-' + t] || '', other).ok) { fb[t] = fbHTML('bad', [`That's the ${t === 'ox' ? 'reduction' : 'oxidation'} half-reaction. Put it in the other box.`]); continue; }
      const msgs = [];
      const named = k => p.byKey[k] ? p.byKey[k].text : k;
      for (const s of half.R) if (!r.L.has(s.key)) msgs.push(`${s.text} belongs on the left of this half.`);
      for (const s of half.P) if (!r.R.has(s.key)) msgs.push(`${s.text} belongs on the right of this half.`);
      const all = new Set([...half.R, ...half.P].map(s => s.key));
      for (const k of [...r.L, ...r.R]) if (!all.has(k)) msgs.push(p.byKey[k] ? `${named(k)} doesn't belong in this half.` : `Something in this half isn't in the skeleton equation.`);
      if (!msgs.length) msgs.push('Each species should appear once, on the same side as in the skeleton equation.');
      fb[t] = fbHTML('bad', msgs);
    }
    if (allOK) {
      C.split.done = true;
      C.split.acc = { ox: C.vals['split-ox'], red: C.vals['split-red'] };
    } else {
      C.split.tries++;
      if (C.split.tries >= 2) fb.ox = (fb.ox || '') + `<div class="fb hint"><b>Rule:</b> Each half-reaction contains one element that changes oxidation number (here: ${p.oxidizedEls.join(', ')} oxidized; ${p.reducedEls.join(', ')} reduced). Put each reactant with the product that contains the same element.</div>`;
    }
    C.split.fb = fb; renderCoach();
  });
  on('split-show', () => {
    const txt = half => half.R.map(s => s.text).join(' + ') + ' -> ' + half.P.map(s => s.text).join(' + ');
    C.vals['split-ox'] = txt(p.ox); C.vals['split-red'] = txt(p.red);
    C.split.done = true; C.split.acc = { ox: C.vals['split-ox'], red: C.vals['split-red'] };
    C.split.fb = { ox: fbHTML('hint', ['Here is the oxidation half.']), red: fbHTML('hint', ['Here is the reduction half.']) };
    renderCoach();
  });

  // Steps 3–6
  for (const t of ['ox', 'red']) {
    const hs = C.half[t], st = hs.stage, id = `h-${t}-${st}`;
    const solved = t === 'ox' ? p.oxHalf : p.redHalf;
    on(id + '-check', () => {
      const val = C.vals[id] || '';
      const r = checkHalf(val, solved, st);
      if (r.ok) {
        hs.acc[st] = val; hs.stage = st + 1; hs.fb = r.note ? fbHTML('ok', [r.note]) : '';
        // skip steps that can't apply: 4 needs O in the half; 5 needs O or H
        hs.skipped = hs.skipped || {};
        while (hs.stage <= 5 && ((hs.stage === 4 && solved.noO) || (hs.stage === 5 && solved.noOH))) {
          hs.skipped[hs.stage] = true; hs.acc[hs.stage] = val; hs.stage++;
        }
        if (st === 6) { hs.electrons = r.electrons; hs.vec = r.vec; hs.sp = r.sp; }
      } else {
        hs.tries[st] = (hs.tries[st] || 0) + 1;
        hs.fb = ladderFB(r, hs.tries[st], id + '-show');
      }
      renderCoach();
    });
    on(id + '-show', () => { C.vals[id] = halfStage(solved, st); hs.fb = fbHTML('hint', ['Here is this step. Compare it with yours, then click Check.']); renderCoach(); });
  }

  // Step 7
  on('mult-check', () => {
    const mo = parseInt(C.vals['m-ox'], 10), mr = parseInt(C.vals['m-red'], 10);
    const eo = C.half.ox.electrons, er = C.half.red.electrons;
    if (!(mo >= 1) || !(mr >= 1) || String(mo) !== String(C.vals['m-ox']).trim() || String(mr) !== String(C.vals['m-red']).trim()) {
      C.mult.fb = fbHTML('bad', ['Enter a whole number (1 or more) in each box.']); renderCoach(); return;
    }
    if (mo * eo !== mr * er) {
      C.mult.tries++;
      C.mult.fb = fbHTML('bad', [`Electrons lost: ${mo} × ${eo} = ${mo * eo}. Electrons gained: ${mr} × ${er} = ${mr * er}. These must be equal.`],
        C.mult.tries >= 2 ? 'Use the least common multiple of the two electron counts.' : '');
      renderCoach(); return;
    }
    const L = eo * er / gcdUI(eo, er);
    const note = mo * eo > L ? ` That works. Smaller multipliers (${L / eo} and ${L / er}) would also work.` : '';
    C.mult.done = true; C.mult.fb = fbHTML('ok', [`${mo * eo} electrons lost = ${mr * er} electrons gained.${note}`]);
    C.mult.oxText = scaledText(C.half.ox, mo); C.mult.redText = scaledText(C.half.red, mr);
    renderCoach();
  });
  on('mult-show', () => {
    const eo = C.half.ox.electrons, er = C.half.red.electrons, L = eo * er / gcdUI(eo, er);
    C.vals['m-ox'] = String(L / eo); C.vals['m-red'] = String(L / er); renderCoach();
  });

  // Step 8
  on('sum-in-check', () => {
    const r = checkOverall(C.vals['sum-in'] || '', p, 'acidic');
    if (r.ok) { C.sum.done = true; C.sum.fb = fbHTML('ok', [r.note || (p.medium === 'basic' ? 'Right, balanced in acid. One more step for basic solution.' : 'Right!')]); }
    else { C.sum.tries++; C.sum.fb = ladderFB(r, C.sum.tries, 'sum-show'); }
    renderCoach();
  });
  on('sum-show', () => { C.vals['sum-in'] = p.acidText; C.sum.fb = fbHTML('hint', ['Here is the overall equation in acid. Click Check to continue.']); renderCoach(); });

  // Step 9
  on('basic-in-check', () => {
    const r = checkOverall(C.vals['basic-in'] || '', p, 'basic');
    if (r.ok) { C.basic.done = true; C.basic.fb = fbHTML('ok', [r.note || 'Right!']); }
    else { C.basic.tries++; C.basic.fb = ladderFB(r, C.basic.tries, 'basic-show'); }
    renderCoach();
  });
  on('basic-show', () => { C.vals['basic-in'] = p.basic ? vecToString(p.basic.vec, p.basic.sp, p.basic.order) : ''; C.basic.fb = fbHTML('hint', ['Here is the equation in basic solution. Click Check to finish.']); renderCoach(); });

  on('c-next', () => {
    const list = PROBLEMS.filter(q => (C.level === 'all' || q.level == C.level) && q.id !== C.pid);
    if (list.length) startCoach(list[Math.floor(Math.random() * list.length)]);
  });
}
function gcdUI(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function scaledText(hs, m) {
  const vec = {}; for (const k in hs.vec) vec[k] = hs.vec[k] * m;
  return vecToString(vec, hs.sp, Object.keys(hs.vec));
}

// ======================================================
//                      TESTING
// ======================================================
const T = { level: 'all', prob: null, meta: null, tries: 0, solved: false, attempted: 0, correct: 0, firstTry: 0, val: '', fb: '' };
function newTest(p) {
  if (!p) {
    const pool = PROBLEMS.filter(q => (T.level === 'all' || q.level == T.level) && (!T.meta || q.id !== T.meta.id));
    if (!pool.length) { T.prob = null; renderTest(); return; }
    p = pool[Math.floor(Math.random() * pool.length)];
  }
  try { T.prob = solveProblem(p.eq, p.medium); } catch (e) { T.prob = null; }
  T.meta = p; T.tries = 0; T.solved = false; T.val = ''; T.fb = ''; T.counted = false;
  renderTest();
}
function renderTest() {
  const el = $('tab-test');
  let h = `<div class="card"><h2>Testing</h2>
    <div class="instr">Balance the whole equation and type it in. Unlimited tries. After a wrong try you get a hint, then the rule, then the answer is offered.</div>
    ${levelChips(T.level, 'data-tlevel')}
    <div class="score">Solved: ${T.correct} of ${T.attempted} attempted · first try: ${T.firstTry}</div></div>`;
  if (T.prob) {
    const p = T.prob;
    h += `<div class="card">
      <div class="problem"><span class="eq">${eqHTML(p.skeleton)}</span>${medBadge(p)}<span class="badge lvl">Level ${T.meta.level} · ${esc(T.meta.id)}</span></div>
      <div class="invtoggle"><label><input type="checkbox" id="t-inv" ${showInventory ? 'checked' : ''}> Show the atom and charge count as I type</label></div>
      ${eqBox('t-in', T.val, { disabled: T.solved })}
      <div class="row"><button class="btn" id="t-in-check" ${T.solved ? 'disabled' : ''}>Check</button>
        <button class="btn secondary" id="t-next">${T.solved ? 'Next problem' : 'Skip'}</button>
        <button class="btn secondary" id="t-coach">Coach me through this one</button></div>
      <div id="t-fb">${T.fb}</div></div>`;
  } else h += `<div class="card">No problems at this level.</div>`;
  el.innerHTML = h;
  el.querySelectorAll('[data-tlevel]').forEach(b => b.onclick = () => { T.level = b.dataset.tlevel; T.meta = null; newTest(); });
  bindEqBoxes(el);
  const inp = $('t-in'); if (inp) inp.addEventListener('input', () => { T.val = inp.value; });
  const tinv = $('t-inv'); if (tinv) tinv.onchange = () => { showInventory = tinv.checked; updateEqBox($('t-in')); };
  const ck = $('t-in-check'); if (ck) ck.onclick = () => {
    if (!T.counted) { T.attempted++; T.counted = true; }
    const r = checkOverall(T.val, T.prob, T.prob.medium);
    if (r.ok) {
      T.solved = true; T.correct++; if (T.tries === 0) T.firstTry++;
      T.fb = fbHTML('ok', [(T.tries === 0 ? 'Correct on the first try! ' : 'Correct! ') + (r.note || '')]);
    } else {
      T.tries++;
      T.fb = ladderFB(r, T.tries, 't-show');
    }
    renderTest();
  };
  const sh = $('t-show'); if (sh) sh.onclick = () => {
    T.fb = fbHTML('hint', ['Answer:'], '', `<div class="final eq">${eqHTML(T.prob.answerText)}</div><div class="small">Half-reactions: <span class="eq" style="font-size:15px">${eqHTML(halfStage(T.prob.oxHalf, 6))}</span> &nbsp;and&nbsp; <span class="eq" style="font-size:15px">${eqHTML(halfStage(T.prob.redHalf, 6))}</span></div>`);
    T.solved = true; renderTest();
  };
  const nx = $('t-next'); if (nx) nx.onclick = () => newTest();
  const co = $('t-coach'); if (co) co.onclick = () => { showTab('coach'); startCoach(T.meta); };
}

// ======================================================
//                      REVIEW
// ======================================================
function workedHTML(skel, medium) {
  const p = solveProblem(skel, medium);
  const onList = s => Object.keys(s.comp).map(e => `${e} ${onFmt(s.on[e])}`).join(', ');
  const changes = [];
  for (const e of p.oxidizedEls) changes.push(`<span class="oxt">${e} is oxidized</span>`);
  for (const e of p.reducedEls) changes.push(`<span class="redt">${e} is reduced</span>`);
  const sk = h => h.R.map(s => s.text).join(' + ') + ' -> ' + h.P.map(s => s.text).join(' + ');
  let h = `<div class="problem"><span class="eq">${eqHTML(skel)}</span><span class="badge ${p.medium}">${p.medium} solution</span></div><table class="worked">`;
  h += `<tr><td>1. Oxidation numbers</td><td>${uniqueSpecies(p).map(s => `${spHTML(s.text)}: ${onList(s)}`).join('<br>')}<br>${changes.join('; ')}.</td></tr>`;
  h += `<tr><td>2. Split</td><td><span class="oxt">Ox:</span> ${eqSpan(sk(p.ox))}<br><span class="redt">Red:</span> ${eqSpan(sk(p.red))}</td></tr>`;
  for (const st of [3, 4, 5, 6]) {
    const skip = hh => (st === 4 && hh.noO) || (st === 5 && hh.noOH);
    if (skip(p.oxHalf) && skip(p.redHalf)) continue;
    const cell = hh => skip(hh) ? '<span class="muted">not needed</span>' : eqSpan(halfStage(hh, st));
    h += `<tr><td>${st}. ${STAGE[st][0]}</td><td><span class="oxt">Ox:</span> ${cell(p.oxHalf)}<br><span class="redt">Red:</span> ${cell(p.redHalf)}</td></tr>`;
  }
  const L = p.oxHalf.electrons * p.acid.mo;
  h += `<tr><td>7. Equalize electrons</td><td>Oxidation × ${p.acid.mo}, reduction × ${p.acid.mr} → ${L} electrons each way.</td></tr>`;
  h += `<tr><td>8. Add and cancel</td><td>${eqSpan(p.acidText)}</td></tr>`;
  if (p.medium === 'basic') {
    const n = Math.abs(p.acid.vec[KEY_HP] || 0);
    h += `<tr><td>9. Convert to basic</td><td>Add ${n} OH⁻ to both sides; ${n} H⁺ + ${n} OH⁻ → ${n} H₂O; cancel water:<br>${eqSpan(vecToString(p.basic.vec, p.basic.sp, p.basic.order))}</td></tr>`;
  }
  h += `<tr><td>Check</td><td>Atoms and charge balance on both sides. ✓</td></tr></table>`;
  return h;
}
function renderReview() {
  $('tab-review').innerHTML = `
  <div class="card"><h2>Redox in one paragraph</h2>
    <p>In an oxidation–reduction (redox) reaction, electrons move from one species to another. The species that <b class="oxt">loses electrons is oxidized</b>, and the oxidation number of one of its elements goes up. The species that <b class="redt">gains electrons is reduced</b>, and the oxidation number of one of its elements goes down. The species that is reduced is the <b>oxidizing agent</b>; the species that is oxidized is the <b>reducing agent</b>. A balanced redox equation must balance <b>atoms</b> and <b>charge</b>, and electrons lost must equal electrons gained.</p></div>
  <div class="card"><h2>Oxidation number rules</h2>
    <table class="rules"><tr><th>Rule</th><th>Examples</th></tr>
    <tr><td>An element by itself has oxidation number 0.</td><td>Cu, O₂, Cl₂, P₄ are all 0</td></tr>
    <tr><td>A monatomic ion's oxidation number equals its charge.</td><td>Fe³⁺ is +3, Cl⁻ is −1</td></tr>
    <tr><td>F is always −1. Group 1 metals are +1; group 2 metals are +2.</td><td>Na in NaCl is +1</td></tr>
    <tr><td>H is +1 with nonmetals, −1 with metals.</td><td>H in H₂O is +1; in NaH it is −1</td></tr>
    <tr><td>O is usually −2 (−1 in peroxides, +2 in OF₂).</td><td>O in H₂O₂ is −1</td></tr>
    <tr><td>The oxidation numbers add up to the charge of the species.</td><td>MnO₄⁻: Mn + 4(−2) = −1, so Mn is +7</td></tr>
    <tr><td>If an element appears more than once, the answer can be an average.</td><td>Fe in Fe₃O₄ is +8/3; C in C₂H₅OH is −2</td></tr></table></div>
  <div class="card"><h2>The half-reaction method</h2>
    <ol class="method">
      <li><b>Assign oxidation numbers.</b> Find what is oxidized and what is reduced.</li>
      <li><b>Split</b> the skeleton equation into an oxidation half-reaction and a reduction half-reaction.</li>
      <li>In each half, <b>balance the atoms other than O and H</b> by changing coefficients.</li>
      <li><b>Balance O</b> by adding H₂O.</li>
      <li><b>Balance H</b> by adding H⁺.</li>
      <li><b>Balance charge</b> by adding electrons (to the right in oxidation, to the left in reduction).</li>
      <li><b>Multiply</b> each half so that electrons lost = electrons gained.</li>
      <li><b>Add</b> the half-reactions and <b>cancel</b> electrons and anything that appears on both sides.</li>
      <li><b>Basic solution only:</b> add as many OH⁻ to both sides as there are H⁺, combine H⁺ + OH⁻ → H₂O, and cancel water.</li>
    </ol>
    <p class="muted small">Always finish by checking that atoms and charge balance.</p></div>
  <div class="card"><h2>Worked example 1: acidic solution</h2>${workedHTML('MnO4^- + Fe^2+ -> Mn^2+ + Fe^3+', 'acidic')}</div>
  <div class="card"><h2>Worked example 2: basic solution</h2>${workedHTML('MnO4^- + I^- -> MnO2 + I2', 'basic')}</div>
  <div class="card"><h2>How to type equations</h2>
    <table class="typing">
      <tr><td>Subscripts</td><td>just type the number: <code>Cr2O7</code></td><td>${spHTML('Cr2O7')}</td></tr>
      <tr><td>Charges</td><td>after <code>^</code>: <code>Fe^3+</code>, <code>SO4^2-</code>, <code>MnO4^-</code></td><td>${spHTML('Fe^3+')}, ${spHTML('SO4^2-')}, ${spHTML('MnO4^-')}</td></tr>
      <tr><td>Electrons</td><td><code>e^-</code></td><td>${spHTML('e^-')}</td></tr>
      <tr><td>Coefficients</td><td>in front: <code>8H^+</code>, <code>4H2O</code></td><td>${eqHTML('8H^+')}, ${eqHTML('4H2O')}</td></tr>
      <tr><td>Arrow</td><td><code>-&gt;</code></td><td>→</td></tr>
      <tr><td>Between species</td><td><code> + </code> with spaces around it</td><td></td></tr>
    </table>
    <p class="small muted">Watch out: <code>Fe3+</code> without the <code>^</code> reads as Fe₃⁺. The "Reads as" line under every box shows how your typing was understood.</p></div>`;
}

// ======================================================
//                      INSTRUCTOR
// ======================================================
let staged = [];
function parseTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const cells = l => l.split(delim).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
  const head = cells(lines[0]).map(h => h.toLowerCase());
  const col = n => head.indexOf(n);
  if (col('equation') < 0) throw new Error('The first row must be a header with the columns id, level, equation, medium.');
  return lines.slice(1).map((l, i) => {
    const c = cells(l);
    return { row: i + 2, id: c[col('id')] || '', level: c[col('level')] || '', eq: c[col('equation')] || '', medium: (c[col('medium')] || '').toLowerCase() };
  });
}
function validateRows(rows) {
  const ids = new Set();
  return rows.map(r => {
    const errs = [];
    if (!r.id) errs.push('missing id'); else if (ids.has(r.id)) errs.push('duplicate id'); else ids.add(r.id);
    const lv = parseInt(r.level, 10);
    if (!(lv >= 1 && lv <= 5)) errs.push('level must be 1–5');
    if (r.medium !== 'acidic' && r.medium !== 'basic') errs.push('medium must be acidic or basic');
    let answer = '';
    if (!r.eq) errs.push('missing equation');
    else { try { answer = solveProblem(r.eq, r.medium === 'basic' ? 'basic' : 'acidic').answerText; } catch (e) { errs.push(e.message); } }
    return { ...r, level: lv, errs, answer };
  });
}
function download(name, text, type = 'text/plain') {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { /* some previews block downloads */ }
  // fallback: show the text so it can be copied
  const box = $('i-copy');
  if (box) {
    box.innerHTML = `<div class="small muted" style="margin-top:10px">If the download didn't start (some previews block downloads), copy this text into a file named <b>${esc(name)}</b>:</div>
      <textarea readonly style="width:100%;height:140px;font-family:ui-monospace,monospace;font-size:12px">${esc(text)}</textarea>
      <button class="btn secondary small" id="i-copybtn">Copy</button>`;
    $('i-copybtn').onclick = async () => { try { await navigator.clipboard.writeText(text); $('i-copybtn').textContent = 'Copied'; } catch (e) { box.querySelector('textarea').select(); } };
  }
}
const csvOf = list => 'id,level,equation,medium\n' + list.map(p => `${p.id},${p.level},${p.eq},${p.medium}`).join('\n') + '\n';
function renderInstructor() {
  const up = uploadedProblems();
  $('tab-instructor').innerHTML = `
  <div class="card"><h2>Problem bank</h2>
    <p>Students currently see <b>${PROBLEMS.length}</b> problems (source: ${bankSource}${up.length ? `, plus ${up.length} uploaded in this browser` : ''}).
    The tool answers every problem itself, so a problem needs only its skeleton equation and whether it runs in acidic or basic solution.</p>
    <p class="small muted">How to update what students see: edit the spreadsheet → upload it here → fix any flagged rows → <b>Download problems.json</b> → upload <code>problems.json</code> to the GitHub repository, replacing the old one. The page reads that file when it opens.</p>
    <div class="row"><button class="btn secondary" id="i-template">Download template (.csv)</button>
    <button class="btn secondary" id="i-current">Download current problems (.csv)</button></div><div id="i-copy"></div></div>
  <div class="card"><h2>Upload a spreadsheet</h2>
    <p class="small">Save as <b>.csv</b> or <b>tab-delimited .txt</b>, with the columns <code>id</code>, <code>level</code> (1–5), <code>equation</code>, <code>medium</code> (acidic or basic). Write equations the way students type them, e.g. <code>Cr2O7^2- + Fe^2+ -&gt; Cr^3+ + Fe^3+</code>.</p>
    <input type="file" id="i-file" accept=".csv,.txt,.tsv">
    <div id="i-results"></div></div>`;
  $('i-template').onclick = () => download('redox-problems-template.csv', csvOf([
    { id: 'MY-001', level: 2, eq: 'MnO4^- + Fe^2+ -> Mn^2+ + Fe^3+', medium: 'acidic' },
    { id: 'MY-002', level: 3, eq: 'MnO4^- + I^- -> MnO2 + I2', medium: 'basic' }]), 'text/csv');
  $('i-current').onclick = () => download('redox-problems.csv', csvOf(PROBLEMS), 'text/csv');
  $('i-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    let rows;
    try { rows = validateRows(parseTable(text)); } catch (err) { $('i-results').innerHTML = fbHTML('bad', [err.message]); return; }
    staged = rows;
    const bad = rows.filter(r => r.errs.length);
    $('i-results').innerHTML = `<p><b>${rows.length}</b> rows read, <b>${bad.length}</b> with problems.</p>
      <table class="val"><tr><th>Row</th><th>id</th><th>Lvl</th><th>Equation</th><th>Medium</th><th>Balanced answer / problem</th></tr>
      ${rows.map(r => `<tr class="${r.errs.length ? 'err' : ''}"><td>${r.row}</td><td>${esc(r.id)}</td><td>${esc(r.level)}</td><td>${eqHTML(r.eq)}</td><td>${esc(r.medium)}</td>
        <td>${r.errs.length ? esc(r.errs.join('; ')) : eqHTML(r.answer)}</td></tr>`).join('')}</table>
      <div class="row">
        <button class="btn" id="i-json" ${bad.length ? 'disabled' : ''}>Download problems.json</button>
        <button class="btn secondary" id="i-try" ${bad.length ? 'disabled' : ''}>Try these in this browser</button>
        <button class="btn secondary" id="i-clear">Remove uploaded problems</button>
        ${bad.length ? '<span class="small muted">Fix the flagged rows and upload again.</span>' : ''}</div>`;
    const good = () => rows.map(r => ({ id: r.id, level: r.level, medium: r.medium, eq: r.eq }));
    $('i-json').onclick = () => download('problems.json', JSON.stringify(good(), null, 1), 'application/json');
    $('i-try').onclick = async () => { try { localStorage.setItem(LS_KEY, JSON.stringify(good())); } catch (e) { } await refreshBank(); $('i-copy').innerHTML = fbHTML('ok', [`${rows.length} problems added in this browser. They now appear in Coaching and Testing.`]); };
    $('i-clear').onclick = async () => { try { localStorage.removeItem(LS_KEY); } catch (e) { } await refreshBank(); $('i-copy').innerHTML = fbHTML('ok', ['Uploaded problems removed.']); };
  };
}
async function refreshBank() {
  await loadBank(); renderCoachPick(); renderInstructor(); if (!T.prob) newTest(); else renderTest();
}

// ======================================================
//                      TABS / START
// ======================================================
function showTab(name) {
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
}
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
(async function start() {
  await loadBank();
  renderReview();
  renderCoachPick();
  renderCoach();
  newTest();
  renderInstructor();
})();
