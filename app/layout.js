/* Scena — element formats, Greek caps, rich runs, pagination, print */
'use strict';

const PAPER = {
  A4:     { w: 8.27, h: 11.69, label: 'A4' },
  Letter: { w: 8.5,  h: 11,    label: 'US Letter' }
};
const MARGIN = { top: 1, bottom: 1, left: 1.5, right: 1 };
const LPI = 6;               // 12pt lines

/* Fonts: label, CSS stack (bundled fallback for tablets), name written into Word */
const FONTS = {
  courier: { label: 'Courier New (standard)', css: "'Courier New', 'Scena Mono', monospace", word: 'Courier New' },
  mono:    { label: 'Liberation Mono',        css: "'Scena Mono', 'Courier New', monospace", word: 'Liberation Mono' },
  times:   { label: 'Times New Roman',        css: "'Times New Roman', 'Scena Serif', serif", word: 'Times New Roman' },
  arial:   { label: 'Arial',                  css: "Arial, 'Scena Sans', sans-serif",       word: 'Arial' }
};
const fontOf = (doc) => FONTS[(doc && doc.settings && doc.settings.font) || 'courier'] || FONTS.courier;

/* Element types. ind / w in inches from the left text margin (w:null = full width, negative = full minus). sb = blank lines before. */
const FORMATS = {
  screen: {
    name: 'Screenplay',
    order: ['scene', 'action', 'character', 'dialogue', 'paren', 'trans', 'shot', 'text', 'act'],
    def: 'action',
    types: {
      act:       { label: 'Act',            key: '0', ind: 0,   w: null, sb: 2, upper: true, align: 'center', underline: true, keep: true, pageBreak: true },
      scene:     { label: 'Scene Heading',  key: '1', ind: 0,   w: null, sb: 1, upper: true, keep: true },
      action:    { label: 'Action',         key: '2', ind: 0,   w: null, sb: 1 },
      character: { label: 'Character',      key: '3', ind: 2.0, w: 3.0,  sb: 1, upper: true, keep: true },
      dialogue:  { label: 'Dialogue',       key: '4', ind: 1.0, w: 3.5,  sb: 0 },
      paren:     { label: 'Parenthetical',  key: '5', ind: 1.5, w: 2.0,  sb: 0, keep: true },
      trans:     { label: 'Transition',     key: '6', ind: 0,   w: null, sb: 1, upper: true, align: 'right' },
      shot:      { label: 'Shot',           key: '7', ind: 0,   w: null, sb: 1, upper: true, keep: true },
      text:      { label: 'Text',           key: '8', ind: 0,   w: null, sb: 1 }
    },
    // what usually follows each element (Tab on an empty line picks this)
    after: { scene: 'action', action: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', trans: 'scene', shot: 'action', text: 'action', act: 'scene' }
  },
  stage: {
    name: 'Stage Play',
    order: ['scene', 'direction', 'character', 'dialogue', 'paren', 'trans', 'text', 'act'],
    def: 'direction',
    types: {
      act:       { label: 'Act',             key: '0', ind: 0,   w: null, sb: 2, upper: true, align: 'center', underline: true, keep: true, pageBreak: true },
      scene:     { label: 'Scene',           key: '1', ind: 0,   w: null, sb: 1, upper: true, align: 'center', keep: true },
      direction: { label: 'Stage Direction', key: '2', ind: 1.5, w: -1.5, sb: 1, italic: true },
      character: { label: 'Character',       key: '3', ind: 0,   w: null, sb: 1, upper: true, align: 'center', keep: true },
      dialogue:  { label: 'Dialogue',        key: '4', ind: 0,   w: null, sb: 0 },
      paren:     { label: 'Parenthetical',   key: '5', ind: 1.0, w: -2.0, sb: 0, italic: true, keep: true },
      trans:     { label: 'Transition',      key: '6', ind: 0,   w: null, sb: 1, upper: true, align: 'right' },
      text:      { label: 'Text',            key: '8', ind: 0,   w: null, sb: 1 }
    },
    after: { act: 'scene', scene: 'direction', direction: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', trans: 'act', text: 'direction' }
  }
};

/* ---------- text helpers ---------- */
function greekCaps(s) {
  if (!s) return s;
  let t = s.normalize('NFD');
  t = t.replace(/([αεοΑΕΟυΥ])́([ιυΙΥ])(?![̀-ͯ])/g, '$1$2̈');
  t = t.replace(/[́̀͂̓̔ͅ]/g, '');
  return t.normalize('NFC').toUpperCase().normalize('NFC');
}
function foldChar(c) { return c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().charAt(0) || c; }
function fold(s) { return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

// Document language decides (MORE) vs (ΣΥΝΕΧΙΖΕΙ) etc.
function docLang(doc) {
  let gr = 0, la = 0;
  for (const b of (doc.blocks || []).slice(0, 400)) {
    gr += (b.text.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
    la += (b.text.match(/[A-Za-z]/g) || []).length;
  }
  return la > gr ? 'en' : 'el';
}
const WORDS = {
  el: { more: '(ΣΥΝΕΧΙΖΕΙ)', cont: ' (ΣΥΝ.)', cast: 'ΠΡΟΣΩΠΑ' },
  en: { more: '(MORE)', cont: " (CONT'D)", cast: 'CHARACTERS' }
};

/* ---------- rich runs: [{t, b, i, u}] ---------- */
function plainRuns(text) { return [{ t: text || '' }]; }
function runsOf(b) { return b.runs && b.runs.length ? b.runs : plainRuns(b.text); }
function hasFmt(runs) { return runs.some(r => r.b || r.i || r.u); }
function normRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.t) continue;
    const p = out[out.length - 1];
    if (p && !!p.b === !!r.b && !!p.i === !!r.i && !!p.u === !!r.u) p.t += r.t;
    else { const n = { t: r.t }; if (r.b) n.b = 1; if (r.i) n.i = 1; if (r.u) n.u = 1; out.push(n); }
  }
  return out;
}
function sliceRuns(runs, a, b) {
  const out = []; let p = 0;
  for (const r of runs) {
    const s = p, e = p + r.t.length; p = e;
    const x = Math.max(a, s), y = Math.min(b, e);
    if (y > x) out.push({ ...r, t: r.t.slice(x - s, y - s) });
  }
  return out;
}
function mapRunsText(runs, fn) { return runs.map(r => ({ ...r, t: fn(r.t) })); }
function setBlockRuns(b, runs) {
  runs = normRuns(runs);
  b.text = runs.map(r => r.t).join('');
  if (hasFmt(runs)) b.runs = runs; else delete b.runs;
  return b;
}
function runsHTML(runs) {
  return runs.map(r => {
    let h = escHTML(r.t);
    if (r.u) h = '<u>' + h + '</u>';
    if (r.i) h = '<i>' + h + '</i>';
    if (r.b) h = '<b>' + h + '</b>';
    return h;
  }).join('');
}

/* ---------- measuring & wrapping ---------- */
const _cv = document.createElement('canvas').getContext('2d');
function measurer(css, italic) {
  const f = `${italic ? 'italic ' : ''}400 16px ${css}`;
  return (s) => { if (_cv.font !== f) _cv.font = f; return _cv.measureText(s).width; };
}
// -> [{a,b}] character ranges per line
function wrapRanges(text, maxPx, measure) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n && text[i] === ' ') i++;
  if (i >= n) return [{ a: 0, b: 0 }];
  while (i < n) {
    let lastFit = -1, j = i;
    while (j <= n) {
      if (j === n || text[j] === ' ') {
        if (measure(text.slice(i, j)) <= maxPx + 0.5) lastFit = j; else break;
        if (j === n) break;
      }
      j++;
    }
    if (lastFit < 0) {
      let k = i + 1;
      while (k < n && measure(text.slice(i, k + 1)) <= maxPx) k++;
      lastFit = k;
    }
    out.push({ a: i, b: lastFit });
    i = lastFit;
    while (i < n && text[i] === ' ') i++;
  }
  return out;
}

