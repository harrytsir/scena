/* Scena — Production: script breakdown, element lists, cue sheet */
'use strict';

/* The 12 boxes of the breakdown sheet, in the order of the sheet */
const PROD_CATS = {
  screen: {
    cast:      { label: 'Cast', color: '#fca5a5' },
    stunts:    { label: 'Stunts', color: '#fdba74' },
    atmos:     { label: 'Extras / Atmosphere', color: '#86efac' },
    silent:    { label: 'Extras / Silent', color: '#d9f99d' },
    sfx:       { label: 'Special Effects', color: '#93c5fd' },
    props:     { label: 'Props', color: '#d8b4fe' },
    vehicles:  { label: 'Vehicles / Animals', color: '#f9a8d4' },
    wardrobe:  { label: 'Wardrobe', color: '#67e8f9' },
    makeup:    { label: 'Makeup / Hair', color: '#f0abfc' },
    sound:     { label: 'Sound Effects / Music', color: '#d6bfa5' },
    equipment: { label: 'Special Equipment', color: '#a5b4fc' },
    pnotes:    { label: 'Production Notes', color: '#d4d4d8' }
  },
  stage: {
    cast:      { label: 'Cast / Roles', color: '#fca5a5' },
    entrances: { label: 'Entrances / Exits', color: '#fdba74' },
    set:       { label: 'Set / Scenery', color: '#86efac' },
    setchange: { label: 'Set Changes', color: '#d9f99d', cue: 'SC' },
    sfx:       { label: 'Special Effects / Projections', color: '#93c5fd', cue: 'FX' },
    props:     { label: 'Props (Hand / Set)', color: '#d8b4fe' },
    lx:        { label: 'Lighting Cues (LX)', color: '#fcd34d', cue: 'LX', cueOnly: true },
    costumes:  { label: 'Costumes / Quick Changes', color: '#67e8f9' },
    makeup:    { label: 'Makeup / Hair', color: '#f0abfc' },
    sq:        { label: 'Sound & Music Cues (SQ)', color: '#d6bfa5', cue: 'SQ', cueOnly: true },
    equipment: { label: 'Stage Equipment', color: '#a5b4fc' },
    pnotes:    { label: 'Director / Stage Manager Notes', color: '#d4d4d8' }
  }
};
const prodCats = (d) => PROD_CATS[(d || S.doc).format] || PROD_CATS.screen;
// the boxes of the breakdown sheet: lighting and sound have their own cue sheets
const bdCats = (d) => Object.fromEntries(Object.entries(prodCats(d)).filter(([, c]) => !c.cueOnly));
(function tagColours() {
  const css = [];
  for (const [fmt, cats] of Object.entries(PROD_CATS)) for (const [k, c] of Object.entries(cats)) {
    css.push(`body[data-format="${fmt}"] .editor span[data-g="${k}"]{background:${c.color}80;box-shadow:inset 0 -2px 0 ${c.color};border-radius:2px}`);
    css.push(`body.dark[data-format="${fmt}"] .editor span[data-g="${k}"]{background:${c.color}40}`);
  }
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
})();
const dot = (k) => `<i class="cdot" style="background:${(prodCats()[k] || {}).color}"></i>`;

