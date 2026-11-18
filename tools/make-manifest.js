// Builds update/manifest.json (version + sha256 of every app file) for automatic updates.
// Usage: node tools/make-manifest.js "What changed"
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
// keep the tablet's offline cache name in step with the version
const swp = path.join(ROOT, 'app', 'sw.js');
fs.writeFileSync(swp, fs.readFileSync(swp, 'utf8').replace(/const CACHE = '[^']*';/, `const CACHE = 'scena-${version}';`));
const files = {};
const walk = (rel) => {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isDirectory()) { for (const f of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, f)); return; }
  if (/\.tmp$/.test(rel)) return;
  files[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
};
['package.json', 'electron', 'app', 'build'].forEach(walk);
fs.mkdirSync(path.join(ROOT, 'update'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'update', 'manifest.json'), JSON.stringify({ version, notes: process.argv[2] || '', date: new Date().toISOString(), files }, null, 1));
console.log(`update/manifest.json: ${version}, ${Object.keys(files).length} files`);
