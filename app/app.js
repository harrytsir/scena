/* Scena — screenplay & stage play editor */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const editor = $('#editor');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const S = {
  doc: null, hist: [], ptr: -1, histTimer: null,
  saveTimer: null, refreshTimer: null, dirty: false, saveState: '',
  view: 'text', zoom: null, lastBlock: null, tabEl: null,
  ac: { open: false, items: [], sel: -1, el: null },
  find: { matches: [], cur: -1 }, pg: null
};
const F = () => FORMATS[S.doc.format];
const spec = (t) => typeSpec(S.doc.format, t);

/* ---------- icons ---------- */
const IC = {
  back: '<path d="M15 18l-6-6 6-6"/>', sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', tab: '<path d="M3 12h13M12 7l5 5-5 5M21 5v14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>', redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;
function paintIcons(root = document) { $$('i[data-ic]', root).forEach(i => { if (!i.firstChild) i.innerHTML = icon(i.dataset.ic); }); }

/* ---------- helpers ---------- */
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today, ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function foldStr(s) { return [...(s || '')].map(foldChar).join(''); }
function cleanText(s) { return (s || '').replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' '); }
function safeName(s) { return (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Untitled'; }

function showModal(html, bind) {
  $('#modal-box').innerHTML = html; paintIcons($('#modal-box'));
  $('#modal').classList.remove('hidden');
  if (bind) bind($('#modal-box'));
  const f = $('#modal-box [autofocus]'); if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }
function confirmModal(text, ok = 'OK', danger = false) {
  return new Promise(res => {
    showModal(`<p style="margin:0">${escHTML(text)}</p><div class="modal-actions"><button class="btn" data-x="no">Cancel</button><button class="btn ${danger ? 'danger' : 'dark'}" data-x="yes">${escHTML(ok)}</button></div>`, box => {
      box.onclick = e => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) { closeModal(); res(x === 'yes'); } };
    });
  });
}
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });

/* ---------- popovers ---------- */
let popClose = null;
function openPop(anchor, html, onPick, { align = 'left', keepFocus = false } = {}) {
  const p = $('#pop');
  if (!p.classList.contains('hidden') && p._anchor === anchor) { closePop(); return; }
  p.innerHTML = html; p._anchor = anchor;
  p.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight;
  let left = align === 'right' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.onpointerdown = (e) => { if (keepFocus) e.preventDefault(); };
  p.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; closePop(); onPick(b.dataset.v); };
  popClose = (e) => { if (!p.contains(e.target) && !anchor.contains(e.target)) closePop(); };
  setTimeout(() => document.addEventListener('pointerdown', popClose, true), 0);
}
function closePop() {
  $('#pop').classList.add('hidden'); $('#pop')._anchor = null;
  if (popClose) document.removeEventListener('pointerdown', popClose, true); popClose = null;
}
const mi = (v, label, k = '', on = false) => `<button class="mi${on ? ' on' : ''}" data-v="${v}"><span>${label}</span>${k ? `<span class="k">${k}</span>` : ''}</button>`;

/* ================= DOCUMENT ================= */
function makeDoc(format) {
  const prefs = loadPrefs();
  return {
    id: uid(), app: 'scena', version: 2, title: 'Untitled', format,
    created: Date.now(), updated: Date.now(),
    meta: { subtitle: '', credit: 'Written by', author: prefs.author || '', source: '', contact: prefs.contact || '', draft: '', cast: '' },
    settings: { paper: prefs.paper || 'A4', font: prefs.font || 'courier', sceneNumbers: false, titlePage: true },
    blocks: [{ id: uid(), t: 'scene', text: '' }],
    notes: {}
  };
}
function normalizeDoc(d) {
  d.format = FORMATS[d.format] ? d.format : 'screen';
  d.meta = Object.assign({ subtitle: '', credit: '', author: '', source: '', contact: '', draft: '', cast: '' }, d.meta || {});
  d.settings = Object.assign({ paper: 'A4', font: 'courier', sceneNumbers: false, titlePage: true }, d.settings || {});
  d.notes = d.notes || {};
  const T = FORMATS[d.format].types;
  d.blocks = (d.blocks || []).map(b => {
    const nb = { id: b.id || uid(), t: T[b.t] ? b.t : FORMATS[d.format].def, text: cleanText(b.text) };
    if (Array.isArray(b.runs) && b.runs.length) setBlockRuns(nb, b.runs.map(r => ({ ...r, t: cleanText(r.t) })));
    return nb;
  });
  if (!d.blocks.length) d.blocks.push({ id: uid(), t: FORMATS[d.format].def, text: '' });
  return d;
}
function loadPrefs() { try { return JSON.parse(localStorage.getItem('scena:prefs') || '{}'); } catch (e) { return {}; } }
function savePrefs(p) { localStorage.setItem('scena:prefs', JSON.stringify(Object.assign(loadPrefs(), p))); }

/* ================= LIBRARY ================= */
async function showLibrary() {
  if (S.doc) await saveNow();
  S.doc = null; closeAC(); closePop();
  $('#workspace').classList.add('hidden');
  $('#library').classList.remove('hidden');
  document.title = 'Scena';
  renderLibrary();
}
async function renderLibrary() {
  const q = foldStr($('#lib-search').value.trim());
  let list = await Store.list();
  list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (q) list = list.filter(d => foldStr(d.title).includes(q) || foldStr(d.author || '').includes(q));
  const g = $('#lib-grid');
  if (!list.length) {
    g.innerHTML = `<div class="lib-empty">${q ? 'No projects found.' : 'No projects yet.<br>Create a <b>new project</b> or <b>import</b> a PDF, Word, Final Draft or Fountain file.'}</div>`;
    return;
  }
  g.innerHTML = list.map(d => `
    <div class="cover-card" data-id="${d.id}">
      <div class="cover" style="font-family:${(FONTS[d.font] || FONTS.courier).css.replace(/"/g, "'")}">
        <div class="ct">${escHTML(greekCaps(d.title || 'Untitled'))}</div>
        ${d.subtitle ? `<div class="cs">${escHTML(d.subtitle)}</div>` : ''}
        ${d.credit ? `<div class="cc">${escHTML(d.credit)}</div>` : ''}
        ${d.author ? `<div class="ca">${escHTML(d.author)}</div>` : ''}
      </div>
      <button class="ib sm cc-more" data-lib="menu" title="Options">${icon('more')}</button>
      <div class="cc-meta">
        <div class="cc-title">${escHTML(d.title || 'Untitled')}</div>
        <div class="cc-sub">${d.format === 'stage' ? 'Stage Play' : 'Screenplay'} · ${d.pages || 0} pp · ${fmtDate(d.updated)}</div>
      </div>
    </div>`).join('');
}
$('#lib-search').addEventListener('input', renderLibrary);
$('#lib-grid').addEventListener('click', async e => {
  const card = e.target.closest('.cover-card'); if (!card) return;
  const id = card.dataset.id;
  const m = e.target.closest('[data-lib="menu"]');
  if (m) {
    e.stopPropagation();
    openPop(m, mi('open', 'Open') + mi('dup', 'Duplicate') + mi('file', 'Save as .scena file') + '<hr>' + mi('del', 'Delete…'), async v => {
      const d = await Store.load(id); if (!d) return;
      if (v === 'open') openDoc(id);
      if (v === 'dup') { d.id = uid(); d.title = (d.title || '') + ' (copy)'; d.created = d.updated = Date.now(); await Store.save(d); renderLibrary(); }
      if (v === 'file') deliver(safeName(d.title) + '.scena', JSON.stringify(d, null, 1), 'application/json', 'scena');
      if (v === 'del' && await confirmModal(`Delete “${d.title || 'Untitled'}”? This can’t be undone.`, 'Delete', true)) { await Store.remove(id); renderLibrary(); }
    }, { align: 'right' });
    return;
  }
  openDoc(id);
});
function newDialog() {
  showModal(`<h2>New project</h2>
    <div class="new-grid">
      <button class="new-card" data-x="screen"><div class="np">EXT. ROOFTOP - NIGHT\n\nRain hammers the city.\n\n           ELENI\n     I can hear you.</div><span class="nt">Screenplay</span><span class="nd">Film, short film or TV. Scene headings, action, dialogue.</span></button>
      <button class="new-card" data-x="stage"><div class="np">              ACT ONE\n\n             SCENE 1\n\n        A living room. Evening.\n\n            KATERINA\nPlease, close the curtains!</div><span class="nt">Stage Play</span><span class="nd">Theatre. Acts, scenes, stage directions, dialogue.</span></button>
    </div>
    <div class="modal-actions"><button class="btn" data-x="no">Cancel</button></div>`, box => {
    box.onclick = e => { const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; closeModal(); if (x !== 'no') newDoc(x); };
  });
}
async function openDoc(id) {
  const d = await Store.load(id);
  if (!d) { toast('Project not found.'); return; }
  loadIntoWorkspace(normalizeDoc(d));
}
async function newDoc(format) {
  const d = makeDoc(format);
  if (format === 'stage') d.blocks = [{ id: uid(), t: 'act', text: '' }];
  await Store.save(Object.assign(d, { stats: { pages: 1, scenes: 0 } }));
  loadIntoWorkspace(d);
  $('#doc-title').select(); $('#doc-title').focus();
}
function loadIntoWorkspace(d) {
  S.doc = d; S.hist = []; S.ptr = -1; S.lastBlock = null;
  $('#library').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  $('#doc-title').value = d.title || '';
  document.body.dataset.format = d.format;
  document.title = (d.title || 'Untitled') + ' — Scena';
  applyFont();
  setView('text');
  renderEditor();
  commitNow(true);
  applyZoom();
  refreshNow();
  setCaret(editor.children[0], 0);
  editor.focus();
  updateToolbar();
}
function applyFont() {
  const f = fontOf(S.doc);
  document.documentElement.style.setProperty('--script-font', f.css);
}