function pageGeom(doc) {
  const p = PAPER[(doc.settings && doc.settings.paper) || 'A4'] || PAPER.A4;
  return { paper: p, textW: p.w - MARGIN.left - MARGIN.right, lines: Math.floor((p.h - MARGIN.top - MARGIN.bottom) * LPI) };
}
function typeSpec(format, t) {
  const F = FORMATS[format] || FORMATS.screen;
  return F.types[t] || F.types[F.def];
}
function blockWidthIn(spec, textW) {
  if (spec.w == null) return textW - spec.ind;
  if (spec.w < 0) return textW + spec.w;
  return spec.w;
}
function displayRuns(b, spec) {
  let r = runsOf(b);
  if (spec.upper) r = mapRunsText(r, greekCaps);
  return r;
}

/* ---------- pagination ----------
   { pages:[[line]], blockPage:[], geom }   line = {runs, t, ind, w, align, italic, underline, sn} | {blank} */
function paginate(doc) {
  const fmt = doc.format || 'screen';
  const g = pageGeom(doc);
  const L = g.lines;
  const W = WORDS[docLang(doc)];
  const font = fontOf(doc);
  const blocks = doc.blocks || [];
  const pages = [[]];
  const blockPage = new Array(blocks.length).fill(1);
  let used = 0, sceneCount = 0;

  const mkLines = (b, overrideRuns) => {
    const spec = typeSpec(fmt, b.t);
    const w = blockWidthIn(spec, g.textW);
    const runs = overrideRuns || displayRuns(b, spec);
    const text = runs.map(r => r.t).join('');
    return wrapRanges(text, w * 96, measurer(font.css, spec.italic)).map(({ a, b: e }) => ({
      runs: sliceRuns(runs, a, e), t: b.t, ind: spec.ind, w, align: spec.align, italic: spec.italic, underline: spec.underline
    }));
  };
  const newPage = () => { pages.push([]); used = 0; };
  const cur = () => pages[pages.length - 1];
  const sbOf = (t) => (used === 0 ? 0 : typeSpec(fmt, t).sb);
  const put = (lines, sb) => {
    for (let i = 0; i < sb; i++) cur().push({ blank: true });
    used += sb;
    for (const l of lines) cur().push(l);
    used += lines.length;
  };
  const cs = typeSpec(fmt, 'character');
  const moreLine = () => ({ runs: plainRuns(W.more), t: 'character', ind: cs.ind, w: blockWidthIn(cs, g.textW), align: cs.align });

  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const spec = typeSpec(fmt, b.t);
    if (spec.pageBreak && used > 0) newPage();

    if (b.t === 'character') {
      let j = i + 1;
      while (j < blocks.length && (blocks[j].t === 'paren' || blocks[j].t === 'dialogue')) j++;
      const body = [];
      for (let k = i + 1; k < j; k++) for (const l of mkLines(blocks[k])) body.push(Object.assign(l, { bi: k }));
      const head = mkLines(b);
      for (let k = i; k < j; k++) blockPage[k] = pages.length;
      const sb = sbOf(b.t);
      if (used + sb + head.length + body.length <= L) { put(head.concat(body), sb); i = j; continue; }

      const avail = L - used - sb - head.length - 1;
      let cut = Math.min(avail, body.length - 2);
      while (cut >= 2 && body[cut - 1].t === 'paren') cut--;
      const contHead = mkLines(b, displayRuns(b, spec).concat([{ t: W.cont }]));
      if (body.length >= 4 && cut >= 2 && used > 0) {
        put(head.concat(body.slice(0, cut), [moreLine()]), sb);
        newPage();
        let chunk = contHead.concat(body.slice(cut));
        while (chunk.length > L) { put(chunk.slice(0, L - 1).concat([moreLine()]), 0); newPage(); chunk = contHead.concat(chunk.slice(L - 1)); }
        const firstCut = new Set(body.slice(0, cut).map(l => l.bi));
        for (let k = i + 1; k < j; k++) if (!firstCut.has(k)) blockPage[k] = pages.length;
        put(chunk, 0);
      } else {
        if (used > 0) newPage();
        for (let k = i; k < j; k++) blockPage[k] = pages.length;
        let chunk = head.concat(body);
        while (chunk.length > L) { put(chunk.slice(0, L), 0); newPage(); chunk = chunk.slice(L); }
        put(chunk, 0);
      }
      i = j;
      continue;
    }

    let lines = mkLines(b);
    if (b.t === 'scene') { sceneCount++; lines[0].sn = sceneCount; }
    let sb = sbOf(b.t);
    if (spec.keep && i + 1 < blocks.length) {
      const nx = blocks[i + 1];
      const need = Math.min(2, mkLines(nx).length) + typeSpec(fmt, nx.t).sb + (nx.t === 'character' ? 2 : 0);
      if (used > 0 && used + sb + lines.length + need > L) { newPage(); sb = 0; }
    }
    blockPage[i] = pages.length;
    if (used + sb + lines.length <= L) { put(lines, sb); i++; continue; }
    const avail = L - used - sb;
    if ((b.t === 'action' || b.t === 'direction' || b.t === 'text') && avail >= 2 && lines.length - avail >= 2) {
      put(lines.slice(0, avail), sb); lines = lines.slice(avail); newPage();
    } else if (used > 0) newPage();
    while (lines.length > L) { put(lines.slice(0, L), 0); newPage(); lines = lines.slice(L); }
    put(lines, 0);
    i++;
  }
  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return { pages, blockPage, geom: g };
}

