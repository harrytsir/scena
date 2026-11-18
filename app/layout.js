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
function hasFmt(runs) { return runs.some(r => r.b || r.i || r.u || r.c || r.g); }
function normRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.t) continue;
    const p = out[out.length - 1];
    if (p && !!p.b === !!r.b && !!p.i === !!r.i && !!p.u === !!r.u && (p.c || '') === (r.c || '') && (p.g || '') === (r.g || '')) p.t += r.t;
    else { const n = { t: r.t }; if (r.b) n.b = 1; if (r.i) n.i = 1; if (r.u) n.u = 1; if (r.c) n.c = r.c; if (r.g) n.g = r.g; out.push(n); }
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
function runsHTML(runs, inEditor) {
  return runs.map(r => {
    let h = escHTML(r.t);
    if (r.u) h = '<u>' + h + '</u>';
    if (r.i) h = '<i>' + h + '</i>';
    if (r.b) h = '<b>' + h + '</b>';
    if (inEditor && r.g) h = `<span data-g="${r.g}">${h}</span>`;
    if (inEditor && r.c) h = `<span data-c="${r.c}">${h}</span>`;
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
        if (measure(text.slice(i, j)) <= maxPx + 0.01) lastFit = j; else break;
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

  // Same rules as the on-screen pages: elements are never split; a heading, character or
  // parenthetical moves to the next page together with what follows it.
  const all = blocks.map(b => mkLines(b));
  all.forEach((ls, k) => { if (blocks[k].t === 'scene') { sceneCount++; ls[0].sn = sceneCount; } });
  const sbAt = (k) => typeSpec(fmt, blocks[k].t).sb;
  for (let k = 0; k < blocks.length; k++) {
    const spec = typeSpec(fmt, blocks[k].t);
    let lines = all[k];
    let need = (used === 0 ? 0 : spec.sb) + lines.length;
    if (spec.keep) { let j = k + 1; while (j < blocks.length) { need += sbAt(j) + all[j].length; if (!typeSpec(fmt, blocks[j].t).keep) break; j++; } need = Math.min(need, L); }
    if (used > 0 && ((spec.pageBreak && k > 0) || used + need > L)) newPage();
    blockPage[k] = pages.length;
    let sb = sbOf(blocks[k].t);
    while (used + sb + lines.length > L && lines.length > L - used - sb) {   // longer than a whole page
      const fit = Math.max(1, L - used - sb);
      put(lines.slice(0, fit), sb); lines = lines.slice(fit); newPage(); sb = 0;
    }
    put(lines, sb);
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
  html += frontMatterHTML(doc, pageStyle, geom);
  const showNums = !!doc.settings?.sceneNumbers;
  if (!doc._noScript) pages.forEach((lines, pi) => {
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

/* Author's note, logline, synopsis, treatment: own pages, unnumbered, only when chosen */
const FRONT_HEAD = {
  note: { el: 'ΣΗΜΕΙΩΜΑ', en: 'AUTHOR’S NOTE' }, synopsis: { el: 'ΠΕΡΙΛΗΨΗ', en: 'SYNOPSIS' }, treatment: { el: 'TREATMENT', en: 'TREATMENT' }
};
function frontSections(doc) {
  const P = doc.pages || {}, lang = docLang(doc), out = [];
  if (P.note && P.note.include && P.note.text.trim()) out.push([{ h: FRONT_HEAD.note[lang], text: P.note.text }]);
  if (P.logline && P.logline.include && (P.logline.logline.trim() || P.logline.tagline.trim())) {
    const s = [];
    if (P.logline.logline.trim()) s.push({ h: 'LOGLINE', text: P.logline.logline });
    if (P.logline.tagline.trim()) s.push({ h: 'TAGLINE', text: P.logline.tagline });
    out.push(s);
  }
  for (const k of ['synopsis', 'treatment']) if (P[k] && P[k].include && P[k].text.trim()) out.push([{ h: FRONT_HEAD[k][lang], text: P[k].text }]);
  return out;
}
function frontMatterHTML(doc, pageStyle, geom) {
  const L = geom.lines, lh = 1 / LPI, font = fontOf(doc);
  const meas = measurer(font.css, false);
  let html = '';
  for (const sec of frontSections(doc)) {
    const lines = [];
    sec.forEach((part, pi) => {
      if (pi) lines.push(null, null, null);
      lines.push({ t: part.h, center: true }, null, null);
      part.text.replace(/\r/g, '').split('\n').forEach((para, k, arr) => {
        if (!para.trim()) { lines.push(null); return; }
        for (const r of wrapRanges(para, geom.textW * 96, meas)) lines.push({ t: para.slice(r.a, r.b) });
      });
    });
    for (let i = 0; i < lines.length; i += L) {
      const chunk = lines.slice(i, i + L);
      const body = chunk.map(l => l ? `<div class="pl" style="height:${lh}in;width:${geom.textW}in;${l.center ? 'text-align:center;text-decoration:underline' : ''}">${escHTML(l.t) || '&nbsp;'}</div>` : `<div class="pl" style="height:${lh}in"></div>`).join('');
      html += `<div class="ppage" style="${pageStyle}"><div class="pbody" style="left:${MARGIN.left}in;top:${MARGIN.top}in;width:${geom.textW}in">${body}</div></div>`;
    }
  }
  return html;
}

/* lines each element takes on the page (with the blank lines before it) — for page counts in eighths */
function blockLines(doc) {
  const g = pageGeom(doc), font = fontOf(doc), fmt = doc.format || 'screen';
  return (doc.blocks || []).map((b, i) => {
    const spec = typeSpec(fmt, b.t);
    const text = displayRuns(b, spec).map(r => r.t).join('');
    return wrapRanges(text, blockWidthIn(spec, g.textW) * 96, measurer(font.css, spec.italic)).length + (i ? spec.sb : 0);
  });
}
function eighths(lines, perPage) {
  const e = Math.max(1, Math.round(lines / perPage * 8));
  const w = Math.floor(e / 8), r = e % 8;
  return (w ? w + (r ? ' ' : '') : '') + (r ? r + '/8' : '');
}