/* ================= EDITOR DOM ================= */
function setRuns(el, runs) {
  const html = runsHTML(normRuns(runs));
  if (html) el.innerHTML = html; else el.innerHTML = '<br>';
}
function setText(el, text) { setRuns(el, plainRuns(text)); }
function makeBlockEl(b) {
  const el = document.createElement('div');
  el.className = 'b t-' + b.t;
  el.dataset.t = b.t;
  el.dataset.id = b.id || (b.id = uid());
  setRuns(el, runsOf(b));
  return el;
}
function renderEditor() {
  const frag = document.createDocumentFragment();
  for (const b of S.doc.blocks) frag.appendChild(makeBlockEl(b));
  editor.innerHTML = ''; editor.appendChild(frag);
}
function domToRuns(el) {
  const out = [];
  const walk = (n, st) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (c.textContent) out.push({ t: cleanText(c.textContent), ...st }); continue; }
      if (c.nodeType !== 1 || c.nodeName === 'BR') continue;
      const s = { ...st };
      const tag = c.nodeName;
      if (tag === 'B' || tag === 'STRONG') s.b = 1;
      if (tag === 'I' || tag === 'EM') s.i = 1;
      if (tag === 'U') s.u = 1;
      if (c.style) {
        const fw = c.style.fontWeight; if (fw === 'bold' || +fw >= 600) s.b = 1; else if (fw === 'normal' || (fw && +fw < 600)) delete s.b;
        if (c.style.fontStyle === 'italic') s.i = 1; else if (c.style.fontStyle === 'normal') delete s.i;
        if (/underline/.test(c.style.textDecoration || c.style.textDecorationLine || '')) s.u = 1;
      }
      walk(c, s);
    }
  };
  walk(el, {});
  return normRuns(out);
}
const CLEAN_OK = new Set(['B', 'I', 'U', 'BR']);
function isClean(el) {
  const kids = el.childNodes;
  for (const n of kids) {
    if (n.nodeType === 3) continue;
    if (n.nodeType !== 1 || !CLEAN_OK.has(n.nodeName) || n.attributes.length) return false;
    if (n.nodeName === 'BR' && kids.length > 1) return false;
    if (n.nodeName !== 'BR' && !isClean(n)) return false;
  }
  return true;
}
function blockOf(node) {
  while (node && node !== editor) {
    if (node.nodeType === 1 && node.classList && node.classList.contains('b')) return node;
    node = node.parentNode;
  }
  return null;
}
function caretInfo() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  let el = blockOf(r.startContainer);
  if (!el) {
    if (r.startContainer === editor && editor.children.length) {
      el = editor.children[Math.min(r.startOffset, editor.children.length - 1)];
      return { el, off: 0, collapsed: r.collapsed, range: r };
    }
    return null;
  }
  const pre = document.createRange();
  pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  return { el, off: pre.toString().length, collapsed: r.collapsed, range: r };
}
function pointAt(el, off) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off, last = null;
  while ((n = w.nextNode())) { last = n; if (left <= n.length) return [n, left]; left -= n.length; }
  if (last) return [last, last.length];
  return [el, 0];
}
function setCaret(el, off) {
  if (!el) return;
  const [n, o] = pointAt(el, off);
  const r = document.createRange(); r.setStart(n, o); r.collapse(true);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function selectRangeIn(el, a, b) {
  const [n1, o1] = pointAt(el, a), [n2, o2] = pointAt(el, b);
  const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function scrollToCaret(el) {
  if (!el) return;
  const r = el.getBoundingClientRect(), sc = $('#scroller').getBoundingClientRect();
  if (r.bottom > sc.bottom - 50 || r.top < sc.top + 30) el.scrollIntoView({ block: 'center' });
}
const blockIndex = (el) => Array.prototype.indexOf.call(editor.children, el);
const elText = (el) => cleanText(el.textContent);

function syncFromDOM() {
  if (!S.doc) return;
  const ci = caretInfo();
  for (const node of [...editor.childNodes]) {
    if (node.nodeType === 3) {
      if (!node.textContent.trim()) { node.remove(); continue; }
      editor.replaceChild(makeBlockEl({ t: F().def, text: cleanText(node.textContent) }), node); continue;
    }
    if (node.nodeType !== 1) { node.remove(); continue; }
    if (!node.classList.contains('b') || !node.dataset.t) {
      if (node.nodeName === 'BR') { node.remove(); continue; }
      editor.replaceChild(makeBlockEl({ t: F().def, text: cleanText(node.textContent) }), node);
    }
  }
  const seen = new Set();
  for (const el of editor.children) {
    if (seen.has(el.dataset.id)) el.dataset.id = uid();
    seen.add(el.dataset.id);
    if (!isClean(el)) {
      const here = ci && ci.el === el;
      setRuns(el, domToRuns(el));
      if (here) setCaret(el, ci.off);
    } else if (!el.childNodes.length) el.innerHTML = '<br>';
  }
  if (!editor.children.length) editor.appendChild(makeBlockEl({ t: F().order[0], text: '' }));
  S.doc.blocks = [...editor.children].map(el => setBlockRuns({ id: el.dataset.id, t: el.dataset.t }, domToRuns(el)));
}

/* ================= HISTORY ================= */
function snapshot() {
  const ci = caretInfo();
  return { blocks: JSON.stringify(S.doc.blocks), caret: ci ? { i: blockIndex(ci.el), off: ci.off } : { i: 0, off: 0 } };
}
function commitNow(reset) {
  clearTimeout(S.histTimer); S.histTimer = null;
  if (!reset) syncFromDOM();
  const snap = snapshot();
  if (!reset && S.ptr >= 0 && S.hist[S.ptr].blocks === snap.blocks) { S.hist[S.ptr].caret = snap.caret; return; }
  S.hist = S.hist.slice(0, S.ptr + 1); S.hist.push(snap);
  if (S.hist.length > 400) S.hist.shift();
  S.ptr = S.hist.length - 1;
}
function commitSoon() { clearTimeout(S.histTimer); S.histTimer = setTimeout(() => commitNow(), 700); }
function restore(snap) {
  S.doc.blocks = JSON.parse(snap.blocks);
  renderEditor();
  const el = editor.children[Math.min(snap.caret.i, editor.children.length - 1)];
  setCaret(el, Math.min(snap.caret.off, elText(el).length));
  scrollToCaret(el);
  docChanged(false);
}
function undo() {
  if (S.view !== 'text') return;
  if (S.histTimer) commitNow(); else syncFromDOM();
  if (JSON.stringify(S.doc.blocks) !== S.hist[S.ptr].blocks) commitNow();
  if (S.ptr <= 0) return;
  S.ptr--; restore(S.hist[S.ptr]);
}
function redo() {
  if (S.view !== 'text' || S.ptr >= S.hist.length - 1) return;
  S.ptr++; restore(S.hist[S.ptr]);
}

/* ================= SAVE ================= */
function docChanged(history = true) {
  S.dirty = true; setSaveState('saving');
  if (history) commitSoon();
  clearTimeout(S.saveTimer); S.saveTimer = setTimeout(saveNow, 800);
  clearTimeout(S.refreshTimer); S.refreshTimer = setTimeout(refreshNow, 250);
}
function metaChanged() {
  S.dirty = true; setSaveState('saving');
  clearTimeout(S.saveTimer); S.saveTimer = setTimeout(saveNow, 800);
}
async function saveNow() {
  clearTimeout(S.saveTimer);
  if (!S.doc) return;
  if (S.view === 'text') syncFromDOM();
  if (!S.dirty) return;
  S.doc.updated = Date.now();
  S.doc.stats = { pages: (S.pg || paginate(S.doc)).pages.length, scenes: S.doc.blocks.filter(b => b.t === 'scene').length };
  try { await Store.save(S.doc); S.dirty = false; setSaveState('saved'); }
  catch (e) { console.error(e); setSaveState('error'); toast('Could not save: ' + e.message, 5000); }
}
function setSaveState(s) {
  S.saveState = s;
  $('#savestate').innerHTML = s === 'saved' ? '<span class="saved-ok">Saved</span>' : s === 'error' ? '<span class="saved-err">Not saved</span>' : s === 'saving' ? 'Saving…' : '';
}
window.addEventListener('beforeunload', () => {
  if (S.doc && S.dirty) { try { if (S.view === 'text') syncFromDOM(); S.doc.updated = Date.now(); Store.saveSync(S.doc); } catch (e) {} }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ================= ELEMENT TYPES ================= */
function finalizeBlock(el) {
  if (!el || !el.isConnected || !S.doc) return false;
  const t = el.dataset.t, sp = spec(t);
  const runs = domToRuns(el);
  let nr = runs;
  if (sp.upper) nr = mapRunsText(runs, greekCaps);
  const txt = nr.map(r => r.t).join('').trim();
  if (t === 'paren' && txt && !txt.startsWith('(')) nr = [{ t: '(' }, ...nr, { t: ')' }];
  if (JSON.stringify(normRuns(nr)) !== JSON.stringify(runs)) { setRuns(el, nr); return true; }
  return false;
}
function setType(el, t) {
  if (!el || !F().types[t]) return;
  const ci = caretInfo();
  const here = ci && ci.el === el;
  let off = here ? ci.off : 0;
  let runs = domToRuns(el);
  const text = runs.map(r => r.t).join('');
  if (el.dataset.t === 'paren' && t !== 'paren' && /^\(.*\)$/.test(text.trim())) {
    const a = text.indexOf('('), b = text.lastIndexOf(')');
    runs = sliceRuns(runs, a + 1, b);
    off = Math.max(0, Math.min(off - a - 1, b - a - 1));
  }
  if (t === 'paren' && !text.trim().startsWith('(')) { runs = [{ t: '(' }, ...runs, { t: ')' }]; off += 1; }
  if (spec(t).upper) runs = mapRunsText(runs, greekCaps);
  el.className = 'b t-' + t; el.dataset.t = t;
  setRuns(el, runs);
  if (here) setCaret(el, Math.min(off, elText(el).length));
  updateToolbar();
}
function changeTypeCmd(t, el) {
  const ci = caretInfo();
  el = el || (ci ? ci.el : editor.lastElementChild);
  commitNow();
  setType(el, t);
  if (!ci || ci.el !== el) setCaret(el, elText(el).length);
  if (t === 'paren' && elText(el) === '()') setCaret(el, 1);
  syncFromDOM(); commitNow(); docChanged(false);
  updateAC();
}
// Tab: on a fresh empty line pick what usually follows; otherwise cycle through the list
function tabCmd(back) {
  const ci = caretInfo(); if (!ci) return;
  const el = ci.el, t = el.dataset.t, order = F().order;
  let nt;
  if (!back && !elText(el).replace(/[()]/g, '').trim() && S.tabEl !== el) {
    const prev = el.previousElementSibling;
    nt = prev ? (F().after[prev.dataset.t] || F().def) : order[0];
    if (nt === t) nt = order[(order.indexOf(t) + 1) % order.length];
  } else {
    const i = order.indexOf(t);
    nt = order[(i + (back ? -1 : 1) + order.length) % order.length];
  }
  closeAC();
  changeTypeCmd(nt, el);
  S.tabEl = el;
}

/* ================= ENTER / BACKSPACE ================= */
function doEnter() {
  let ci = caretInfo(); if (!ci) return;
  if (!ci.collapsed) { document.execCommand('delete'); syncFromDOM(); ci = caretInfo(); if (!ci) return; }
  const el = ci.el, t = el.dataset.t;
  commitNow();
  const runs = domToRuns(el);
  const len = runs.reduce((n, r) => n + r.t.length, 0);
  const off = Math.min(ci.off, len);
  if (off === 0 && len > 0) {                      // like Word: push the line down
    el.before(makeBlockEl({ id: uid(), t, text: '' }));
    setCaret(el, 0); afterStructural(el); return;
  }
  let before = sliceRuns(runs, 0, off), after = sliceRuns(runs, off, len);
  const afterTxt = after.map(r => r.t).join('');
  if (t === 'paren' && afterTxt.trim() === ')') { before = before.concat([{ t: ')' }]); after = []; }
  setRuns(el, before);
  finalizeBlock(el);
  const nb = makeBlockEl({ id: uid(), t, text: '' });
  if (after.length) {
    let ar = after; const s = ar[0].t.replace(/^\s+/, ''); ar = [{ ...ar[0], t: s }, ...ar.slice(1)];
    setRuns(nb, spec(t).upper ? mapRunsText(ar, greekCaps) : ar);
  }
  el.after(nb);
  setCaret(nb, 0);
  afterStructural(nb);
}
function afterStructural(el) {
  syncFromDOM(); commitNow(); docChanged(false);
  scrollToCaret(el); S.lastBlock = el; S.tabEl = null;
  updateToolbar(); updateAC();
}
function doBackspaceAtStart(ci) {
  const el = ci.el, prev = el.previousElementSibling;
  if (!prev) return false;
  commitNow();
  const a = domToRuns(prev), b = domToRuns(el);
  const al = a.reduce((n, r) => n + r.t.length, 0);
  if (!b.length) { el.remove(); setCaret(prev, al); afterStructural(prev); return true; }
  if (!a.length) { prev.remove(); setCaret(el, 0); afterStructural(el); return true; }
  setRuns(prev, a.concat(b)); el.remove();
  finalizeBlock(prev); setCaret(prev, al); afterStructural(prev);
  return true;
}
function doDeleteAtEnd(ci) {
  const el = ci.el, next = el.nextElementSibling;
  if (!next) return false;
  commitNow();
  const a = domToRuns(el), b = domToRuns(next);
  const al = a.reduce((n, r) => n + r.t.length, 0);
  setRuns(el, a.concat(b)); next.remove();
  setCaret(el, al); afterStructural(el);
  return true;
}

/* ================= EDITOR EVENTS ================= */
document.execCommand('styleWithCSS', false, false);
editor.addEventListener('beforeinput', e => {
  const it = e.inputType;
  if (it === 'insertParagraph' || it === 'insertLineBreak') {
    e.preventDefault();
    if (S.ac.open && S.ac.sel >= 0) acceptAC(); else doEnter();
    return;
  }
  if (it === 'historyUndo') { e.preventDefault(); undo(); return; }
  if (it === 'historyRedo') { e.preventDefault(); redo(); return; }
  if (it === 'insertFromDrop') { e.preventDefault(); return; }
  if (it === 'insertText' && e.data === ')') {
    const ci = caretInfo();
    if (ci && ci.collapsed && ci.el.dataset.t === 'paren' && elText(ci.el)[ci.off] === ')') { e.preventDefault(); setCaret(ci.el, ci.off + 1); }
  }
});
editor.addEventListener('input', () => { syncFromDOM(); docChanged(true); updateAC(); updateToolbar(); });
editor.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (S.ac.open) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAC(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveAC(-1); return; }
    if (e.key === 'Escape') { e.preventDefault(); closeAC(true); return; }
    if (e.key === 'Enter' && S.ac.sel >= 0) { e.preventDefault(); acceptAC(); return; }
  }
  if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); tabCmd(e.shiftKey); return; }
  if (mod && !e.altKey && !e.shiftKey && /^Digit[0-9]$/.test(e.code)) {
    const k = e.code.slice(5);
    const t = Object.keys(F().types).find(x => F().types[x].key === k);
    if (t) { e.preventDefault(); changeTypeCmd(t); }
    return;
  }
  if (e.key === 'Backspace' && !mod) {
    const ci = caretInfo();
    if (ci && ci.collapsed && ci.off === 0) { if (doBackspaceAtStart(ci)) e.preventDefault(); else if (!elText(ci.el)) e.preventDefault(); }
    return;
  }
  if (e.key === 'Delete' && !mod) {
    const ci = caretInfo();
    if (ci && ci.collapsed && ci.off === elText(ci.el).length && doDeleteAtEnd(ci)) e.preventDefault();
  }
});
editor.addEventListener('paste', e => {
  e.preventDefault();
  const txt = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
  if (!txt) return;
  if (!/\n/.test(txt.trim())) { document.execCommand('insertText', false, cleanText(txt)); return; }
  let ci = caretInfo(); if (!ci) return;
  if (!ci.collapsed) { document.execCommand('delete'); syncFromDOM(); ci = caretInfo(); }
  commitNow();
  const idx = blockIndex(ci.el), cur = S.doc.blocks[idx];
  const runs = runsOf(cur), len = cur.text.length;
  const before = sliceRuns(runs, 0, ci.off), after = sliceRuns(runs, ci.off, len);
  const parsed = Formats.parseText(txt, S.doc.format).blocks;
  const repl = [];
  if (before.map(r => r.t).join('').trim()) repl.push(setBlockRuns({ id: cur.id, t: cur.t }, before));
  for (const b of parsed) repl.push({ id: uid(), t: b.t, text: b.text });
  const lastIdx = idx + repl.length - 1;
  if (after.map(r => r.t).join('').trim()) repl.push(setBlockRuns({ id: uid(), t: cur.t }, after));
  S.doc.blocks.splice(idx, 1, ...repl);
  renderEditor();
  const el = editor.children[Math.max(0, lastIdx)];
  setCaret(el, elText(el).length);
  afterStructural(el);
  toast(`Pasted ${parsed.length} elements`);
});
function selectedParts() {
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const a = blockOf(r.startContainer), b = blockOf(r.endContainer);
  if (!a || !b || a === b) return null;
  const parts = []; let el = a;
  while (el) {
    const tr = document.createRange(); tr.selectNodeContents(el);
    if (el === a) tr.setStart(r.startContainer, r.startOffset);
    if (el === b) tr.setEnd(r.endContainer, r.endOffset);
    parts.push({ t: el.dataset.t, text: cleanText(tr.toString()) });
    if (el === b) break; el = el.nextElementSibling;
  }
  return parts;
}
editor.addEventListener('copy', e => { const p = selectedParts(); if (!p) return; e.preventDefault(); e.clipboardData.setData('text/plain', Formats.blocksToPlain(p, S.doc.format)); });
editor.addEventListener('cut', e => {
  const p = selectedParts(); if (!p) return;
  e.preventDefault(); e.clipboardData.setData('text/plain', Formats.blocksToPlain(p, S.doc.format));
  commitNow(); document.execCommand('delete'); syncFromDOM(); commitNow(); docChanged(false);
});
document.addEventListener('selectionchange', () => {
  if (!S.doc || S.view !== 'text') return;
  const ci = caretInfo();
  const el = ci ? ci.el : null;
  if (S.lastBlock && S.lastBlock !== el && S.lastBlock.isConnected) {
    if (finalizeBlock(S.lastBlock)) { syncFromDOM(); docChanged(true); }
  }
  const moved = el && el !== S.lastBlock;
  if (el) S.lastBlock = el;
  if (moved) S.tabEl = null;
  updateToolbar();
  if (S.ac.open && (!ci || ci.el !== S.ac.el)) closeAC();
  if (moved && ci.collapsed && !elText(el)) updateAC();
  renderStatus(); highlightSide();
});
editor.addEventListener('blur', () => {
  setTimeout(() => {
    if (!S.doc) return;
    if (document.activeElement !== editor && S.lastBlock && S.lastBlock.isConnected) {
      if (finalizeBlock(S.lastBlock)) { syncFromDOM(); docChanged(true); }
      closeAC();
    }
  }, 150);
});