/* ---------- scenes / characters ---------- */
function sceneList(doc) {
  const out = [];
  let act = 0, sc = 0, scInAct = 0;
  (doc.blocks || []).forEach((b, i) => {
    if (b.t === 'act') { act++; scInAct = 0; out.push({ i, kind: 'act', text: greekCaps(b.text) || 'ACT', act }); }
    if (b.t === 'scene') { sc++; scInAct++; out.push({ i, kind: 'scene', num: sc, numInAct: scInAct, act, text: greekCaps(b.text) || '(untitled)' }); }
  });
  return out;
}
function cleanCharName(s) { return greekCaps(s || '').replace(/\s*\([^)]*\)\s*$/g, '').trim(); }
function characterStats(doc) {
  const m = new Map();
  (doc.blocks || []).forEach((b, i) => {
    if (b.t !== 'character') return;
    const n = cleanCharName(b.text);
    if (!n) return;
    const e = m.get(n) || { name: n, count: 0, first: i };
    e.count++; m.set(n, e);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'el'));
}

/* ---------- print HTML ---------- */
function escHTML(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function titlePageHTML(doc, pageStyle) {
  const meta = doc.meta || {};
  const L = [];
  L.push(`<div class="tp-center" style="top:3.3in">`);
  L.push(`<div class="tp-title">${escHTML(greekCaps(doc.title || ''))}</div>`);
  if (meta.subtitle) L.push(`<div>${escHTML(meta.subtitle)}</div>`);
  L.push(`<div class="tp-gap"></div>`);
  if (meta.credit) L.push(`<div>${escHTML(meta.credit)}</div>`);
  if (meta.author) L.push(`<div class="tp-gap1"></div><div>${escHTML(meta.author).replace(/\n/g, '<br>')}</div>`);
  if (meta.source) L.push(`<div class="tp-gap"></div><div>${escHTML(meta.source)}</div>`);
  L.push(`</div>`);
  if (meta.contact) L.push(`<div class="tp-contact" style="left:${MARGIN.left}in;bottom:${MARGIN.bottom}in">${escHTML(meta.contact).replace(/\n/g, '<br>')}</div>`);
  if (meta.draft) L.push(`<div class="tp-draft" style="right:${MARGIN.right}in;bottom:${MARGIN.bottom}in">${escHTML(meta.draft).replace(/\n/g, '<br>')}</div>`);
  return `<div class="ppage" style="${pageStyle}">${L.join('')}</div>`;
}

function buildPrintHTML(doc) {
  const { pages, geom } = paginate(doc);
  const p = geom.paper;
  const meta = doc.meta || {};
  const lh = 1 / LPI;
  const font = fontOf(doc);
  const pageStyle = `width:${p.w}in;height:${p.h}in;font-family:${font.css.replace(/"/g, "'")};`;
  let html = `<style>@page{size:${p.w}in ${p.h}in;margin:0}</style>`;
  if (doc.settings?.titlePage !== false && doc.title) html += titlePageHTML(doc, pageStyle);
  if (doc.format === 'stage' && meta.cast && meta.cast.trim()) {
    let c = `<div class="tp-cast" style="left:${MARGIN.left}in;top:${MARGIN.top}in;width:${geom.textW}in">`;
    c += `<div class="tp-cast-h">${WORDS[docLang(doc)].cast}</div>`;
    for (const ln of meta.cast.split('\n')) c += `<div>${escHTML(ln) || '&nbsp;'}</div>`;
    c += `</div>`;
    html += `<div class="ppage" style="${pageStyle}">${c}</div>`;
  }
  const showNums = !!doc.settings?.sceneNumbers;
  pages.forEach((lines, pi) => {
    let body = '';
    lines.forEach(l => {
      if (l.blank) { body += `<div class="pl" style="height:${lh}in"></div>`; return; }
      const st = [`height:${lh}in`, `margin-left:${l.ind}in`, `width:${l.w}in`];
      if (l.align) st.push(`text-align:${l.align}`);
      if (l.italic) st.push('font-style:italic');
      if (l.underline) st.push('text-decoration:underline');
      const num = showNums && l.sn ? `<span class="sn" style="left:-${l.ind + 0.9}in">${l.sn}</span><span class="sn" style="left:${geom.textW - l.ind + 0.25}in">${l.sn}</span>` : '';
      body += `<div class="pl" style="${st.join(';')}">${runsHTML(l.runs) || '&nbsp;'}${num}</div>`;
    });
    const pn = pi === 0 ? '' : `<div class="pnum" style="top:0.5in;right:${MARGIN.right}in">${pi + 1}.</div>`;
    html += `<div class="ppage" style="${pageStyle}">${pn}<div class="pbody" style="left:${MARGIN.left}in;top:${MARGIN.top}in;width:${geom.textW}in">${body}</div></div>`;
  });
  return html;
}
