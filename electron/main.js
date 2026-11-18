// Scena — Windows app (Electron)
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const UPD = process.env.SCENA_UPD || 'https://raw.githubusercontent.com/harrytsir/scena/main/';
const SC = global.__scena || {
  root: ROOT, vdir: path.join(app.getPath('userData'), 'versions'),
  version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
  read: () => ({}), write: () => {}, good: () => {},
  newer: (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; }
};
let win;
let tagCats = [];
ipcMain.on('ctx-cats', (e, list) => { tagCats = Array.isArray(list) ? list : []; });

protocol.registerSchemesAsPrivileged([
  { scheme: 'scena', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

/* ---------- projects: Documents/Scena ---------- */
const libDir = () => { const d = path.join(app.getPath('documents'), 'Scena'); fs.mkdirSync(d, { recursive: true }); return d; };
const backupDir = () => { const d = path.join(libDir(), '.backups'); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
const findFile = (id) => fs.readdirSync(libDir()).find(f => f.endsWith(`--${id}.scena`));
function summarize(doc) {
  return {
    id: doc.id, title: doc.title || 'Untitled', format: doc.format, updated: doc.updated, created: doc.created,
    pages: doc.stats?.pages || 0, scenes: doc.stats?.scenes || 0,
    subtitle: doc.meta?.subtitle || '', credit: doc.meta?.credit || '', author: doc.meta?.author || '', font: doc.settings?.font || 'courier'
  };
}
function writeDoc(doc) {
  const dir = libDir();
  const name = `${safe(doc.title)}--${doc.id}.scena`;
  const old = findFile(doc.id);
  const target = path.join(dir, name);
  if (old) {                                    // one backup per day of the previous version
    const bk = path.join(backupDir(), `${new Date().toISOString().slice(0, 10)}--${old}`);
    if (!fs.existsSync(bk)) { try { fs.copyFileSync(path.join(dir, old), bk); } catch (e) {} }
  }
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 1), 'utf8');
  fs.renameSync(tmp, target);
  if (old && old !== name) { try { fs.unlinkSync(path.join(dir, old)); } catch (e) {} }
  return true;
}
ipcMain.handle('lib:list', () => {
  const out = [];
  for (const f of fs.readdirSync(libDir())) {
    if (!f.endsWith('.scena')) continue;
    try { out.push(summarize(JSON.parse(fs.readFileSync(path.join(libDir(), f), 'utf8')))); } catch (e) {}
  }
  return out;
});
ipcMain.handle('lib:load', (e, id) => { const f = findFile(id); return f ? JSON.parse(fs.readFileSync(path.join(libDir(), f), 'utf8')) : null; });
ipcMain.handle('lib:save', (e, doc) => writeDoc(doc));
ipcMain.on('lib:saveSync', (e, doc) => { try { writeDoc(doc); e.returnValue = true; } catch (err) { e.returnValue = false; } });
ipcMain.handle('lib:remove', async (e, id) => {
  const f = findFile(id); if (!f) return true;
  try { await shell.trashItem(path.join(libDir(), f)); } catch (err) { fs.unlinkSync(path.join(libDir(), f)); }
  return true;
});
ipcMain.handle('lib:openFolder', () => shell.openPath(libDir()));
ipcMain.handle('file:save', async (e, { name, data, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
});
ipcMain.handle('file:pdf', async (e, { name, paper }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const pdf = await win.webContents.printToPDF({ pageSize: paper === 'Letter' ? 'Letter' : 'A4', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
  fs.writeFileSync(r.filePath, pdf);
  shell.openPath(r.filePath);
  return r.filePath;
});

/* ---------- automatic updates ---------- */
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let updating = null, readyInfo = null;
function notify(m) {
  readyInfo = { version: m.version, notes: m.notes || '' };
  if (win && !win.isDestroyed()) win.webContents.send('update-ready', readyInfo);
}
async function checkUpdate() {
  if (updating) return updating;
  updating = (async () => {
    try {
      const r = await net.fetch(UPD + 'update/manifest.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return { latest: true };
      const m = await r.json();
      const c = SC.read(); c.bad = c.bad || [];
      if (!m.version || !SC.newer(m.version, SC.version) || c.bad.includes(m.version)) return { latest: true };
      const dest = path.join(SC.vdir, m.version);
      if (c.version === m.version && fs.existsSync(path.join(dest, 'electron', 'main.js'))) { notify(m); return { ready: true, version: m.version }; }
      const tmp = dest + '.tmp';
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      for (const [rel, hash] of Object.entries(m.files || {})) {
        if (rel.includes('..')) throw new Error('bad path');
        let buf = null;
        const local = path.join(SC.root, rel);
        if (fs.existsSync(local)) { const b = fs.readFileSync(local); if (sha(b) === hash) buf = b; }
        if (!buf) {
          const rr = await net.fetch(UPD + rel.split('/').map(encodeURIComponent).join('/') + '?v=' + m.version);
          if (!rr.ok) throw new Error('download ' + rel);
          buf = Buffer.from(await rr.arrayBuffer());
          if (sha(buf) !== hash) throw new Error('checksum ' + rel);
        }
        const out = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, buf);
      }
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(tmp, dest);
      const c2 = SC.read(); c2.version = m.version; c2.tries = 0; c2.bad = c2.bad || []; SC.write(c2);
      // keep only the new version and the one running now
      for (const d of fs.readdirSync(SC.vdir)) {
        const full = path.join(SC.vdir, d);
        if (d === 'current.json' || full === dest || full === SC.root) continue;
        try { fs.rmSync(full, { recursive: true, force: true }); } catch (e) {}
      }
      notify(m);
      return { ready: true, version: m.version };
    } catch (e) {
      return { error: String(e.message || e) };
    } finally { updating = null; }
  })();
  return updating;
}
ipcMain.handle('app:version', () => SC.version);
ipcMain.handle('app:check', () => checkUpdate());
ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });

/* ---------- window ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 760, minHeight: 500,
    backgroundColor: '#f4f4f5', title: 'Scena', show: false, autoHideMenuBar: true,
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true }
  });
  win.webContents.session.setSpellCheckerLanguages(['el', 'en-US']);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('scena://app/index.html');
  win.webContents.on('did-finish-load', () => {
    SC.good();
    if (readyInfo) win.webContents.send('update-ready', readyInfo);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('context-menu', (e, p) => {
    const items = [];
    if (p.isEditable) {
      items.push({ label: 'Add note', click: () => win.webContents.send('ctx-add-note') });
      if (tagCats.length) items.push({ label: 'Tag for production', submenu: [
        ...tagCats.map(c => ({ label: c.label, click: () => win.webContents.send('ctx-tag', c.k) })),
        { type: 'separator' }, { label: 'Remove tag', click: () => win.webContents.send('ctx-tag', 'untag') }] });
      items.push({ type: 'separator' });
    }
    for (const s of p.dictionarySuggestions || []) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (p.misspelledWord) items.push({ label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
    items.push({ label: 'Cut', role: 'cut' }, { label: 'Copy', role: 'copy' }, { label: 'Paste', role: 'paste' }, { type: 'separator' }, { label: 'Select all', role: 'selectAll' });
    Menu.buildFromTemplate(items).popup();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('scena', (req) => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || !p) p = '/index.html';
      const file = path.normalize(path.join(APP_DIR, p));
      if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    Menu.setApplicationMenu(null);
    createWindow();
    setTimeout(checkUpdate, 5000);
    setInterval(checkUpdate, 30 * 60 * 1000);
    // also check whenever you come back to the window (at most every 10 minutes)
    let last = Date.now();
    app.on('browser-window-focus', () => { if (Date.now() - last > 10 * 60 * 1000) { last = Date.now(); checkUpdate(); } });
  });
  app.on('window-all-closed', () => app.quit());
}