/* ================= TOOLBAR ================= */
function updateToolbar() {
  if (!S.doc) return;
  const ci = caretInfo();
  const t = ci ? ci.el.dataset.t : (S.lastBlock && S.lastBlock.dataset.t) || F().def;
  $('#style-label').textContent = F().types[t] ? F().types[t].label : '';
  for (const b of $$('.fmt')) {
    let on = false; try { on = document.queryCommandState(b.dataset.fmt); } catch (e) {}
    b.classList.toggle('on', !!(ci && on));
  }
}
function styleMenu() {
  const ci = caretInfo();
  const cur = ci ? ci.el.dataset.t : null;
  const T = F().types;
  const keys = Object.keys(T).sort((a, b) => +T[a].key - +T[b].key);
  openPop($('#style-btn'), `<div class="pop-h">Tab to switch</div>` + keys.map(k => mi(k, T[k].label, 'Ctrl+' + T[k].key, k === cur)).join(''),
    v => { if (document.activeElement !== editor) editor.focus(); changeTypeCmd(v, ci ? ci.el : null); }, { keepFocus: true, align: 'center' });
}
$('#style-btn').addEventListener('pointerdown', e => e.preventDefault());
$$('.fmt').forEach(b => {
  b.addEventListener('pointerdown', e => e.preventDefault());
  b.addEventListener('click', () => {
    if (S.view !== 'text') return;
    commitNow();
    document.execCommand(b.dataset.fmt);
    syncFromDOM(); commitNow(); docChanged(false); updateToolbar();
  });
});