/* ---------- tagging in the text ---------- */
function rangeHasTag(r) {
  if (!r) return false;
  const a = blockOf(r.startContainer); if (!a) return false;
  if (r.collapsed) { const n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; return !!(n.closest && n.closest('[data-g]')); }
  const z = blockOf(r.endContainer) || a;
  for (let el = a; el; el = el.nextElementSibling) { if (el.querySelector('[data-g]') && r.intersectsNode(el)) return true; if (el === z) break; }
  return false;
}
function tagMenuHTML(r) {
  const cats = prodCats();
  return '<hr><div class="pop-h">Tag for production</div>' +
    Object.entries(cats).map(([k, c]) => `<button class="mi" data-v="tag:${k}"><span>${dot(k)}${c.label}</span></button>`).join('') +
    (rangeHasTag(r) ? mi('untag', 'Remove tag') : '');
}
function tagButton(anchor) {
  const sel = getSelection();
  const r = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  openPop(anchor, tagMenuHTML(r).replace(/^<hr>/, ''), v => {
    if (v.startsWith('tag:')) tagRange(r, v.slice(4)); else if (v === 'untag') untagRange(r);
  }, { keepFocus: true, align: 'center' });
}
// a collapsed cursor tags the whole word it sits in
function wordAround(el, off) {
  const t = elText(el);
  let a = off, b = off;
  while (a > 0 && /[\p{L}\p{N}'’-]/u.test(t[a - 1])) a--;
  while (b < t.length && /[\p{L}\p{N}'’-]/u.test(t[b])) b++;
  return [a, b];
}
function applyToRange(r, fn) {
  if (!r) { const s = getSelection(); if (!s.rangeCount) return false; r = s.getRangeAt(0); }
  const a = blockOf(r.startContainer); if (!a) return false;
  const z = blockOf(r.endContainer) || a;
  syncFromDOM(); commitNow();
  if (r.collapsed) {
    const [s0, s1] = wordAround(a, offIn(a, r.startContainer, r.startOffset));
    if (s1 <= s0) return false;
    const runs = domToRuns(a), len = elText(a).length;
    setRuns(a, [...sliceRuns(runs, 0, s0), ...sliceRuns(runs, s0, s1).map(fn), ...sliceRuns(runs, s1, len)]);
  } else {
    for (let el = a; el; el = el.nextElementSibling) {
      const runs = domToRuns(el), len = elText(el).length;
      const s0 = el === a ? offIn(el, r.startContainer, r.startOffset) : 0;
      const s1 = el === z ? offIn(el, r.endContainer, r.endOffset) : len;
      if (s1 > s0) setRuns(el, [...sliceRuns(runs, 0, s0), ...sliceRuns(runs, s0, s1).map(fn), ...sliceRuns(runs, s1, len)]);
      if (el === z) break;
    }
  }
  syncFromDOM(); commitNow(); docChanged(false); layoutPages();
  getSelection().removeAllRanges();
  return true;
}
function tagRange(r, k) {
  if (S.view !== 'text') setView('text');
  // a tag on the whole of a word that is already tagged with an other category replaces it
  if (!applyToRange(r, x => ({ ...x, g: k }))) toast('Select a word or phrase first');
  else toast(`Tagged as ${prodCats()[k].label}`, 1400);
}
function untagRange(r) {
  // removing from a cursor removes the whole tagged phrase around it
  if (r && r.collapsed) {
    const n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
    const sp = n.closest && n.closest('[data-g]');
    if (sp) { const rr = document.createRange(); rr.selectNodeContents(sp); r = rr; }
  }
  applyToRange(r, x => { const n = { ...x }; delete n.g; return n; });
}

/* ---------- reading the script ---------- */
function prodUnits(d) {
  const bl = d.blocks, hasScenes = bl.some(b => b.t === 'scene'), hasActs = bl.some(b => b.t === 'act');
  const out = []; let act = 0, num = 0;
  if (!hasScenes && !hasActs) return [{ id: 'all', start: 0, end: bl.length, num: 1, act: 0, heading: d.format === 'stage' ? 'Whole play' : 'Whole script' }];
  const ut = hasScenes ? 'scene' : 'act';
  bl.forEach((b, i) => {
    if (b.t === 'act') act++;
    if (b.t !== ut) return;
    let e = i + 1;
    while (e < bl.length && bl[e].t !== 'scene' && bl[e].t !== 'act') e++;
    num++;
    out.push({ id: b.id, start: i, end: e, num, act, heading: greekCaps(b.text) || '(untitled)' });
  });
  if (out.length && out[0].start > 0 && bl.slice(0, out[0].start).some(b => b.text.trim() && b.t !== 'act')) {
    out.unshift({ id: 'pre', start: 0, end: out[0].start, num: 0, act: 0, heading: 'Before the first scene' });
  }
  return out;
}
function headingParts(text) {
  const h = parseHeading(text || '');
  const f = foldStr(h.prefix);
  const ie = /ΕΣΩΤ.*ΕΞΩΤ|INT.*EXT|I\/E|ΕΣ\/ΕΞ/.test(f) ? 'INT/EXT' : /ΕΞΩΤ|EXT/.test(f) ? 'EXT' : /ΕΣΩΤ|INT/.test(f) ? 'INT' : '';
  return { ie, name: h.prefix ? greekCaps(h.loc) : greekCaps(text || ''), time: h.time != null ? greekCaps(h.time.trim()) : '' };
}
const normName = (s) => foldStr((s || '').replace(/\s+/g, ' ').trim()).replace(/[.,;:!?«»"“”]+$/, '');
// everything tagged in the text: [{cat, text, key, bi}]
function tagsIn(d, start = 0, end = d.blocks.length) {
  const out = [];
  for (let i = start; i < end; i++) {
    const runs = runsOf(d.blocks[i]);
    let cur = null;
    for (const r of runs) {
      if (r.g && cur && cur.cat === r.g) { cur.text += r.t; continue; }
      if (cur) { out.push(cur); cur = null; }
      if (r.g) cur = { cat: r.g, text: r.t, bi: i };
    }
    if (cur) out.push(cur);
  }
  return out.map(t => ({ ...t, text: t.text.trim(), key: normName(t.text) })).filter(t => t.key);
}
const bdStore = (d) => (d.bd = d.bd || {});
function unitData(d, u) {
  const cats = prodCats(d), box = {};
  for (const k of Object.keys(cats)) box[k] = new Map();
  const add = (k, name, from, bi) => {
    if (!box[k]) return; const key = normName(name); if (!key) return;
    const e = box[k].get(key) || { name: name.trim(), count: 0, from, bi };
    e.count++; if (from === 'manual') e.from = 'manual'; box[k].set(key, e);
  };
  for (let i = u.start; i < u.end; i++) if (d.blocks[i].t === 'character') add('cast', cleanCharName(d.blocks[i].text), 'auto', i);
  for (const t of tagsIn(d, u.start, u.end)) add(t.cat, t.cat === 'cast' ? greekCaps(t.text) : t.text, 'tag', t.bi);
  const man = bdStore(d)[u.id] || {};
  for (const [k, list] of Object.entries(man)) if (Array.isArray(list)) for (const n of list) add(k, n, 'manual');
  const words = d.blocks.slice(u.start, u.end).reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
  return { box, words };
}

/* ---------- view ---------- */
S.prod = S.prod || { sec: 'sheets', unit: 0 };
function renderProd() {
  const d = S.doc, view = $('#prodview');
  if (!d) return;
  syncFromDOM();
  const units = prodUnits(d);
  const P = S.prod; if (P.unit >= units.length) P.unit = 0;
  const unitWord = d.format === 'stage' && !d.blocks.some(b => b.t === 'scene') ? 'Act' : 'Scene';
  if (P.sec !== 'sheets' && !(d.format === 'stage' && CUE_TYPES[P.sec])) P.sec = 'sheets';
  const cues = d.format === 'stage' ? cueList(d) : [];
  const nav = `
    <div class="pv-nav-h">Breakdown</div>
    ${units.map((u, i) => `<button class="pv-u ${P.sec === 'sheets' && P.unit === i ? 'on' : ''}" data-unit="${i}"><span class="n">${u.num || '–'}</span><span class="tx">${escHTML(u.heading)}</span></button>`).join('')}
    ${d.format === 'stage' ? `<div class="pv-nav-h">Cue sheets</div>` + Object.entries(CUE_TYPES).map(([t, label]) => {
      const n = cues.filter(c => c.type === t).length;
      return `<button class="pv-u ${P.sec === t ? 'on' : ''}" data-sec="${t}"><span class="tx">${label}</span><span class="n">${n || ''}</span></button>`;
    }).join('') : ''}`;
  const main = CUE_TYPES[P.sec] ? cuesHTML(d, P.sec) : sheetHTML(d, units, P.unit, unitWord);
  $('#sv-prod').innerHTML = nav;
  view.innerHTML = `<div class="pv"><div class="pv-main">
    <div class="pv-bar"><span class="hint">Tag words in the script: select them, right click › Tag for production. Export from the Export menu.</span></div>
    ${main}</div></div>`;
}
function sheetHTML(d, units, ui, unitWord) {
  const u = units[ui], cats = bdCats(d), { box, words } = unitData(d, u);
  const lines = blockLines(d), L = pageGeom(d).lines;
  const ul = lines.slice(u.start, u.end).reduce((a, b) => a + b, 0);
  const pages = (S.domPages && S.domPages.pageOf) || [];
  const p0 = pages[u.start] || 1, p1 = pages[Math.max(u.start, u.end - 1)] || p0;
  const desc = d.notes[u.id] || '';
  const hd = bdStore(d)['h:' + u.id] || {};
  const field = (label, val, key) => `<div class="bs-f"><label>${label}</label>${key ? `<input data-bdh="${key}" value="${escHTML(hd[key] != null ? hd[key] : val)}">` : `<div>${escHTML(val || '—')}</div>`}</div>`;
  let head;
  if (d.format === 'stage') {
    const mins = words / 110;
    head = `<div class="bs-head">
      ${field('Production Title', d.title)}${field('Production Company', d.meta.company || '', 'company')}
      ${field('Act #', u.act ? String(u.act) : '—')}${field(unitWord + ' #', u.num ? String(u.num) : '—')}${field(unitWord + ' Name', u.heading)}
      ${field('Setting', '', 'setting')}${field('Time', '', 'time')}
      ${field('Page Count', eighths(ul, L))}${field('Est. Running Time', mins < 1 ? '< 1 min' : '~' + Math.round(mins) + ' min')}${field('Pages', p0 === p1 ? String(p0) : p0 + '–' + p1)}
    </div>`;
  } else {
    const h = headingParts(d.blocks[u.start] && d.blocks[u.start].t === 'scene' ? d.blocks[u.start].text : '');
    head = `<div class="bs-head">
      ${field('Production Title', d.title)}${field('Production Company', d.meta.company || '', 'company')}
      ${field('Scene #', u.num ? String(u.num) : '—')}${field('Scene Name', h.name || u.heading)}
      ${field('INT/EXT', h.ie)}${field('DAY/NIGHT', h.time)}
      ${field('Page Count', eighths(ul, L))}${field('Pages', p0 === p1 ? String(p0) : p0 + '–' + p1)}
    </div>`;
  }
  const boxes = Object.entries(cats).map(([k, c]) => {
    const items = [...box[k].values()];
    return `<div class="bs-box" style="--cc:${c.color}"><div class="bs-bh">${c.label}</div>
      <ul>${items.map(e => `<li class="${e.from}"><span ${e.bi != null ? `data-gob="${e.bi}" title="Show in the script"` : ''}>${escHTML(e.name)}</span>${e.count > 1 ? `<em>×${e.count}</em>` : ''}${e.from === 'manual' ? `<button class="x" data-rm="${k}" data-name="${escHTML(e.name)}" title="Remove">×</button>` : ''}</li>`).join('')}</ul>
      <input class="bs-add" data-add="${k}" placeholder="+ add"></div>`;
  }).join('');
  return `<div class="bs">
    <div class="bs-top"><button class="ib sm" data-step="-1" ${ui ? '' : 'disabled'} title="Previous">${icon('left')}</button>
      <div class="bs-title">Breakdown Sheet</div><button class="ib sm" data-step="1" ${ui < units.length - 1 ? '' : 'disabled'} title="Next">${icon('right')}</button></div>
    ${head}
    <div class="bs-f bs-desc"><label>Description</label><textarea data-desc="${u.id}" rows="2" placeholder="One line: what happens in this ${unitWord.toLowerCase()}">${escHTML(desc)}</textarea></div>
    <div class="bs-grid">${boxes}</div>
  </div>`;
}
const CUE_TYPES = { LX: 'Lighting (LX)', SQ: 'Sound & music (SQ)', FX: 'Effects (FX)', SC: 'Set changes (SC)' };
function cueList(d) {
  const cats = prodCats(d), pages = (S.domPages && S.domPages.pageOf) || paginate(d).blockPage;
  const n = {}, out = [], notes = d.cuenotes || {};
  for (const t of tagsIn(d)) {
    const c = cats[t.cat]; if (!c || !c.cue) continue;
    n[c.cue] = (n[c.cue] || 0) + 1;
    // on a line of dialogue the cue goes with who says it
    const b = d.blocks[t.bi];
    let who = '';
    if (b.t === 'dialogue' || b.t === 'paren') { for (let j = t.bi - 1; j >= 0; j--) if (d.blocks[j].t === 'character') { who = greekCaps(cleanCharName(d.blocks[j].text)); break; } }
    const key = b.id + ':' + t.key;
    out.push({ no: c.cue + ' ' + n[c.cue], type: c.cue, page: pages[t.bi] || 1, desc: who ? `${who}: «${t.text}»` : t.text, note: notes[key] || '', key, bi: t.bi });
  }
  return out;
}
function cuesHTML(d, type) {
  const cues = cueList(d).filter(c => c.type === type);
  return `<div class="bs"><div class="bs-top"><div class="bs-title">Cue Sheet · ${CUE_TYPES[type]}</div></div>
    ${cues.length ? `<table class="cue-t"><tr><th style="width:70px">Cue</th><th style="width:50px">Page</th><th>Description</th><th style="width:34%">Notes</th></tr>
      ${cues.map(c => `<tr><td data-gob="${c.bi}"><b>${c.no}</b></td><td data-gob="${c.bi}">${c.page}</td><td data-gob="${c.bi}">${escHTML(c.desc)}</td><td><input class="cue-n" data-cuenote="${escHTML(c.key)}" value="${escHTML(c.note)}" placeholder="e.g. fade 5″"></td></tr>`).join('')}</table>`
    : `<p class="hint">Nothing yet. In the play, select the words where it happens and right click › Tag for production › ${prodCats(d)[Object.keys(prodCats(d)).find(k => prodCats(d)[k].cue === type)].label}.</p>`}</div>`;
}

$('#sv-prod').addEventListener('click', e => {
  const t = e.target;
  const u = t.closest('[data-unit]'); if (u) { S.prod = { sec: 'sheets', unit: +u.dataset.unit }; renderProd(); }
  const sc = t.closest('[data-sec]'); if (sc) { S.prod.sec = sc.dataset.sec; renderProd(); }
  if ((u || sc) && innerWidth < 1000) $('#side').classList.remove('open');
});
$('#prodview').addEventListener('click', e => {
  const t = e.target;
  if (t.closest('.cue-n')) return;
  const st = t.closest('[data-step]'); if (st) { S.prod.unit += +st.dataset.step; renderProd(); return; }
  const rm = t.closest('[data-rm]');
  if (rm) { const units = prodUnits(S.doc), id = units[S.prod.unit].id, m = bdStore(S.doc)[id] || {}; m[rm.dataset.rm] = (m[rm.dataset.rm] || []).filter(x => x !== rm.dataset.name); bdStore(S.doc)[id] = m; metaChanged(); renderProd(); return; }
  const go = t.closest('[data-gob]'); if (go) { goToBlock(+go.dataset.gob); return; }
});
$('#prodview').addEventListener('keydown', e => {
  const k = e.target.dataset.add;
  if (k && e.key === 'Enter' && e.target.value.trim()) {
    e.preventDefault();
    const units = prodUnits(S.doc), id = units[S.prod.unit].id, m = bdStore(S.doc)[id] = bdStore(S.doc)[id] || {};
    (m[k] = m[k] || []).push(e.target.value.trim());
    metaChanged(); renderProd();
    const inp = $(`#prodview [data-add="${k}"]`); if (inp) inp.focus();
  }
});
$('#prodview').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.desc) { S.doc.notes[t.dataset.desc] = t.value; metaChanged(); return; }
  if (t.dataset.cuenote) { (S.doc.cuenotes = S.doc.cuenotes || {})[t.dataset.cuenote] = t.value; metaChanged(); return; }
  const hk = t.dataset.bdh;
  if (hk) {
    if (hk === 'company') { S.doc.meta.company = t.value; }
    else { const units = prodUnits(S.doc), key = 'h:' + units[S.prod.unit].id; const h = bdStore(S.doc)[key] = bdStore(S.doc)[key] || {}; h[hk] = t.value; }
    metaChanged();
  }
});

/* ---------- export ---------- */
function cuePrintHTML(d, type) {
  const p = PAPER[d.settings.paper] || PAPER.A4, cues = cueList(d).filter(c => c.type === type);
  return `<style>@page{size:${p.w}in ${p.h}in;margin:0}</style><div class="ppage bdp" style="width:${p.w}in;min-height:${p.h}in;height:auto">
    <div class="bd-t">CUE SHEET · ${CUE_TYPES[type].toUpperCase()}</div><div class="bd-sub">${escHTML(d.title)}</div>
    <table class="bd-l"><tr><th style="width:12%">Cue</th><th style="width:8%">Page</th><th>Description</th><th style="width:32%">Notes</th></tr>
    ${cues.map(c => `<tr><td><b>${c.no}</b></td><td>${c.page}</td><td>${escHTML(c.desc)}</td><td>${escHTML(c.note)}</td></tr>`).join('')}</table></div>`;
}
function prodPrintHTML(d) {
  const units = prodUnits(d), cats = bdCats(d), p = PAPER[d.settings.paper] || PAPER.A4;
  const lines = blockLines(d), L = pageGeom(d).lines;
  const pages = (S.domPages && S.domPages.pageOf) || paginate(d).blockPage;
  const unitWord = d.format === 'stage' && !d.blocks.some(b => b.t === 'scene') ? 'Act' : 'Scene';
  const pg = (inner) => `<div class="ppage bdp" style="width:${p.w}in;height:${p.h}in">${inner}</div>`;
  const cell = (l, v) => `<td><div class="l">${l}</div><div class="v">${escHTML(v || '')}</div></td>`;
  let html = `<style>@page{size:${p.w}in ${p.h}in;margin:0}</style>`;
  units.forEach(u => {
    const { box, words } = unitData(d, u);
    const ul = lines.slice(u.start, u.end).reduce((a, b) => a + b, 0);
    const p0 = pages[u.start] || 1, p1 = pages[Math.max(u.start, u.end - 1)] || p0;
    const hd = bdStore(d)['h:' + u.id] || {};
    let head;
    if (d.format === 'stage') {
      const mins = words / 110;
      head = `<tr>${cell('Production Title', d.title)}${cell('Production Company', d.meta.company)}${cell('Act #', u.act ? u.act : '')}${cell(unitWord + ' #', u.num || '')}</tr>
        <tr>${cell(unitWord + ' Name', u.heading)}${cell('Setting', hd.setting)}${cell('Time', hd.time)}${cell('Page Count / Est. Running Time', eighths(ul, L) + '  ·  ' + (mins < 1 ? '< 1 min' : '~' + Math.round(mins) + ' min'))}</tr>`;
    } else {
      const h = headingParts(d.blocks[u.start] && d.blocks[u.start].t === 'scene' ? d.blocks[u.start].text : '');
      head = `<tr>${cell('Production Title', d.title)}${cell('Production Company', d.meta.company)}${cell('Scene #', u.num || '')}${cell('Page Count', eighths(ul, L))}</tr>
        <tr>${cell('Scene Name', h.name || u.heading)}${cell('INT/EXT', h.ie)}${cell('DAY/NIGHT', h.time)}${cell('Pages', p0 === p1 ? p0 : p0 + '–' + p1)}</tr>`;
    }
    const keys = Object.keys(cats);
    let grid = '';
    for (let r = 0; r * 3 < keys.length; r++) {
      grid += '<tr>' + keys.slice(r * 3, r * 3 + 3).map(k => `<td class="box"><div class="bh" style="background:${cats[k].color}">${cats[k].label}</div>${[...box[k].values()].map(e => `<div>${escHTML(e.name)}${e.count > 1 ? ` (×${e.count})` : ''}</div>`).join('')}</td>`).join('') + '</tr>';
    }
    html += pg(`<div class="bd-t">${d.format === 'stage' ? 'STAGE BREAKDOWN SHEET' : 'BREAKDOWN SHEET'}</div>
      <table class="bd-h">${head}<tr><td colspan="4"><div class="l">Description</div><div class="v">${escHTML(d.notes[u.id] || '')}</div></td></tr></table>
      <table class="bd-g">${grid}</table>`);
  });
  return html;
}
function xlsx(sheets) {      // sheets: [{name, rows:[[...]]}]  first row bold
  const x = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4E4E7"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>` }
  ];
  sheets.forEach((s, i) => {
    const widths = s.rows[0].map((_, c) => Math.min(60, Math.max(8, ...s.rows.map(r => String(r[c] == null ? '' : r[c]).length)) + 2));
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"${ri ? '' : ' s="1"'}><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr" s="${ri ? 2 : 1}"><is><t xml:space="preserve">${x(v)}</t></is></c>`).join('')}</row>`).join('');
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData></worksheet>` });
  });
  return Zip.write(files);
}
function cueExportDialog() {
  const cues = cueList(S.doc);
  const types = Object.entries(CUE_TYPES).map(([t, label]) => ({ t, label, n: cues.filter(c => c.type === t).length }));
  const first = (types.find(x => x.t === S.prod.sec && x.n) || types.find(x => x.n) || {}).t;
  showModal(`<h2>Cue sheet</h2>
    <div class="form exp-list">${types.map(x => `<label class="chk${x.n ? '' : ' off'}"><input type="radio" name="cue" value="${x.t}" ${x.t === first ? 'checked' : ''} ${x.n ? '' : 'disabled'}> ${x.label} <span class="hint">— ${x.n ? x.n + ' cue' + (x.n > 1 ? 's' : '') : 'empty'}</span></label>`).join('')}</div>
    <div class="modal-actions"><button class="btn" data-x="no">Cancel</button><button class="btn" data-x="xlsx" ${first ? '' : 'disabled'}>Excel</button><button class="btn dark" data-x="pdf" ${first ? '' : 'disabled'}>PDF</button></div>`, box => {
    box.onclick = e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      const t = (box.querySelector('input[name=cue]:checked') || {}).value;
      closeModal();
      if ((x === 'pdf' || x === 'xlsx') && t) exportProd(x, t);
    };
  });
}
async function exportProd(kind, type) {
  if (S.view === 'text') syncFromDOM();
  const d = S.doc; type = type && CUE_TYPES[type] ? type : null;
  const name = safeName(d.title) + (type ? ' - Cue sheet ' + type : ' - Breakdown');
  if (kind === 'pdf') {
    if (document.fonts) await document.fonts.ready;
    $('#print').innerHTML = type ? cuePrintHTML(d, type) : prodPrintHTML(d);
    if (Store.native) { const p = await Native.printPDF({ name: name + '.pdf', paper: d.settings.paper }); if (p) toast('Saved: ' + p, 4000); }
    else { const old = document.title; document.title = name; setTimeout(() => { window.print(); document.title = old; }, 60); }
    return;
  }
  if (type) {
    const rows = [['Cue', 'Page', 'Description', 'Notes'], ...cueList(d).filter(c => c.type === type).map(c => [c.no, c.page, c.desc, c.note])];
    return deliver(name + '.xlsx', xlsx([{ name: 'Cue sheet ' + type, rows }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
  }
  const units = prodUnits(d), cats = bdCats(d), keys = Object.keys(cats);
  const lines = blockLines(d), L = pageGeom(d).lines;
  const stage = d.format === 'stage';
  const head = stage ? ['Act #', '#', 'Name', 'Setting', 'Time', 'Page count', 'Description', ...keys.map(k => cats[k].label)]
    : ['#', 'Scene name', 'INT/EXT', 'DAY/NIGHT', 'Page count', 'Description', ...keys.map(k => cats[k].label)];
  const rows = [head];
  for (const u of units) {
    const { box } = unitData(d, u);
    const ul = lines.slice(u.start, u.end).reduce((a, b) => a + b, 0);
    const items = keys.map(k => [...box[k].values()].map(e => e.name + (e.count > 1 ? ` (×${e.count})` : '')).join('\n'));
    const hd = bdStore(d)['h:' + u.id] || {};
    if (stage) rows.push([u.act || '', u.num || '', u.heading, hd.setting || '', hd.time || '', eighths(ul, L), d.notes[u.id] || '', ...items]);
    else { const h = headingParts(d.blocks[u.start] && d.blocks[u.start].t === 'scene' ? d.blocks[u.start].text : ''); rows.push([u.num || '', h.name || u.heading, h.ie, h.time, eighths(ul, L), d.notes[u.id] || '', ...items]); }
  }
  deliver(name + '.xlsx', xlsx([{ name: 'Breakdown', rows }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
}

/* ---------- Cue script: the play with one department's marks, and everything about each cue beside it ---------- */
const CUE_SCRIPT_NAME = { LX: 'Lighting script', SQ: 'Sound script', FX: 'Effects script', SC: 'Set changes script' };
function cueScriptOptions(d) {
  const cats = prodCats(d), counts = {};
  for (const t of tagsIn(d)) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const notes = (d.comments || []).length;
  const opts = Object.entries(cats).filter(([k]) => counts[k]).map(([k, c]) => ({ k, label: c.label, n: counts[k] }));
  return { opts, total: Object.values(counts).reduce((a, b) => a + b, 0), notes };
}
function cueScript(d, choice, withNotes) {
  const cats = prodCats(d);
  const want = (k) => choice === 'all' || choice === k;
  const marks = {}, colors = {}, cueNo = {}, cn = d.cuenotes || {};
  for (const [k, c] of Object.entries(cats)) if (want(k)) colors[k] = c.color;
  d.blocks.forEach((b) => {
    const runs = runsOf(b); let off = 0, prevG = null, prevC = null, acc = null;
    const flush = () => {
      if (!acc) return;
      const c = cats[acc.cat];
      if (c && want(acc.cat)) {
        let label, note = '';
        if (c.cue) { cueNo[c.cue] = (cueNo[c.cue] || 0) + 1; label = c.cue + ' ' + cueNo[c.cue]; note = cn[b.id + ':' + normName(acc.text)] || ''; }
        else label = c.label;
        (marks[b.id] = marks[b.id] || []).push({ off: acc.off, kind: 'tag', cat: acc.cat, color: c.color, label, note, text: acc.text.trim() });
      } else if (c && c.cue) { cueNo[c.cue] = (cueNo[c.cue] || 0) + 1; }      // keep numbers the same as the cue sheets
      acc = null;
    };
    for (const r of runs) {
      if (r.g && r.g === prevG && acc) acc.text += r.t;
      else { flush(); if (r.g) acc = { cat: r.g, off, text: r.t }; }
      if (withNotes && r.c && r.c !== prevC) {
        const cm = (d.comments || []).find(x => x.id === r.c);
        if (cm && cm.text) (marks[b.id] = marks[b.id] || []).push({ off, kind: 'note', color: '#facc15', label: 'Note', note: cm.text });
      }
      prevG = r.g || null; prevC = r.c || null; off += r.t.length;
    }
    flush();
  });
  const title = choice === 'all' ? 'Production script' : choice === 'none' ? 'Director’s script' : (cats[choice] && cats[choice].cue ? CUE_SCRIPT_NAME[cats[choice].cue] : (cats[choice] ? cats[choice].label + ' script' : ''));
  return { marks, colors, notes: !!withNotes, title };
}
