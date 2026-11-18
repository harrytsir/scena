/* Scena — storage. Windows (Electron): files in Documents/Scena. Tablet / browser: on-device storage. */
'use strict';

const Native = window.scenaNative || null;

const Store = Native ? {
  native: true,
  list: () => Native.list(),
  load: (id) => Native.load(id),
  save: (doc) => Native.save(doc),
  saveSync: (doc) => Native.saveSync(doc),
  remove: (id) => Native.remove(id),
  openFolder: () => Native.openFolder()
} : {
  native: false,
  _k: (id) => 'scena:doc:' + id,
  _idx() { try { return JSON.parse(localStorage.getItem('scena:index') || '{}'); } catch (e) { return {}; } },
  _setIdx(x) { localStorage.setItem('scena:index', JSON.stringify(x)); },
  async list() { return Object.values(this._idx()); },
  async load(id) { const s = localStorage.getItem(this._k(id)); return s ? JSON.parse(s) : null; },
  async save(doc) { this.saveSync(doc); return true; },
  saveSync(doc) {
    localStorage.setItem(this._k(doc.id), JSON.stringify(doc));
    const idx = this._idx();
    idx[doc.id] = summarize(doc);
    this._setIdx(idx);
  },
  async remove(id) {
    localStorage.removeItem(this._k(id));
    const idx = this._idx(); delete idx[id]; this._setIdx(idx);
  },
  openFolder() {}
};

function summarize(doc) {
  return {
    id: doc.id, title: doc.title || 'Untitled', format: doc.format,
    subtitle: doc.meta?.subtitle || '', credit: doc.meta?.credit || '', author: doc.meta?.author || '', font: doc.settings?.font || 'courier',
    updated: doc.updated, created: doc.created,
    pages: doc.stats?.pages || 0, scenes: doc.stats?.scenes || 0
  };
}

// Στο tablet ζητάμε μόνιμη αποθήκευση ώστε ο browser να μη σβήσει δεδομένα
if (!Native && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