/* ================= AUTOCOMPLETE ================= */
const ORD_EL = ['ΠΡΩΤΗ', 'ΔΕΥΤΕΡΗ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΕΚΤΗ', 'ΕΒΔΟΜΗ', 'ΟΓΔΟΗ', 'ΕΝΑΤΗ', 'ΔΕΚΑΤΗ'];
const ORD_EN = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
const TIMES = { el: ['ΜΕΡΑ', 'ΝΥΧΤΑ', 'ΠΡΩΙ', 'ΜΕΣΗΜΕΡΙ', 'ΑΠΟΓΕΥΜΑ', 'ΣΟΥΡΟΥΠΟ', 'ΞΗΜΕΡΩΜΑ', 'ΣΥΝΕΧΕΙΑ', 'ΑΡΓΟΤΕΡΑ'], en: ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DUSK', 'DAWN', 'CONTINUOUS', 'LATER'] };
const TRANS = {
  screen: { el: ['ΚΟΠΗ ΣΕ:', 'ΔΙΑΛΥΣΗ ΣΕ:', 'ΣΒΗΣΙΜΟ ΣΕ ΜΑΥΡΟ.', 'ΑΝΟΙΓΜΑ ΑΠΟ ΜΑΥΡΟ:', 'ΚΟΠΗ ΣΤΟ ΜΑΥΡΟ.', 'ΤΕΛΟΣ'], en: ['CUT TO:', 'DISSOLVE TO:', 'FADE OUT.', 'FADE IN:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'THE END'] },
  stage: { el: ['ΣΚΟΤΑΔΙ.', 'ΑΥΛΑΙΑ.', 'ΦΩΤΑ ΣΒΗΝΟΥΝ.', 'ΦΩΤΑ ΑΝΑΒΟΥΝ.', 'ΤΕΛΟΣ'], en: ['BLACKOUT.', 'CURTAIN.', 'LIGHTS DOWN.', 'LIGHTS UP.', 'END OF PLAY'] }
};
const PREFIX = { el: ['ΕΣΩΤ.', 'ΕΞΩΤ.', 'ΕΣΩΤ./ΕΞΩΤ.'], en: ['INT.', 'EXT.', 'INT./EXT.'] };
const langOfText = (s) => /[A-Za-z]/.test(s) ? 'en' : /[Ͱ-Ͽἀ-῿]/.test(s) ? 'el' : docLang(S.doc);

function locationsList(excludeEl) {
  const m = new Map();
  for (const el of editor.children) {
    if (el === excludeEl || el.dataset.t !== 'scene') continue;
    const loc = parseHeading(elText(el)).loc;
    if (loc) { const k = fold(loc); const e = m.get(k) || [greekCaps(loc), 0]; e[1]++; m.set(k, e); }
  }
  return [...m.values()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function parseHeading(text) {
  const f = foldStr(text);
  const m = f.match(/^\s*(ΕΣΩΤ\.\/ΕΞΩΤ\.|ΕΣΩΤ\.|ΕΞΩΤ\.|INT\.\/EXT\.|INT\.|EXT\.|I\/E\.?|EST\.)\s*/);
  if (!m) return { prefix: '', loc: '', time: '', restStart: 0 };
  const rest = text.slice(m[0].length);
  const d = rest.search(/\s[-–—]\s?/);
  if (d < 0) return { prefix: text.slice(0, m[1].length), loc: rest.trim(), time: null, restStart: m[0].length };
  return { prefix: text.slice(0, m[1].length), loc: rest.slice(0, d).trim(), time: rest.slice(d).replace(/^\s[-–—]\s?/, ''), restStart: m[0].length, dash: m[0].length + d };
}
function suggestionsFor(el, text) {
  const t = el.dataset.t, fmt = S.doc.format;
  const ft = foldStr(text);
  const starts = (o) => foldStr(o).startsWith(ft) && foldStr(o) !== ft;
  const lang = langOfText(text);
  if (t === 'character') {
    const idx = blockIndex(el);
    const names = characterStats(S.doc).filter(c => !(c.count === 1 && c.first === idx)).map(c => c.name);
    if (!text.trim()) return { items: names.slice(0, 8).map(n => ({ label: n, value: n })), sel: -1 };
    return { items: names.filter(starts).slice(0, 8).map(n => ({ label: n, value: n })), sel: 0 };
  }
  if (t === 'trans') {
    const list = TRANS[fmt][text.trim() ? lang : docLang(S.doc)];
    return { items: list.filter(o => !text.trim() || starts(o)).map(o => ({ label: o, value: o })), sel: text.trim() ? 0 : -1 };
  }
  if (t === 'act' && !text.trim()) {
    const n = S.doc.blocks.slice(0, blockIndex(el)).filter(b => b.t === 'act').length;
    const dl = docLang(S.doc);
    const v = dl === 'el' ? 'ΠΡΑΞΗ ' + (ORD_EL[n] || n + 1) : 'ACT ' + (ORD_EN[n] || n + 1);
    const alt = dl === 'el' ? 'ACT ' + (ORD_EN[n] || n + 1) : 'ΠΡΑΞΗ ' + (ORD_EL[n] || n + 1);
    return { items: [{ label: v, value: v }, { label: alt, value: alt }], sel: -1 };
  }
  if (t === 'scene' && fmt === 'stage' && !text.trim()) {
    let n = 0;
    for (let i = blockIndex(el) - 1; i >= 0; i--) { const b = S.doc.blocks[i]; if (b.t === 'act') break; if (b.t === 'scene') n++; }
    const dl = docLang(S.doc);
    const opts = dl === 'el' ? ['ΣΚΗΝΗ ' + (n + 1), 'ΕΙΚΟΝΑ ' + (n + 1), 'SCENE ' + (n + 1)] : ['SCENE ' + (n + 1), 'ΣΚΗΝΗ ' + (n + 1)];
    return { items: opts.map(o => ({ label: o, value: o })), sel: -1 };
  }
  if (t === 'scene' && fmt === 'screen') {
    const h = parseHeading(text);
    if (!h.prefix) {
      const pre = text.trim() ? PREFIX[lang] : PREFIX[docLang(S.doc)].concat(PREFIX[docLang(S.doc) === 'el' ? 'en' : 'el']);
      return { items: pre.filter(o => !text.trim() || starts(o)).map(o => ({ label: o, value: o + ' ', stay: true })), sel: text.trim() ? 0 : -1 };
    }
    if (h.time === null) {
      const pre = text.slice(0, h.restStart).replace(/\s*$/, ' ');
      const locs = locationsList(el).filter(l => !h.loc || (foldStr(l).startsWith(foldStr(h.loc)) && foldStr(l) !== foldStr(h.loc)));
      return { items: locs.slice(0, 8).map(l => ({ label: l, value: pre + l + ' - ', stay: true })), sel: h.loc ? 0 : -1 };
    }
    const base = text.slice(0, h.dash).replace(/\s+$/, '') + ' - ';
    const tp = foldStr(h.time.trim());
    const tl = TIMES[/[A-Za-z]/.test(h.prefix) ? 'en' : 'el'];
    return { items: tl.filter(o => !tp || (foldStr(o).startsWith(tp) && foldStr(o) !== tp)).map(o => ({ label: o, value: base + o })), sel: tp ? 0 : -1 };
  }
  return { items: [], sel: -1 };
}
function updateAC() {
  if (!S.doc || S.view !== 'text') return closeAC();
  const ci = caretInfo();
  if (!ci || !ci.collapsed) return closeAC();
  const text = elText(ci.el);
  if (ci.off !== text.length) return closeAC();
  if (S.ac.suppress === ci.el && S.ac.suppressText === text) return closeAC();
  const { items, sel } = suggestionsFor(ci.el, text);
  if (!items.length) return closeAC();
  S.ac = { open: true, items, sel, el: ci.el };
  const ul = $('#ac');
  ul.innerHTML = items.map((it, i) => `<li data-i="${i}" class="${i === sel ? 'on' : ''}">${escHTML(it.label)}</li>`).join('');
  let rect = ci.range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) rect = ci.el.getBoundingClientRect();
  const er = ci.el.getBoundingClientRect();
  ul.classList.remove('hidden');
  const top = Math.max(er.bottom, rect.bottom) + 4;
  ul.style.left = Math.min(Math.max(8, rect.left || er.left), innerWidth - ul.offsetWidth - 8) + 'px';
  ul.style.top = (top + ul.offsetHeight > innerHeight - 40 ? Math.max(8, er.top - ul.offsetHeight - 4) : top) + 'px';
}
function closeAC(suppress) {
  if (suppress && S.ac.el) { S.ac.suppress = S.ac.el; S.ac.suppressText = elText(S.ac.el); }
  S.ac.open = false; S.ac.items = []; S.ac.sel = -1;
  $('#ac').classList.add('hidden');
}
function moveAC(d) {
  const n = S.ac.items.length;
  S.ac.sel = S.ac.sel < 0 ? (d > 0 ? 0 : n - 1) : (S.ac.sel + d + n) % n;
  $$('#ac li').forEach((li, i) => li.classList.toggle('on', i === S.ac.sel));
}
function acceptAC() {
  const it = S.ac.items[S.ac.sel], el = S.ac.el;
  closeAC();
  if (!it || !el || !el.isConnected) return;
  setText(el, it.value); setCaret(el, it.value.length);
  syncFromDOM(); docChanged(true);
  if (it.stay) updateAC(); else closeAC(true);
}
$('#ac').addEventListener('pointerdown', e => {
  const li = e.target.closest('li'); if (!li) return;
  e.preventDefault(); S.ac.sel = +li.dataset.i; acceptAC();
});

/* ================= REFRESH: pages, side, status ================= */
function refreshNow() {
  if (!S.doc) return;
  if (S.view === 'text') syncFromDOM();
  S.pg = paginate(S.doc);
  const bp = S.pg.blockPage, nums = !!S.doc.settings.sceneNumbers;
  let sc = 0;
  [...editor.children].forEach((el, i) => {
    const p = bp[i];
    if (i > 0 && p !== bp[i - 1]) { if (el.dataset.pb !== p + '.') el.dataset.pb = p + '.'; }
    else if (el.dataset.pb) delete el.dataset.pb;
    if (el.dataset.t === 'scene') { sc++; if (nums) el.dataset.sn = sc; else delete el.dataset.sn; }
    else if (el.dataset.sn) delete el.dataset.sn;
  });
  renderSide(); renderStatus();
  if (S.view === 'cards') renderCards();
}
function renderStatus() {
  if (!S.doc || !S.pg) return;
  const ci = caretInfo();
  const i = ci ? blockIndex(ci.el) : 0;
  const cur = S.pg.blockPage[i] || 1, tot = S.pg.pages.length;
  const words = S.doc.blocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
  const scenes = S.doc.blocks.filter(b => b.t === 'scene').length;
  const acts = S.doc.blocks.filter(b => b.t === 'act').length;
  let s = `Page ${cur} of ${tot}`;
  if (acts) s += ` · ${acts} act${acts > 1 ? 's' : ''}`;
  s += ` · ${scenes} scene${scenes === 1 ? '' : 's'} · ${words.toLocaleString('en-US')} words`;
  if (S.doc.format === 'screen') s += ` · ~${tot} min`;
  $('#status').textContent = s;
}
function renderSide() {
  const list = sceneList(S.doc), bp = S.pg ? S.pg.blockPage : [];
  $('#side-scenes').innerHTML = list.length ? list.map(x => x.kind === 'act'
    ? `<div class="side-act" data-i="${x.i}">${escHTML(x.text)}</div>`
    : `<div class="side-item" data-i="${x.i}"><span class="n">${S.doc.format === 'stage' ? x.numInAct : x.num}</span><span class="tx">${escHTML(x.text)}</span><span class="pg">${bp[x.i] || ''}</span></div>`).join('')
    : `<div class="side-empty">No scenes yet.</div>`;
  const chars = characterStats(S.doc);
  $('#side-chars').innerHTML = chars.length ? chars.map(c => `<div class="side-item" data-char="${escHTML(c.name)}"><span class="tx">${escHTML(c.name)}</span><span class="pg">${c.count}</span></div>`).join('')
    : `<div class="side-empty">No characters yet.</div>`;
  highlightSide();
}
function highlightSide() {
  const ci = caretInfo(); if (!ci) return;
  const i = blockIndex(ci.el); let best = null;
  $$('#side-scenes .side-item').forEach(d => { if (+d.dataset.i <= i) best = d; d.classList.remove('on'); });
  if (best) best.classList.add('on');
}
function goToBlock(i) {
  if (S.view !== 'text') setView('text');
  const el = editor.children[i]; if (!el) return;
  editor.focus(); setCaret(el, elText(el).length);
  el.scrollIntoView({ block: 'center' });
  if (innerWidth < 1000) $('#side').classList.remove('open');
}
$('#side-scenes').addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (d) goToBlock(+d.dataset.i); });
$('#side-chars').addEventListener('click', e => {
  const d = e.target.closest('[data-char]'); if (!d) return;
  const ci = caretInfo(), from = ci ? blockIndex(ci.el) : -1;
  const idx = S.doc.blocks.map((b, i) => [b, i]).filter(([b]) => b.t === 'character' && cleanCharName(b.text) === d.dataset.char).map(x => x[1]);
  const next = idx.find(i => i > from) ?? idx[0];
  if (next != null) goToBlock(next + 1 < S.doc.blocks.length ? next + 1 : next);
});
$('#side-seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#side-seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#side-scenes').classList.toggle('hidden', b.dataset.side !== 'scenes');
  $('#side-chars').classList.toggle('hidden', b.dataset.side !== 'chars');
});

