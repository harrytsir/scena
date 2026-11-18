/* Scena — εισαγωγή / εξαγωγή: Fountain, Final Draft (.fdx), Word (.docx), PDF */
'use strict';

const Formats = (() => {
  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const isUpper = (s) => /[A-Za-zΑ-Ωα-ωΆ-ώ]/.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
  const RX_HEADING = /^(\d+[A-Z]?\s+)?(ΕΣΩΤ\.?\/ΕΞΩΤ|ΕΞΩΤ\.?\/ΕΣΩΤ|ΕΣΩΤ|ΕΞΩΤ|ΕΣ\/ΕΞ|INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)[\.\s]/;
  const RX_TRANS = /^(ΚΟΠΗ|ΓΡΗΓΟΡΗ ΚΟΠΗ|ΔΙΑΛΥΣΗ|ΣΒΗΣΙΜΟ|ΑΝΟΙΓΜΑ ΑΠΟ|ΣΒΗΝΕΙ|FADE|CUT TO|SMASH CUT|DISSOLVE|MATCH CUT|JUMP CUT)/;
  const RX_STAGE_TRANS = /^(ΣΚΟΤΑΔΙ|ΑΥΛΑΙΑ|ΦΩΤΑ ΣΒΗΝΟΥΝ|ΦΩΤΑ ΑΝΑΒΟΥΝ|BLACKOUT|CURTAIN|LIGHTS (UP|DOWN|OUT))/;
  const RX_ACT = /^(ΠΡΑΞΗ|ΠΡΑΞΙΣ|ΜΕΡΟΣ|ACT)(?![A-Za-zΑ-Ω])/;
  const RX_SCENE_STAGE = /^(ΣΚΗΝΗ|ΕΙΚΟΝΑ|SCENE)\s+\S{1,14}\.?$/;
  const RX_MORE = /^\((MORE|ΣΥΝΕΧΙΖΕΙ|ΣΥΝΕΧΕΙΑ|ΣΥΝΕΧΙΖΕΤΑΙ)\)$/;
  const RX_CONT = /\s*\((CONT'?D|CONT\.|ΣΥΝ\.?|ΣΥΝΕΧ\.?|ΣΥΝΕΧΕΙΑ)\)\s*$/;
  const RX_INLINE = /^([A-ZΑ-ΩΆΈΉΊΌΎΏΪΫ][A-ZΑ-ΩΆΈΉΊΌΎΏΪΫ0-9 .'’\-]{0,32}?)\s*(\([^)]*\))?\s*[:：]\s*(\S.*)$/;
  const F = (s) => fold(s).trim();

  function headingText(s) {               // καθαρίζει αριθμούς σκηνών (π.χ. «12 ΕΣΩΤ. ... 12»)
    const m = s.trim().match(/^(\d+[A-Z]?)\.?\s+(.*?)(?:\s+\1\.?)?$/);
    return (m ? m[2] : s).trim();
  }

  /* ---------------- κείμενο / Fountain -> μπλοκ ---------------- */
  function parseText(text, format) {
    text = (text || '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\t/g, '    ');
    let lines = text.split('\n');
    const meta = {};
    // σελίδα τίτλου Fountain
    const keyRx = /^(title|credit|author|authors|source|draft date|contact|copyright|notes|τίτλος|συγγραφέας)\s*:\s*(.*)$/i;
    let k = 0; while (k < lines.length && !lines[k].trim()) k++;
    if (k < lines.length && keyRx.test(lines[k].trim())) {
      let key = null;
      for (; k < lines.length; k++) {
        const ln = lines[k];
        if (!ln.trim()) break;
        const m = ln.trim().match(keyRx);
        if (m && !/^\s{2,}/.test(ln)) { key = m[1].toLowerCase(); meta[key] = m[2]; }
        else if (key) meta[key] = (meta[key] ? meta[key] + '\n' : '') + ln.trim();
      }
      lines = lines.slice(k);
    }
    const blocks = [];
    const push = (t, tx) => blocks.push({ t, text: tx.trim() });
    const last = () => blocks[blocks.length - 1];
    const def = format === 'stage' ? 'direction' : 'action';
    let mode = 'none', prevBlank = true;

    const nextNonBlank = (i) => { for (let j = i + 1; j < lines.length; j++) { if (!lines[j].trim()) return null; return lines[j].trim(); } return null; };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const L = raw.trim();
      if (!L) { if (format !== 'stage' || mode !== 'dialogue') mode = 'none'; prevBlank = true; continue; }
      const f = F(L);
      const wasBlank = prevBlank; prevBlank = false;

      if (RX_MORE.test(f) || /^\d+\.?$/.test(L)) continue;
      if (/^=/.test(L) || (/^#/.test(L) && format !== 'stage')) continue;
      if (/^#{1}\s*/.test(L) && format === 'stage' && !/^##/.test(L)) { push('act', L.replace(/^#\s*/, '')); mode = 'none'; continue; }
      if (/^##+\s*/.test(L) && format === 'stage') { push('scene', L.replace(/^#+\s*/, '')); mode = 'none'; continue; }

      if (/^\.[^.]/.test(L)) {
        const tx = L.slice(1);
        if (format === 'stage' && RX_ACT.test(F(tx))) push('act', tx); else push('scene', tx);
        mode = 'none'; continue;
      }
      if (/^>.*<$/.test(L)) { push(def, L.slice(1, -1)); mode = 'none'; continue; }
      if (/^>/.test(L)) { push('trans', L.slice(1)); mode = 'none'; continue; }
      if (/^!/.test(L)) { if (mode === 'none' && last() && last().t === def && !wasBlank) last().text += ' ' + L.slice(1).trim(); else push(def, L.slice(1)); mode = 'none'; continue; }
      if (/^@/.test(L)) { push('character', L.slice(1).replace(/\s*\^$/, '')); mode = 'dialogue'; continue; }
      if (/^~/.test(L)) { push('dialogue', L.slice(1)); continue; }

      if (RX_HEADING.test(f) && (wasBlank || mode === 'none')) {
        push('scene', headingText(L)); mode = 'none'; continue;
      }
      if (format === 'stage') {
        if (RX_ACT.test(f) && L.length < 40 && isUpper(L)) { push('act', L); mode = 'none'; continue; }
        if (RX_SCENE_STAGE.test(f)) { push('scene', L); mode = 'none'; continue; }
        if (RX_STAGE_TRANS.test(f) && isUpper(L) && L.length < 40) { push('trans', L); mode = 'none'; continue; }
        const m = L.match(RX_INLINE);
        if (m && !/^(ΣΚΗΝΗ|ΠΡΑΞΗ)/.test(F(m[1]))) {
          push('character', m[1].trim());
          if (m[2]) push('paren', m[2]);
          let rest = m[3];
          const pm = rest.match(/^(\([^)]*\))\s*(.*)$/);
          if (pm) { push('paren', pm[1]); rest = pm[2]; }
          if (rest) push('dialogue', rest);
          mode = 'dialogue'; continue;
        }
        if (/^\(.*\)$/.test(L) && (mode !== 'dialogue' || wasBlank)) { push('direction', L.replace(/^\(\s*/, '').replace(/\s*\)$/, '')); continue; }
      }
      if (isUpper(L) && L.length < 40 && (/:$/.test(L) && (RX_TRANS.test(f) || /TO:$/.test(L)) || RX_TRANS.test(f) && L.length < 30)) {
        push('trans', L); mode = 'none'; continue;
      }
      const nx = nextNonBlank(i);
      if (isUpper(L.replace(/\(.*\)/, '')) && L.length <= 45 && !/[.!?…]$/.test(L.replace(/\(.*\)$/, '').trim()) && nx && (!isUpper(nx) || /^\(/.test(nx))) {
        push('character', L.replace(/\s*\^$/, '')); mode = 'dialogue'; continue;
      }
      if (mode === 'dialogue') {
        if (/^\(.*\)?$/.test(L) && (!last() || last().t !== 'paren' || /\)$/.test(last().text))) { push('paren', L); continue; }
        if (last() && last().t === 'paren' && !/\)$/.test(last().text)) { last().text += ' ' + L; continue; }
        if (last() && last().t === 'dialogue' && !wasBlank) { last().text += ' ' + L; continue; }
        if (format === 'stage' && wasBlank && last() && last().t === 'dialogue') { push('dialogue', L); continue; }
        if (!wasBlank) { push('dialogue', L); continue; }
        mode = 'none';
      }
      if (last() && last().t === def && !wasBlank) last().text += ' ' + L;
      else push(def, L);
    }
    return { blocks: blocks.filter(b => b.text || b.t === 'dialogue'), meta };
  }

  function guessFromTexts(texts) {
    let sc = 0, st = 0;
    for (const t of texts) {
      const f = F(t);
      if (RX_HEADING.test(f)) sc += 2;
      if (RX_ACT.test(f) && t.length < 40) st += 3;
      if (RX_SCENE_STAGE.test(f)) st += 2;
      if (RX_INLINE.test(t.trim())) st += 0.5;
    }
    return st > sc ? 'stage' : 'screen';
  }

  /* ---------------- μπλοκ -> απλό κείμενο / Fountain ---------------- */
  function linesFor(blocks, format, fountain) {
    const out = [];
    let prev = null;
    for (const b of blocks) {
      let tx = (b.text || '').trim();
      const sp = typeSpec(format, b.t);
      if (sp.upper) tx = greekCaps(tx);
      const tight = (b.t === 'dialogue' || b.t === 'paren') && prev && (prev === 'character' || prev === 'paren' || prev === 'dialogue');
      if (!tight && out.length) out.push('');
      if (fountain) {
        if (b.t === 'scene' || b.t === 'act') tx = (/^(INT|EXT|EST|INT\.\/EXT|I\/E)[.\s]/i.test(tx) ? '' : '.') + tx;
        else if (b.t === 'character') tx = (/^[A-Z0-9 ._\-'()]+$/.test(tx) ? '' : '@') + tx;
        else if (b.t === 'trans') tx = (/^[A-Z ]+TO:$/.test(tx) ? '' : '> ') + tx;
        else if ((b.t === 'action' || b.t === 'direction' || b.t === 'shot') && isUpper(tx)) tx = '!' + tx;
      }
      if (fountain && b.runs) {
        let rr = b.runs; if (sp.upper) rr = mapRunsText(rr, greekCaps);
        const body = rr.map(r => { let t = r.t; if (r.u) t = '_' + t + '_'; if (r.i) t = '*' + t + '*'; if (r.b) t = '**' + t + '**'; return t; }).join('');
        tx = tx.slice(0, tx.length - (b.text || '').trim().length) + body.trim();
      }
      out.push(tx);
      prev = b.t;
    }
    return out;
  }
  function blocksToPlain(blocks, format) { return linesFor(blocks, format, false).join('\n'); }
  function toFountain(doc) {
    const m = doc.meta || {};
    const head = [];
    head.push('Title: ' + (doc.title || ''));
    if (m.credit) head.push('Credit: ' + m.credit);
    if (m.author) head.push('Author: ' + m.author);
    if (m.source) head.push('Source: ' + m.source);
    if (m.draft) head.push('Draft date: ' + m.draft.replace(/\n/g, ' '));
    if (m.contact) head.push('Contact:\n' + m.contact.split('\n').map(l => '    ' + l).join('\n'));
    return head.join('\n') + '\n\n' + linesFor(doc.blocks, doc.format, true).join('\n') + '\n';
  }

  /* ---------------- Final Draft ---------------- */
  const FDX_OUT = {
    screen: { act: 'New Act', scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', trans: 'Transition', shot: 'Shot', text: 'General' },
    stage: { act: 'New Act', scene: 'Scene Heading', direction: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', trans: 'Transition', text: 'General' }
  };
  function toFDX(doc) {
    const map = FDX_OUT[doc.format];
    const P = doc.blocks.map(b => {
      let rr = runsOf(b); if (typeSpec(doc.format, b.t).upper) rr = mapRunsText(rr, greekCaps);
      const T = rr.map(r => { const st = [r.b && 'Bold', r.i && 'Italic', r.u && 'Underline'].filter(Boolean).join('+'); return `<Text${st ? ` Style="${st}"` : ''}>${xmlEsc(r.t)}</Text>`; }).join('') || '<Text></Text>';
      return `    <Paragraph Type="${map[b.t] || 'Action'}">${T}</Paragraph>`;
    }).join('\n');
    const m = doc.meta || {};
    const tp = [];
    const tpP = (tx, al = 'Center') => tp.push(`    <Paragraph Alignment="${al}" Type="General"><Text>${xmlEsc(tx)}</Text></Paragraph>`);
    for (let i = 0; i < 16; i++) tpP('');
    tpP(greekCaps(doc.title || ''));
    if (m.subtitle) tpP(m.subtitle);
    tpP(''); if (m.credit) tpP(m.credit); if (m.author) tpP(m.author);
    if (m.source) { tpP(''); tpP(m.source); }
    for (let i = 0; i < 14; i++) tpP('');
    for (const l of (m.contact || '').split('\n')) if (l) tpP(l, 'Left');
    for (const l of (m.draft || '').split('\n')) if (l) tpP(l, 'Left');
    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${P}
  </Content>
  <TitlePage>
    <Content>
${tp.join('\n')}
    </Content>
  </TitlePage>
</FinalDraft>
`;
  }
  const FDX_IN = { 'scene heading': 'scene', 'action': 'action', 'character': 'character', 'parenthetical': 'paren', 'dialogue': 'dialogue', 'transition': 'trans', 'shot': 'shot', 'general': 'action', 'cast list': 'action', 'new act': 'act', 'end of act': 'trans', 'act': 'act' };
  FDX_IN.general = 'text';
  function parseFDX(xml) {
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    if (d.querySelector('parsererror')) throw new Error('Not a valid Final Draft file');
    const content = d.querySelector('FinalDraft > Content') || d.querySelector('Content');
    const paras = [...content.querySelectorAll(':scope > Paragraph')].map(p => {
      const runs = [...p.querySelectorAll('Text')].map(t => { const st = t.getAttribute('Style') || ''; return { t: t.textContent.replace(/\s+/g, ' '), b: /Bold/.test(st) ? 1 : 0, i: /Italic/.test(st) ? 1 : 0, u: /Underline/.test(st) ? 1 : 0 }; });
      const nr = normRuns(runs);
      return { type: (p.getAttribute('Type') || 'Action').toLowerCase(), text: nr.map(r => r.t).join('').trim(), runs: hasFmt(nr) ? nr : null };
    });
    return paras;
  }

  /* ---------------- Word (.docx) ---------------- */
  const DOCX_STYLE = {
    scene: ['ScSceneHeading', 'Scene Heading'], action: ['ScAction', 'Action'], character: ['ScCharacter', 'Character'],
    paren: ['ScParenthetical', 'Parenthetical'], dialogue: ['ScDialogue', 'Dialogue'], trans: ['ScTransition', 'Transition'],
    shot: ['ScShot', 'Shot'], act: ['ScAct', 'Act'], direction: ['ScStageDirection', 'Stage Direction'], text: ['ScText', 'Text']
  };
  function toDocx(doc) {
    const g = pageGeom(doc);
    const tw = (inch) => Math.round(inch * 1440);
    const fmt = doc.format;
    const pPr = (t, extra = '') => {
      const sp = typeSpec(fmt, t);
      const w = blockWidthIn(sp, g.textW);
      const right = Math.max(0, g.textW - sp.ind - w);
      return `<w:pPr><w:pStyle w:val="${DOCX_STYLE[t][0]}"/>${sp.keep ? '<w:keepNext/>' : ''}${extra}<w:spacing w:before="${sp.sb * 240}" w:after="0" w:line="240" w:lineRule="exact"/><w:ind w:left="${tw(sp.ind)}" w:right="${tw(right)}"/>${sp.align ? `<w:jc w:val="${sp.align}"/>` : ''}</w:pPr>`;
    };
    const run = (tx, sp, r) => { const b = r && r.b, it = (sp && sp.italic) || (r && r.i), u = (sp && sp.underline) || (r && r.u);
      return `<w:r>${b || it || u ? `<w:rPr>${b ? '<w:b/>' : ''}${it ? '<w:i/>' : ''}${u ? '<w:u w:val="single"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(tx)}</w:t></w:r>`; };
    const cp = (txt, jc = 'center', before = 0) => `<w:p><w:pPr><w:spacing w:before="${before}" w:after="0" w:line="240" w:lineRule="exact"/><w:jc w:val="${jc}"/></w:pPr>${txt ? run(txt) : ''}</w:p>`;
    const sz = { A4: [11906, 16838], Letter: [12240, 15840] }[doc.settings?.paper || 'A4'] || [11906, 16838];
    const sect = (inner, header) => `<w:sectPr>${header ? '<w:headerReference w:type="default" r:id="rIdH1"/>' : ''}<w:pgSz w:w="${sz[0]}" w:h="${sz[1]}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/>${inner}<w:titlePg/></w:sectPr>`;
    const m = doc.meta || {};
    let body = '';
    const hasTP = doc.settings?.titlePage !== false;
    if (hasTP) {
      body += cp(greekCaps(doc.title || ''), 'center', 4320).replace('<w:t', '<w:t').replace(/<w:r>/, '<w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr>');
      if (m.subtitle) body += cp(m.subtitle);
      if (m.credit) body += cp(m.credit, 'center', 480);
      if (m.author) body += cp(m.author, 'center', 240);
      if (m.source) body += cp(m.source, 'center', 480);
      const bottom = [...(m.contact || '').split('\n'), ...(m.draft ? ['', ...m.draft.split('\n')] : [])].filter((l, i, a) => l || i < a.length - 1);
      bottom.forEach((l, i) => { body += cp(l, 'left', i === 0 ? 4320 : 0); });
      body += `<w:p><w:pPr>${sect('', false)}</w:pPr></w:p>`;
    }
    if (fmt === 'stage' && m.cast && m.cast.trim()) {
      body += cp(WORDS[docLang(doc)].cast, 'center', 0).replace(/<w:r>/, '<w:r><w:rPr><w:u w:val="single"/></w:rPr>');
      m.cast.split('\n').forEach((l, i) => { body += cp(l, 'left', i === 0 ? 480 : 0); });
      body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    }
    let first = true;
    for (const b of doc.blocks) {
      const sp = typeSpec(fmt, b.t);
      let rr = runsOf(b); if (sp.upper) rr = mapRunsText(rr, greekCaps);
      body += `<w:p>${pPr(b.t, sp.pageBreak && !first ? '<w:pageBreakBefore/>' : '')}${rr.filter(r => r.t).map(r => run(r.t, sp, r)).join('')}</w:p>`;
      first = false;
    }
    body += sect('<w:pgNumType w:start="1"/>', true);

    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
    const styleDefs = Object.entries(DOCX_STYLE).filter(([t]) => FORMATS[fmt].types[t]).map(([t, [id, name]]) => {
      const sp = typeSpec(fmt, t);
      return `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${sp.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${sp.sb * 240}" w:after="0" w:line="240" w:lineRule="exact"/></w:pPr>${sp.upper || sp.italic ? `<w:rPr>${sp.upper ? '<w:caps/>' : ''}${sp.italic ? '<w:i/>' : ''}</w:rPr>` : ''}</w:style>`;
    }).join('');
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${fontOf(doc).word}" w:hAnsi="${fontOf(doc).word}" w:eastAsia="${fontOf(doc).word}" w:cs="${fontOf(doc).word}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="el-GR" w:eastAsia="el-GR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${styleDefs}</w:styles>`;
    const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r></w:p></w:hdr>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(doc.title || '')}</dc:title><dc:creator>${xmlEsc(m.author || '')}</dc:creator></cp:coreProperties>` },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>` },
      { name: 'word/document.xml', data: document },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/header1.xml', data: header }
    ];
    return Zip.write(files);
  }

  async function readDocx(buf) {
    const z = await Zip.read(buf);
    const get = async (n) => z.has(n) ? new TextDecoder().decode(await z.get(n)()) : null;
    const docXml = await get('word/document.xml');
    if (!docXml) throw new Error('No text found in the Word file');
    const stylesXml = await get('word/styles.xml');
    const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const P = (x) => new DOMParser().parseFromString(x, 'application/xml');
    const attr = (el, n) => el ? (el.getAttributeNS(NS, n) || el.getAttribute('w:' + n)) : null;
    const styles = {};
    if (stylesXml) {
      for (const s of P(stylesXml).getElementsByTagNameNS(NS, 'style')) {
        const id = attr(s, 'styleId');
        const name = attr(s.getElementsByTagNameNS(NS, 'name')[0], 'val') || id;
        const ind = s.getElementsByTagNameNS(NS, 'ind')[0];
        const jc = s.getElementsByTagNameNS(NS, 'jc')[0];
        styles[id] = { name, left: ind ? +(attr(ind, 'left') || attr(ind, 'start') || 0) : null, jc: jc ? attr(jc, 'val') : null, italic: s.getElementsByTagNameNS(NS, 'i').length > 0, caps: s.getElementsByTagNameNS(NS, 'caps').length > 0 };
      }
    }
    const d = P(docXml);
    const out = [];
    let blank = true;
    for (const p of d.getElementsByTagNameNS(NS, 'p')) {
      let text = '';
      let italicRuns = 0, runs = 0;
      for (const n of p.getElementsByTagNameNS(NS, '*')) {
        if (n.localName === 't') text += n.textContent;
        else if (n.localName === 'tab') text += '    ';
        else if (n.localName === 'br' && attr(n, 'type') !== 'page') text += '\n';
        else if (n.localName === 'r') { runs++; if (n.getElementsByTagNameNS(NS, 'i').length) italicRuns++; }
      }
      const pPr = p.getElementsByTagNameNS(NS, 'pPr')[0];
      const sid = pPr ? attr(pPr.getElementsByTagNameNS(NS, 'pStyle')[0], 'val') : null;
      const st = sid ? styles[sid] || { name: sid } : {};
      const ind = pPr ? pPr.getElementsByTagNameNS(NS, 'ind')[0] : null;
      const jcEl = pPr ? pPr.getElementsByTagNameNS(NS, 'jc')[0] : null;
      let left = ind ? +(attr(ind, 'left') || attr(ind, 'start') || 0) : (st.left || 0);
      const lead = text.match(/^[  ]*/)[0].length;
      const brk = (pPr && pPr.getElementsByTagNameNS(NS, 'sectPr').length > 0) || [...p.getElementsByTagNameNS(NS, 'br')].some(b => attr(b, 'type') === 'page');
      const jc = jcEl ? attr(jcEl, 'val') : st.jc;
      for (const piece of text.split('\n')) {
        const t = piece.trim();
        if (!t) { blank = true; continue; }
        out.push({ text: (st.caps ? greekCaps(t) : t), ind: left / 1440 + lead * 0.1, align: jc === 'center' ? 'center' : (jc === 'right' || jc === 'end') ? 'right' : null, blank, italic: st.italic || (runs > 0 && italicRuns === runs), style: (st.name || '').toLowerCase(), para: true });
        blank = false;
      }
      if (brk && out.length) out[out.length - 1].brk = true;
    }
    // σχετικές εσοχές: το πιο συχνό ελάχιστο = 0
    const base = Math.min(...out.filter(l => !l.align).map(l => l.ind).concat([0]));
    out.forEach(l => { l.ind -= base; });
    return out;
  }

  /* ---------------- PDF ---------------- */
  async function readPDF(buf) {
    const pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs', location.href).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = [];
    for (let pn = 1; pn <= pdf.numPages; pn++) {
      const page = await pdf.getPage(pn);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const styles = tc.styles || {};
      const items = tc.items.filter(it => it.str).map(it => ({
        s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 12,
        italic: /italic|oblique/i.test((styles[it.fontName] || {}).fontFamily || '') || /italic|oblique/i.test(it.fontName || '')
      }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of items) {
        const ln = lines.find(l => Math.abs(l.y - it.y) < 2.5);
        if (ln) ln.items.push(it); else if (it.s.trim()) lines.push({ y: it.y, items: [it] });
      }
      lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); while (l.items.length && !l.items[0].s.trim()) l.items.shift(); while (l.items.length && !l.items[l.items.length - 1].s.trim()) l.items.pop(); });
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        let text = '', end = null;
        for (const it of l.items) {
          if (end !== null && it.x - end > it.h * 0.12 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
          text += it.s; end = it.x + it.w;
        }
        l.text = text.replace(/\s+/g, ' ').trim();
        l.x = l.items[0].x; l.right = end; l.h = l.items[0].h;
        l.italic = l.items.filter(i => i.s.trim()).every(i => i.italic);
        // αριθμός σκηνής μόνος του στην αρχή
        if (l.items.length > 1 && /^\d+[A-Z]?\.?$/.test(l.items[0].s.trim()) && l.items[1].x - (l.items[0].x + l.items[0].w) > 20) {
          l.x = l.items[1].x; l.text = l.text.replace(/^\d+[A-Z]?\.?\s+/, '');
        }
        const li = l.items[l.items.length - 1], pv = l.items[l.items.length - 2];
        if (pv && /^\d+[A-Z]?\.?$/.test(li.s.trim()) && li.x - (pv.x + pv.w) > 20) {
          l.text = l.text.replace(/\s+\d+[A-Z]?\.?$/, ''); l.right = pv.x + pv.w;
        }
      }
      pages.push({ w: vp.width, h: vp.height, lines });
    }
    // αριστερό περιθώριο: η μικρότερη x που εμφανίζεται συχνά
    const all = pages.flatMap(p => p.lines);
    const buckets = new Map();
    for (const l of all) { const k = Math.round(l.x / 7.2); buckets.set(k, (buckets.get(k) || 0) + 1); }
    const minCount = Math.max(2, all.length * 0.04);
    const cands = [...buckets.entries()].filter(([, c]) => c >= minCount).map(([k]) => k * 7.2);
    const left = cands.length ? Math.min(...cands) : (all.length ? Math.min(...all.map(l => l.x)) : 72);
    const out = [];
    pages.forEach((p, pi) => {
      let prevY = null, lh = null;
      p.lines.forEach((l, li) => {
        // κεφαλίδα: αριθμός σελίδας πάνω/κάτω
        if (/^\d+\.?$/.test(l.text) && (l.y > p.h - 72 || l.y < 60)) return;
        const gap = prevY === null ? 0 : prevY - l.y;
        if (lh === null && gap > 0) lh = gap;
        const blank = prevY === null ? true : gap > (lh || l.h * 1.2) * 1.5;
        if (gap > 0 && (lh === null || gap < lh)) lh = gap;
        prevY = l.y;
        const ind = (l.x - left) / 72;
        const mid = (l.x + l.right) / 2;
        const textMid = (left + (p.w - 72)) / 2;
        let align = null;
        if (ind > 0.4 && (Math.abs(mid - textMid) < 22 || Math.abs(mid - p.w / 2) < 22) && l.text.length < 50) align = 'center';
        else if (l.right > p.w - 100 && ind > 3) align = 'right';
        out.push({ text: l.text, ind, align, blank, italic: l.italic, pageStart: prevY === l.y && li === p.lines.findIndex(x => !/^\d+\.?$/.test(x.text)), page: pi });
      });
    });
    return { lines: out, pages: pages.length };
  }

  /* ---------------- ταξινόμηση γραμμών (PDF / Word) ---------------- */
  const STYLE_MAP = [[/scene ?head|slug|επικεφαλ/, 'scene'], [/^character|χαρακτ|πρόσωπ/, 'character'], [/parenth|παρέν/, 'paren'], [/dialog|διάλογ/, 'dialogue'], [/transition|μετάβ/, 'trans'], [/^shot|πλάν/, 'shot'], [/^act\b|πράξ/, 'act'], [/stage dir|σκην/, 'direction'], [/^action|δράσ/, 'action']];
  function classifyLines(lines, format) {
    const blocks = [];
    const last = () => blocks[blocks.length - 1];
    const push = (t, text, l) => { blocks.push({ t, text, _l: l }); };
    let mode = 'none', lastChar = null;
    const def = format === 'stage' ? 'direction' : 'action';
    for (const l of lines) {
      let tx = l.text.trim(); if (!tx) continue;
      const f = F(tx);
      if (RX_MORE.test(f) || /^(CONTINUED|ΣΥΝΕΧΕΙΑ)[:.]?$/.test(f) || /^\(?(CONTINUED|ΣΥΝΕΧΕΙΑ)\)?$/.test(f)) continue;
      const soft = l.pageStart && last() && !/[.!?…:;»"”)]$/.test(last().text);
      const blank = l.blank && !soft;
      if (blank && format !== 'stage') mode = 'none';

      // στυλ Word με όνομα (Final Draft / Celtx / WriterDuet)
      if (l.style) {
        const sm = STYLE_MAP.find(([rx]) => rx.test(l.style));
        if (sm) {
          let t = sm[1];
          if (format === 'stage' && (t === 'action')) t = 'direction';
          if (format === 'screen' && (t === 'direction')) t = 'action';
          if (t === 'character') { lastChar = cleanCharName(tx); mode = 'dialogue'; }
          push(t, t === 'scene' ? headingText(tx) : tx, l); continue;
        }
      }

      if (format === 'screen') {
        if (RX_HEADING.test(f) && l.ind < 0.8) { push('scene', headingText(tx), l); mode = 'none'; continue; }
        if (isUpper(tx) && (l.align === 'right' || l.ind > 3.2 || (RX_TRANS.test(f) && /[:.]$/.test(tx)))) { push('trans', tx, l); mode = 'none'; continue; }
        if (isUpper(tx.replace(/\(.*?\)/g, '')) && l.ind >= 1.6 && l.ind <= 3.4 && !/^\(/.test(tx)) {
          const name = cleanCharName(tx);
          if (RX_CONT.test(tx) && l.pageStart && lastChar === name && last() && (last().t === 'dialogue' || last().t === 'paren')) { mode = 'dialogue'; continue; }
          push('character', tx.replace(RX_CONT, ''), l); lastChar = name; mode = 'dialogue'; continue;
        }
        if (/^\(/.test(tx) && l.ind >= 1.1 && l.ind < 2.4) { push('paren', tx, l); mode = 'dialogue'; continue; }
        if (last() && last().t === 'paren' && !/\)$/.test(last().text) && l.ind >= 1.1) { last().text += ' ' + tx; continue; }
        if (l.ind >= 0.6 && l.ind < 1.6 && (mode === 'dialogue' || (last() && ['character', 'paren', 'dialogue'].includes(last().t)))) {
          if (last() && last().t === 'dialogue' && (!l.blank || soft) && !l.para) last().text += ' ' + tx; else push('dialogue', tx, l);
          mode = 'dialogue'; continue;
        }
        mode = 'none';
        if (last() && last().t === 'action' && !blank && !l.para) last().text += ' ' + tx; else push('action', tx, l);
        continue;
      }

      // θεατρικό
      if (RX_ACT.test(f) && tx.length < 50 && (isUpper(tx) || l.align === 'center')) { push('act', tx, l); mode = 'none'; continue; }
      if ((RX_SCENE_STAGE.test(f) || (RX_HEADING.test(f) && l.ind < 0.8)) && tx.length < 70) { push('scene', headingText(tx), l); mode = 'none'; continue; }
      if (RX_STAGE_TRANS.test(f) && isUpper(tx) && tx.length < 40) { push('trans', tx, l); mode = 'none'; continue; }
      const im = tx.match(RX_INLINE);
      if (im && !RX_ACT.test(F(im[1])) && !/^(ΣΚΗΝΗ|ΕΙΚΟΝΑ)/.test(F(im[1]))) {
        push('character', im[1].trim(), l); lastChar = cleanCharName(im[1]);
        if (im[2]) push('paren', im[2], l);
        let rest = im[3]; const pm = rest.match(/^(\([^)]*\))\s*(.*)$/);
        if (pm) { push('paren', pm[1], l); rest = pm[2]; }
        if (rest) push('dialogue', rest, l);
        mode = 'dialogue'; continue;
      }
      const upperName = isUpper(tx.replace(/\(.*?\)/g, '')) && tx.length <= 40 && !/[.!?…]$/.test(tx.replace(/\(.*\)$/, '').trim());
      if (upperName && (l.align === 'center' || l.ind < 3)) { push('character', tx.replace(RX_CONT, ''), l); lastChar = cleanCharName(tx); mode = 'dialogue'; continue; }
      if (/^\(/.test(tx) && mode === 'dialogue' && last() && (last().t === 'character' || last().t === 'dialogue') && tx.length < 120 && !l.italic) { push('paren', tx, l); continue; }
      if (last() && last().t === 'paren' && !/\)$/.test(last().text)) { last().text += ' ' + tx; continue; }
      const looksDirection = l.italic || l.ind >= 0.9 || (/^\(.*\)$/.test(tx) && mode !== 'dialogue');
      if (looksDirection) {
        const clean = /^\(.*\)$/.test(tx) && tx.length > 30 ? tx.replace(/^\(\s*/, '').replace(/\s*\)$/, '') : tx;
        if (last() && last().t === 'direction' && !l.blank && !l.para) last().text += ' ' + clean; else push('direction', clean, l);
        mode = 'none'; continue;
      }
      if (mode === 'dialogue') {
        if (last() && last().t === 'dialogue' && (!l.blank || soft) && !l.para) last().text += ' ' + tx; else push('dialogue', tx, l);
        continue;
      }
      if (last() && last().t === 'direction' && !l.blank && !l.para) last().text += ' ' + tx; else push('direction', tx, l);
    }
    return blocks.map(b => ({ t: b.t, text: b.text.replace(/\s+/g, ' ').trim() })).filter(b => b.text);
  }

  // Fountain emphasis: **bold**, *italic*, _underline_
  function emphRuns(text) {
    const rx = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
    const out = []; let last = 0, m;
    while ((m = rx.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      if (m[1]) out.push({ t: m[1], b: 1, i: 1 }); else if (m[2]) out.push({ t: m[2], b: 1 }); else if (m[3]) out.push({ t: m[3], i: 1 }); else out.push({ t: m[4], u: 1 });
      last = rx.lastIndex;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return normRuns(out);
  }
  function withEmph(blocks) {
    return blocks.map(b => { if (!/[*_]/.test(b.text)) return b; const r = emphRuns(b.text); return hasFmt(r) ? { t: b.t, text: r.map(x => x.t).join(''), runs: r } : b; });
  }

  /* ---------------- εισαγωγή αρχείου ---------------- */
  async function importFile(file) {
    const name = file.name || 'αρχείο';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const base = name.replace(/\.[^.]+$/, '');
    const buf = await file.arrayBuffer();
    const asText = () => new TextDecoder('utf-8').decode(buf);

    if (ext === 'scena' || ext === 'json') {
      const doc = JSON.parse(asText());
      if (doc.app !== 'scena' || !Array.isArray(doc.blocks)) throw new Error('Not a Scena file');
      return { kind: 'scena', doc };
    }
    if (ext === 'fdx') {
      const paras = parseFDX(asText());
      const hasStage = paras.some(p => RX_ACT.test(F(p.text)) && p.text.length < 40);
      return {
        kind: 'script', title: base, meta: {}, guess: hasStage && !paras.some(p => p.type === 'scene heading' && RX_HEADING.test(F(p.text))) ? 'stage' : 'screen',
        note: `${paras.length} paragraphs from Final Draft.`,
        build: (fmt) => paras.map(p => {
          let t = FDX_IN[p.type] || 'action';
          if (fmt === 'stage') { if (t === 'action' || t === 'shot') t = 'direction'; if (t === 'scene' && RX_ACT.test(F(p.text))) t = 'act'; }
          else if (t === 'act') t = 'scene';
          return { t, text: p.text, runs: p.runs };
        }).filter(b => b.text)
      };
    }
    if (ext === 'docx') {
      const lines = await readDocx(buf);
      if (!lines.length) throw new Error('The Word file seems to be empty');
      const tp = titleFromLines(lines);
      return {
        kind: 'script', title: tp.title || base, meta: tp.meta, guess: guessFromTexts(lines.map(l => l.text)),
        note: 'Elements are recognised from the Word styles and paragraph indents.',
        build: (fmt) => classifyLines(tp.rest, fmt)
      };
    }
    if (ext === 'pdf') {
      const { lines, pages } = await readPDF(buf);
      if (!lines.length) throw new Error('This PDF has no selectable text (it may be scanned)');
      const tp = titleFromPDF(lines);
      return {
        kind: 'script', title: tp.title || base, meta: tp.meta, guess: guessFromTexts(lines.map(l => l.text)),
        note: `${pages} PDF pages. Elements are recognised from the indents, so a few may need fixing.`,
        build: (fmt) => classifyLines(tp.rest, fmt)
      };
    }
    const text = asText();
    const pre = parseText(text, 'screen');
    return {
      kind: 'script', title: pre.meta.title || pre.meta['τίτλος'] || base,
      meta: { author: pre.meta.author || pre.meta.authors || pre.meta['συγγραφέας'] || '', credit: pre.meta.credit || '', source: pre.meta.source || '', draft: pre.meta['draft date'] || '', contact: pre.meta.contact || '' },
      guess: guessFromTexts(text.split('\n')),
      note: ext === 'fountain' ? 'Fountain file.' : 'Plain text: elements are recognised from how the lines look.',
      build: (fmt) => ext === 'fountain' ? withEmph(parseText(text, fmt).blocks) : parseText(text, fmt).blocks
    };
  }

  function titleFromPDF(lines) {
    const p0 = lines.filter(l => l.page === 0);
    const hasPage2 = lines.some(l => l.page > 0);
    const scriptLike = p0.some(l => RX_HEADING.test(F(l.text)) || RX_ACT.test(F(l.text)) || RX_INLINE.test(l.text)) || p0.length > 25;
    if (!hasPage2 || scriptLike) return { title: '', meta: {}, rest: lines };
    return { ...extractTitle(p0), rest: lines.filter(l => l.page > 0) };
  }
  function titleFromLines(lines) {
    // a title page ends with a section or page break before any scene
    const bi = lines.findIndex(l => l.brk);
    if (bi >= 0 && bi < 30 && !lines.slice(0, bi + 1).some(l => RX_HEADING.test(F(l.text)) || RX_ACT.test(F(l.text)))) {
      return { ...extractTitle(lines.slice(0, bi + 1)), rest: lines.slice(bi + 1) };
    }
    // Word: σελίδα τίτλου = κεντραρισμένες γραμμές στην αρχή πριν από την πρώτη σκηνή/πράξη
    let i = 0;
    while (i < lines.length && i < 20 && !RX_HEADING.test(F(lines[i].text)) && !RX_ACT.test(F(lines[i].text)) && (lines[i].align === 'center' || i > 0 && lines[i].ind < 0.1 && lines.slice(0, i).every(x => x.align === 'center'))) i++;
    if (i === 0 || i >= lines.length - 2 || lines[0].align !== 'center') return { title: '', meta: {}, rest: lines };
    return { ...extractTitle(lines.slice(0, i)), rest: lines.slice(i) };
  }
  function extractTitle(ls) {
    const texts = ls.map(l => l.text.trim()).filter(Boolean);
    const meta = {};
    const title = texts[0] || '';
    const bi = texts.findIndex(t => /^(written by|by|screenplay by|σενάριο|του|της|των|γραμμένο από|θεατρικό)/i.test(t));
    if (bi >= 0) { meta.credit = texts[bi]; if (texts[bi + 1]) meta.author = texts[bi + 1]; }
    const c = ls.filter(l => !l.align && l.ind < 0.5).map(l => l.text).join('\n');
    if (c) meta.contact = c;
    return { title: title.length < 80 ? title : '', meta };
  }

  return { parseText, blocksToPlain, toFountain, toFDX, toDocx, importFile, classifyLines, readDocx, guessFromTexts };
})();
