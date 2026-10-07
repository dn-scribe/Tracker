// IndexedDB storage. Local only, no sync.
window.TR = window.TR || {};

TR.Storage = (() => {
  const DB_NAME = 'tracker';
  let dbp = null;

  const DEFAULT_CONFIG = {
    rows: [
      { fields: [{ name: 'Weight', def: '' }] },
      { fields: [{ name: 'Heart rate high', def: '' }, { name: 'Heart rate low', def: '' }] },
    ],
  };

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('date', 'date');
        db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  async function getConfig() {
    const c = await tx('meta', 'readonly', s => wrap(s.get('config')));
    return c || JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  const saveConfig = cfg => tx('meta', 'readwrite', s => wrap(s.put(cfg, 'config')));

  const addEntries = list => tx('entries', 'readwrite', s => Promise.all(list.map(e => wrap(s.add(e)))));
  const deleteEntry = id => tx('entries', 'readwrite', s => wrap(s.delete(id)));
  const allEntries = () => tx('entries', 'readonly', s => wrap(s.getAll()));

  // Entries with from <= date <= to (YYYY-MM-DD strings; either bound optional), sorted by date then id.
  async function entriesInRange(from, to) {
    const all = await allEntries();
    return all
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  }

  return { getConfig, saveConfig, addEntries, deleteEntry, allEntries, entriesInRange, DEFAULT_CONFIG };
})();