/* ================= CARDS ================= */
function units() {
  const bl = S.doc.blocks, out = [];
  bl.forEach((b, i) => {
    if (b.t !== 'scene') return;
    let e = i + 1;
    while (e < bl.length && bl[e].t !== 'scene' && bl[e].t !== 'act') e++;
    out.push({ start: i, end: e });
  });
  return out;
}
function renderCards() {
  const bl = S.doc.blocks, us = units(), bp = S.pg ? S.pg.blockPage : [];
  let html = '', num = 0, ui = 0;
  for (let i = 0; i < bl.length; i++) {
    if (bl[i].t === 'act') html += `<div class="card-act">${escHTML(greekCaps(bl[i].text) || 'ACT')}</div>`;
    if (ui < us.length && us[ui].start === i) {
      const u = us[ui]; num++;
      const prev = bl.slice(u.start + 1, u.end).filter(x => x.text.trim()).slice(0, 3).map(x => (x.t === 'character' ? greekCaps(x.text) + ': ' : '') + x.text).join(' ').slice(0, 160);
      html += `<div class="card" draggable="true" data-u="${ui}">
        <div class="card-h"><span class="n">${num}</span><span class="tx" data-go="${i}">${escHTML(greekCaps(bl[i].text) || '(untitled)')}</span><span class="pg">p. ${bp[i] || ''}</span></div>
        <textarea data-note="${bl[i].id}" placeholder="Scene summary…">${escHTML(S.doc.notes[bl[i].id] || '')}</textarea>
        <div class="card-p">${escHTML(prev)}</div>
        <div class="card-a"><button class="ib sm" data-mv="-1" title="Move earlier">${icon('left')}</button><button class="ib sm" data-mv="1" title="Move later">${icon('right')}</button></div>
      </div>`;
      ui++;
    }
  }
  $('#cards').innerHTML = html || `<div class="side-empty" style="padding:40px">Cards appear once the script has scenes.</div>`;
}
function moveRange(start, end, insertAt) {
  const bl = S.doc.blocks, chunk = bl.slice(start, end);
  const rest = bl.slice(0, start).concat(bl.slice(end));
  rest.splice(insertAt > start ? insertAt - (end - start) : insertAt, 0, ...chunk);
  S.doc.blocks = rest;
}
function afterMove() { renderEditor(); commitNow(); docChanged(false); refreshNow(); }
function moveUnit(k, dir) {
  const us = units(), u = us[k], o = us[k + dir];
  if (!u || !o) return;
  commitNow();
  moveRange(u.start, u.end, dir < 0 ? o.start : o.end);
  afterMove();
}
$('#cards').addEventListener('click', e => {
  const mv = e.target.closest('[data-mv]');
  if (mv) { moveUnit(+mv.closest('.card').dataset.u, +mv.dataset.mv); return; }
  const go = e.target.closest('[data-go]'); if (go) goToBlock(+go.dataset.go);
});
$('#cards').addEventListener('input', e => { const id = e.target.dataset.note; if (!id) return; S.doc.notes[id] = e.target.value; metaChanged(); });
let dragU = null;
$('#cards').addEventListener('dragstart', e => { const c = e.target.closest('.card'); if (!c || e.target.tagName === 'TEXTAREA') return; dragU = +c.dataset.u; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
$('#cards').addEventListener('dragend', () => $$('.card.drag, .card.over').forEach(c => c.classList.remove('drag', 'over')));
$('#cards').addEventListener('dragover', e => { const c = e.target.closest('.card'); if (c && dragU != null) { e.preventDefault(); $$('.card.over').forEach(x => x.classList.remove('over')); c.classList.add('over'); } });
$('#cards').addEventListener('drop', e => {
  const c = e.target.closest('.card'); if (!c || dragU == null) return;
  e.preventDefault();
  const to = +c.dataset.u, us = units();
  if (to !== dragU) { commitNow(); const u = us[dragU], t = us[to]; moveRange(u.start, u.end, to < dragU ? t.start : t.end); afterMove(); }
  dragU = null;
});

/* ================= TITLE PAGE ================= */
function renderTitleView() {
  const d = S.doc, m = d.meta, p = PAPER[d.settings.paper] || PAPER.A4;
  const box = $('#titleview');
  const sheet = (inner) => `<div class="sheet" style="width:${p.w}in;height:${p.h}in;font-family:var(--script-font)">${inner}</div>`;
  const inp = (k, ph, style, cls = 'center') => `<input class="tp-edit ${cls}" data-tp="${k}" value="${escHTML(k === 'title' ? d.title : m[k] || '')}" placeholder="${ph}" style="${style}">`;
  const ta = (k, ph, style, rows) => `<textarea class="tp-edit" data-tp="${k}" rows="${rows}" placeholder="${ph}" style="${style}">${escHTML(m[k] || '')}</textarea>`;
  let html = sheet(
    inp('title', 'TITLE', 'top:3.2in', 'center title') +
    inp('subtitle', 'Subtitle (optional)', 'top:3.55in') +
    inp('credit', 'Written by', 'top:4.05in') +
    `<textarea class="tp-edit center" data-tp="author" rows="2" placeholder="Author" style="top:4.4in">${escHTML(m.author)}</textarea>` +
    inp('source', 'Based on… (optional)', 'top:5.1in') +
    ta('contact', 'Contact details\n(name, phone, email)', `left:1.5in;bottom:0.9in;width:3in;text-align:left`, 4) +
    ta('draft', 'Draft / date', `right:1in;bottom:0.9in;width:2.4in;text-align:right`, 3)
  );
  if (d.format === 'stage') {
    html += `<div class="tv-label" style="--sheetw:${p.w}in">Characters page</div>` + sheet(
      `<div class="tp-edit center" style="top:1in;border:0;text-decoration:underline">${WORDS[docLang(d)].cast}</div>` +
      ta('cast', 'One character per line, e.g.\nΓΕΝ – artificial intelligence\nΕΛΕΝΗ – scientist, 40', 'left:1.5in;right:1in;top:1.6in;height:8in;width:auto', 30)
    );
  }
  html += `<p class="tv-hint">${d.settings.titlePage ? 'The title page is included when you export.' : 'The title page is currently left out of exports (Project settings).'}</p>`;
  box.innerHTML = html;
}
$('#titleview').addEventListener('input', e => {
  const k = e.target.dataset.tp; if (!k) return;
  if (k === 'title') { S.doc.title = e.target.value; $('#doc-title').value = S.doc.title; document.title = (S.doc.title || 'Untitled') + ' — Scena'; }
  else S.doc.meta[k] = e.target.value;
  if (k === 'author' || k === 'contact') savePrefs({ [k]: e.target.value });
  metaChanged();
});

function setView(v) {
  if (S.view === 'text' && v !== 'text' && S.doc) syncFromDOM();
  S.view = v;
  document.body.classList.toggle('view-cards', v === 'cards');
  document.body.classList.toggle('view-title', v === 'title');
  $$('#view-seg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#sheet-wrap').classList.toggle('hidden', v !== 'text');
  $('#cards').classList.toggle('hidden', v !== 'cards');
  $('#titleview').classList.toggle('hidden', v !== 'title');
  closeAC(); closePop();
  if (v === 'cards') { S.pg = paginate(S.doc); renderCards(); }
  if (v === 'title') renderTitleView();
  if (v === 'text') { editor.focus(); }
}
$('#view-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });

/* ================= FIND ================= */
function openFind() {
  if (S.view !== 'text') setView('text');
  $('#findbar').classList.remove('hidden');
  const sel = getSelection().toString();
  if (sel && !/\n/.test(sel)) $('#find-q').value = sel;
  $('#find-q').focus(); $('#find-q').select(); runFind();
}
function runFind() {
  syncFromDOM();
  const q = foldStr($('#find-q').value);
  S.find.matches = [];
  if (q) S.doc.blocks.forEach((b, bi) => { const f = foldStr(b.text); let p = 0; while ((p = f.indexOf(q, p)) >= 0) { S.find.matches.push({ bi, a: p, b: p + q.length }); p += q.length; } });
  S.find.cur = S.find.matches.length ? 0 : -1;
  $('#find-count').textContent = q ? (S.find.matches.length ? `${S.find.matches.length} found` : 'No results') : '';
}
function showMatch(d) {
  const m = S.find.matches; if (!m.length) return;
  S.find.cur = (S.find.cur + d + m.length) % m.length;
  const x = m[S.find.cur], el = editor.children[x.bi];
  selectRangeIn(el, x.a, x.b); el.scrollIntoView({ block: 'center' });
  $('#find-count').textContent = `${S.find.cur + 1} of ${m.length}`;
}
$('#find-q').addEventListener('input', () => { runFind(); S.find.cur = -1; showMatch(1); $('#find-q').focus(); });
$('#find-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); showMatch(e.shiftKey ? -1 : 1); $('#find-q').focus(); } if (e.key === 'Escape') closeFind(); });
function closeFind() { $('#findbar').classList.add('hidden'); editor.focus(); }
function replaceIn(b, a, e, r) { setBlockRuns(b, [...sliceRuns(runsOf(b), 0, a), { t: r }, ...sliceRuns(runsOf(b), e, b.text.length)]); }
function replaceOne() {
  const m = S.find.matches[S.find.cur]; if (!m) return;
  commitNow();
  const b = S.doc.blocks[m.bi];
  replaceIn(b, m.a, m.b, $('#find-r').value);
  setRuns(editor.children[m.bi], runsOf(b));
  commitNow(); docChanged(false);
  const cur = S.find.cur; runFind(); S.find.cur = cur - 1; showMatch(1);
}
function replaceAll() {
  runFind(); const m = S.find.matches; if (!m.length) return;
  commitNow();
  for (let k = m.length - 1; k >= 0; k--) replaceIn(S.doc.blocks[m[k].bi], m[k].a, m[k].b, $('#find-r').value);
  renderEditor(); commitNow(); docChanged(false);
  toast(`Replaced ${m.length}`); runFind();
}

/* ================= ZOOM / THEME ================= */
function applyZoom() {
  const paper = PAPER[S.doc.settings.paper] || PAPER.A4;
  const sh = $('#sheet');
  sh.style.width = paper.w + 'in'; sh.style.minHeight = paper.h + 'in';
  document.documentElement.style.setProperty('--sheetw', paper.w + 'in');
  let z = S.zoom;
  if (z == null) {
    const avail = $('#scroller').clientWidth - 24;
    z = Math.min(1, Math.max(0.5, avail / (paper.w * 96)));
  }
  $('#sheet-wrap').style.zoom = z; $('#titleview').style.zoom = z;
  $('#zoomv').textContent = Math.round(z * 100) + '%';
}
function zoomBy(d) {
  const cur = parseFloat($('#sheet-wrap').style.zoom) || 1;
  S.zoom = Math.min(2, Math.max(0.4, Math.round((cur + d) * 10) / 10));
  localStorage.setItem('scena:zoom', S.zoom); applyZoom();
}
window.addEventListener('resize', () => { if (S.doc && S.zoom == null) applyZoom(); if (S.ac.open) updateAC(); closePop(); });
if (localStorage.getItem('scena:dark') === '1') document.body.classList.add('dark');
if (localStorage.getItem('scena:zoom')) S.zoom = +localStorage.getItem('scena:zoom');

/* ================= MENUS & DIALOGS ================= */
function exportMenu(anchor) {
  openPop(anchor, mi('pdf', 'PDF', 'Ctrl+P') + mi('docx', 'Word (.docx)') + mi('fdx', 'Final Draft (.fdx)') + mi('fountain', 'Fountain (.fountain)') + '<hr>' + mi('scena', 'Scena file (.scena)', 'to move devices'), v => doExport(v), { align: 'right' });
}
function moreMenu(anchor) {
  const dark = document.body.classList.contains('dark');
  openPop(anchor, mi('find', 'Find & replace', 'Ctrl+F') + mi('settings', 'Project settings…') + mi('dark', dark ? 'Light mode' : 'Dark mode') + mi('help', 'Keyboard shortcuts') + '<hr>' + mi('about', 'About Scena'), v => {
    if (v === 'find') openFind();
    if (v === 'settings') settingsDialog();
    if (v === 'dark') { document.body.classList.toggle('dark'); localStorage.setItem('scena:dark', document.body.classList.contains('dark') ? '1' : '0'); }
    if (v === 'help') helpDialog();
    if (v === 'about') aboutDialog();
  }, { align: 'right' });
}
function settingsDialog() {
  const d = S.doc, other = d.format === 'screen' ? 'stage' : 'screen';
  const fontOpts = Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${d.settings.font === k ? 'selected' : ''}>${f.label}</option>`).join('');
  showModal(`
    <h2>Project settings</h2>
    <div class="form">
      <label>Font<select id="f-font">${fontOpts}</select></label>
      <div class="font-prev" id="f-prev">ΕΣΩΤ. ΚΟΥΖΙΝΑ - ΝΥΧΤΑ · INT. KITCHEN - NIGHT<br>Η Ελένη ανοίγει το παράθυρο. Eleni opens the window.</div>
      <label>Paper size<select id="f-paper">${Object.entries(PAPER).map(([k, p]) => `<option value="${k}" ${d.settings.paper === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="f-sn" ${d.settings.sceneNumbers ? 'checked' : ''}> Scene numbers</label>
      <label class="chk"><input type="checkbox" id="f-tp" ${d.settings.titlePage ? 'checked' : ''}> Include the title page in exports</label>
      <hr>
      <p class="hint">Adapting this project? This creates a <b>new copy</b> as a ${other === 'stage' ? 'stage play' : 'screenplay'}; the original stays as it is.</p>
      <div><button class="btn" data-x="convert">Make a copy as ${other === 'stage' ? 'Stage Play' : 'Screenplay'}</button></div>
    </div>
    <div class="modal-actions"><button class="btn" data-x="no">Cancel</button><button class="btn dark" data-x="ok">Save</button></div>`, box => {
    const prev = () => { $('#f-prev').style.fontFamily = FONTS[$('#f-font').value].css; };
    $('#f-font').onchange = prev; prev();
    box.onclick = async e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'convert') { closeModal(); await convertCopy(other); return; }
      if (x === 'ok') {
        d.settings.font = $('#f-font').value; d.settings.paper = $('#f-paper').value;
        d.settings.sceneNumbers = $('#f-sn').checked; d.settings.titlePage = $('#f-tp').checked;
        savePrefs({ font: d.settings.font, paper: d.settings.paper });
        applyFont(); applyZoom();
        if (S.view === 'title') renderTitleView();
        if (document.fonts) await document.fonts.ready;
        docChanged(false); refreshNow();
      }
      closeModal(); if (S.view === 'text') editor.focus();
    };
  });
}
async function convertCopy(to) {
  await saveNow();
  const src = JSON.parse(JSON.stringify(S.doc));
  const d = makeDoc(to);
  d.title = src.title + (to === 'stage' ? ' (stage adaptation)' : ' (screenplay)');
  d.meta = Object.assign(d.meta, src.meta);
  d.settings = Object.assign(d.settings, src.settings);
  const map = to === 'stage'
    ? { act: 'act', scene: 'scene', action: 'direction', shot: 'direction', character: 'character', paren: 'paren', dialogue: 'dialogue', trans: 'trans', text: 'text' }
    : { act: 'act', scene: 'scene', direction: 'action', character: 'character', paren: 'paren', dialogue: 'dialogue', trans: 'trans', text: 'text' };
  d.blocks = src.blocks.map(b => { const nb = { id: uid(), t: map[b.t] || FORMATS[to].def, text: b.text }; if (b.runs) nb.runs = b.runs; return nb; });
  if (to === 'stage' && d.blocks[0]?.t !== 'act') d.blocks.unshift({ id: uid(), t: 'act', text: docLang(d) === 'el' ? 'ΠΡΑΞΗ ΠΡΩΤΗ' : 'ACT ONE' });
  await Store.save(d);
  loadIntoWorkspace(d);
  toast('New copy created');
}
function helpDialog() {
  const T = F().types;
  const keys = Object.keys(T).sort((a, b) => +T[a].key - +T[b].key);
  showModal(`
    <h2>Keyboard shortcuts</h2>
    <table class="help">
      <tr><td><kbd>Enter</kbd></td><td>New line below, same element — like Word</td></tr>
      <tr><td><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd></td><td>Change the element. On a new empty line, Tab first picks what usually comes next (Character → Dialogue), then cycles.</td></tr>
      <tr><td>${keys.map(k => `<kbd>Ctrl+${T[k].key}</kbd>`).join(' ')}</td><td>${keys.map(k => T[k].label).join(' · ')}</td></tr>
      <tr><td><kbd>Ctrl+B</kbd> <kbd>Ctrl+I</kbd> <kbd>Ctrl+U</kbd></td><td>Bold, italic, underline</td></tr>
      <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></td><td>Pick a suggestion (characters, locations, time of day)</td></tr>
      <tr><td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd></td><td>Undo / redo</td></tr>
      <tr><td><kbd>Ctrl+F</kbd></td><td>Find &amp; replace</td></tr>
      <tr><td><kbd>Ctrl+P</kbd></td><td>Export PDF</td></tr>
    </table>
    <p class="hint" style="margin-top:12px">Greek works everywhere: scene headings and character names are capitalised without accents, and search ignores accents.</p>
    <div class="modal-actions"><button class="btn dark" data-x="ok">Done</button></div>`, box => { box.onclick = e => { if (e.target.closest('[data-x]')) { closeModal(); editor.focus(); } }; });
}
async function aboutDialog() {
  const v = Store.native && Native.version ? await Native.version() : null;
  showModal(`<h2>Scena</h2><p class="hint">Screenplay &amp; stage play editor${v ? ` · version ${escHTML(v)}` : ''}.<br>${Store.native ? 'Updates install automatically in the background.' : 'This version updates itself whenever it is online.'}</p>
    <div class="modal-actions">${Store.native && Native.checkUpdate ? '<button class="btn" data-x="chk">Check for updates</button>' : ''}<button class="btn dark" data-x="ok">Close</button></div>`, box => {
    box.onclick = async e => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'chk') { const r = await Native.checkUpdate(); toast(r && r.ready ? `Version ${r.version} is ready — restart to use it` : r && r.error ? 'Could not check for updates' : 'You have the latest version'); }
      closeModal();
    };
  });
}

/* ================= EXPORT / IMPORT ================= */
async function deliver(name, data, mime, ext) {
  if (Store.native) {
    const p = await Native.saveFile({ name, data, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (p) toast('Saved: ' + p, 4000);
    return;
  }
  const blob = new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function prepExport() {
  if (S.view === 'text') { [...editor.children].forEach(finalizeBlock); syncFromDOM(); }
  return safeName(S.doc.title);
}
async function exportPDF() {
  const name = prepExport();
  if (document.fonts) await document.fonts.ready;
  $('#print').innerHTML = buildPrintHTML(S.doc);
  if (Store.native) {
    const p = await Native.printPDF({ name: name + '.pdf', paper: S.doc.settings.paper });
    if (p) toast('Saved: ' + p, 4000);
  } else {
    const old = document.title; document.title = name;
    setTimeout(() => { window.print(); document.title = old; }, 60);
  }
}
async function doExport(kind) {
  const name = prepExport();
  if (kind === 'pdf') return exportPDF();
  if (kind === 'docx') return deliver(name + '.docx', Formats.toDocx(S.doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx');
  if (kind === 'fdx') return deliver(name + '.fdx', Formats.toFDX(S.doc), 'application/xml', 'fdx');
  if (kind === 'fountain') return deliver(name + '.fountain', Formats.toFountain(S.doc), 'text/plain;charset=utf-8', 'fountain');
  if (kind === 'scena') { await saveNow(); return deliver(name + '.scena', JSON.stringify(S.doc, null, 1), 'application/json', 'scena'); }
}
async function importFile(file) {
  let res;
  try { toast('Reading file…', 20000); res = await Formats.importFile(file); }
  catch (e) { console.error(e); toast('Could not read the file: ' + e.message, 6000); return; }
  $('#toast').classList.add('hidden');
  if (res.kind === 'scena') {
    const d = normalizeDoc(res.doc);
    const exists = await Store.load(d.id);
    if (exists) {
      const choice = await new Promise(r => showModal(`<h2>Project already here</h2><p class="hint">“${escHTML(d.title)}” already exists on this device.<br>This device: ${fmtDate(exists.updated)} · File: ${fmtDate(d.updated)}</p>
        <div class="modal-actions"><button class="btn" data-x="cancel">Cancel</button><button class="btn" data-x="copy">Keep both</button><button class="btn dark" data-x="replace">Replace</button></div>`,
        box => { box.onclick = e => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) { closeModal(); r(x); } }; }));
      if (choice === 'cancel') return;
      if (choice === 'copy') { d.id = uid(); d.title += ' (copy)'; }
    }
    await Store.save(d); loadIntoWorkspace(d); return;
  }
  const fmt = await new Promise(r => showModal(`<h2>Import “${escHTML(res.title)}”</h2><p class="hint">${escHTML(res.note || '')}</p>
    <div class="new-grid" style="margin-top:14px">
      <button class="new-card" data-x="screen" style="${res.guess === 'screen' ? 'border-color:var(--ink)' : ''}"><span class="nt">Screenplay</span><span class="nd">${res.guess === 'screen' ? 'Looks like a screenplay' : '&nbsp;'}</span></button>
      <button class="new-card" data-x="stage" style="${res.guess === 'stage' ? 'border-color:var(--ink)' : ''}"><span class="nt">Stage Play</span><span class="nd">${res.guess === 'stage' ? 'Looks like a stage play' : '&nbsp;'}</span></button>
    </div>
    <div class="modal-actions"><button class="btn" data-x="">Cancel</button></div>`,
    box => { box.onclick = e => { const b = e.target.closest('[data-x]'); if (b) { closeModal(); r(b.dataset.x); } }; }));
  if (!fmt) return;
  const d = makeDoc(fmt);
  d.title = res.title || 'Imported';
  Object.assign(d.meta, Object.fromEntries(Object.entries(res.meta || {}).filter(([, v]) => v)));
  d.blocks = res.build(fmt).map(b => { const nb = { id: uid(), t: b.t, text: b.text }; if (b.runs) setBlockRuns(nb, b.runs); return nb; });
  normalizeDoc(d);
  await Store.save(d);
  loadIntoWorkspace(d);
  toast(`Imported ${d.blocks.length} elements — check that they were recognised correctly`, 5000);
}
$('#file-in').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });

/* ================= BUTTONS & KEYS ================= */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  switch (b.dataset.act) {
    case 'new': return newDialog();
    case 'import': return $('#file-in').click();
    case 'home': return showLibrary();
    case 'toggle-side': $('#side').classList.toggle('open'); if (S.zoom == null) applyZoom(); return;
    case 'style-menu': return styleMenu();
    case 'tab': if (document.activeElement !== editor) editor.focus(); return tabCmd(false);
    case 'undo': return undo();
    case 'redo': return redo();
    case 'find': return openFind();
    case 'find-next': return showMatch(1);
    case 'find-prev': return showMatch(-1);
    case 'find-close': return closeFind();
    case 'replace-one': return replaceOne();
    case 'replace-all': return replaceAll();
    case 'zoom-in': return zoomBy(0.1);
    case 'zoom-out': return zoomBy(-0.1);
    case 'export-menu': return exportMenu(b);
    case 'more-menu': return moreMenu(b);
  }
});
$$('[data-act="undo"], [data-act="redo"], [data-act="tab"]').forEach(b => b.addEventListener('pointerdown', e => e.preventDefault()));
$('#doc-title').addEventListener('input', () => {
  S.doc.title = $('#doc-title').value;
  document.title = (S.doc.title || 'Untitled') + ' — Scena';
  metaChanged();
});
$('#doc-title').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor.focus(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); closePop(); }
  if (!S.doc) return;
  const mod = e.ctrlKey || e.metaKey; if (!mod) return;
  const c = e.code;
  if (c === 'KeyF') { e.preventDefault(); openFind(); }
  else if (c === 'KeyS') { e.preventDefault(); S.dirty = true; saveNow().then(() => toast('Saved')); }
  else if (c === 'KeyP') { e.preventDefault(); doExport('pdf'); }
  else if (c === 'KeyZ' && !e.shiftKey && document.activeElement === editor) { e.preventDefault(); undo(); }
  else if (((c === 'KeyZ' && e.shiftKey) || c === 'KeyY') && document.activeElement === editor) { e.preventDefault(); redo(); }
  else if (c === 'Equal' || c === 'NumpadAdd') { e.preventDefault(); zoomBy(0.1); }
  else if (c === 'Minus' || c === 'NumpadSubtract') { e.preventDefault(); zoomBy(-0.1); }
});

/* ================= UPDATES ================= */
function showUpdate(info) {
  const u = $('#update');
  u.innerHTML = `<div><div class="ut">Scena ${escHTML(info.version)} is ready</div><div class="us">${escHTML(info.notes || 'Restart to use the new version.')}</div></div>
    <button class="btn dark small" id="upd-go">Restart</button><button class="ib sm" id="upd-x" title="Later">${icon('x')}</button>`;
  u.classList.remove('hidden');
  $('#upd-go').onclick = async () => { await saveNow(); Native.restart(); };
  $('#upd-x').onclick = () => u.classList.add('hidden');
}
if (Store.native && Native.onUpdate) Native.onUpdate(showUpdate);

/* ================= START ================= */
paintIcons();
if (Store.native) document.body.classList.add('is-native');
if (innerWidth >= 1000) $('#side').classList.add('open');
if (!Store.native && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'activated' && navigator.serviceWorker.controller) toast('Scena was updated — it will use the new version next time you open it', 4000); });
    });
  }).catch(() => {});
}
showLibrary();
