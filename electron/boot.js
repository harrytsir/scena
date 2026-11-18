// Scena — starter. Stays in the installation; loads the newest downloaded version if there is one.
// If a new version fails to start 3 times in a row it is marked bad and the previous one is used.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = path.join(__dirname, '..');                      // the installed copy
const VDIR = path.join(app.getPath('userData'), 'versions');  // downloaded versions
const CUR = path.join(VDIR, 'current.json');

const ver = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch (e) { return '0.0.0'; } };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const read = () => { try { return JSON.parse(fs.readFileSync(CUR, 'utf8')); } catch (e) { return {}; } };
const write = (c) => { try { fs.mkdirSync(VDIR, { recursive: true }); fs.writeFileSync(CUR, JSON.stringify(c, null, 1)); } catch (e) {} };

let root = BASE;
const cur = read();
cur.bad = cur.bad || [];
if (cur.version && !cur.bad.includes(cur.version) && newer(cur.version, ver(BASE)) && fs.existsSync(path.join(VDIR, cur.version, 'electron', 'main.js'))) {
  cur.tries = (cur.tries || 0) + 1;
  if (cur.tries > 3) { cur.bad.push(cur.version); cur.tries = 0; }
  else root = path.join(VDIR, cur.version);
  write(cur);
}

global.__scena = {
  root, base: BASE, vdir: VDIR, version: ver(root),
  read, write, newer, ver,
  good() { const c = read(); if (c.tries) { c.tries = 0; write(c); } }
};
require(path.join(root, 'electron', 'main.js'));
