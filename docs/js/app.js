(() => {
  const S = TR.Storage;
  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const rowName = row => row.fields.map(f => f.name).join(' / ');

  let config = null;   // saved config
  let draft = null;    // config being edited
  let histLimit = 50;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    kids.forEach(k => e.append(k));
    return e;
  }

  // ── Backup ──
  const DAY = 86400000;
  let fileHandle = null; // File System Access handle (desktop Chromium), kept in IndexedDB

  const fmtTime = t => t ? new Date(t).toLocaleString() : 'never';

  async function unsavedCount() {
    const last = (await S.getMeta('lastBackup')) || 0;
    return (await S.allEntries()).filter(e => e.ts > last).length;
  }

  async function refreshBackupUi() {
    const last = await S.getMeta('lastBackup');
    const n = await unsavedCount();
    const banner = $('backup-banner');
    const stale = !last || Date.now() - last > DAY;
    banner.hidden = !(n > 0 && stale);
    banner.textContent = `⚠ ${n} entr${n === 1 ? 'y' : 'ies'} not backed up (last backup: ${last ? fmtTime(last) : 'never'}). Tap to back up.`;
    $('backup-status').textContent = `Last backup: ${fmtTime(last)} · ${n} not backed up`;
    $('btn-auto').hidden = !window.showSaveFilePicker;
    $('auto-status').textContent = window.showSaveFilePicker
      ? (fileHandle ? `Auto-backup file: ${fileHandle.name} (updated after each save)` : 'Auto-backup file: not set')
      : '';
  }

  async function backupJson() {
    return JSON.stringify({
      app: 'tracker', format: 1, exported: new Date().toISOString(),
      config, entries: (await S.allEntries()).map(({ date, time, item, values, ts }) => ({ date, time, item, values, ts })),
    }, null, 1);
  }

  async function writeToHandle(text) {
    const w = await fileHandle.createWritable();
    await w.write(text);
    await w.close();
  }

  // Silent: rewrite the auto-backup file if permission is available.
  async function autoBackup(interactive) {
    if (!fileHandle) return false;
    try {
      let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && interactive) perm = await fileHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      await writeToHandle(await backupJson());
      await S.setMeta('lastBackup', Date.now());
      return true;
    } catch (err) { console.warn('[backup] auto failed', err); return false; }
  }

  async function backupNow() {
    if (await autoBackup(true)) { toast('Backed up to file'); return refreshBackupUi(); }
    const text = await backupJson();
    const name = `tracker-backup-${today()}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        download(name, text, 'application/json');
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled the share sheet — not backed up
      download(name, text, 'application/json');
    }
    await S.setMeta('lastBackup', Date.now());
    toast('Backup created — keep the file somewhere safe');
    refreshBackupUi();
  }

  async function pickAutoFile() {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'tracker-backup.json',
        types: [{ description: 'Tracker backup', accept: { 'application/json': ['.json'] } }],
      });
      await S.setMeta('fileHandle', fileHandle);
      await autoBackup(true);
      toast('Auto-backup enabled');
    } catch (err) { if (err.name !== 'AbortError') toast('Failed: ' + err.message); }
    refreshBackupUi();
  }

  async function restore(file) {
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== 'tracker' || !validConfig(b.config) || !Array.isArray(b.entries)) throw new Error('not a Tracker backup');
      if (!confirm(`Replace ALL current data with this backup (${b.entries.length} entries, exported ${b.exported})?`)) return;
      await S.replaceAll(b.config, b.entries);
      config = b.config;
      await S.setMeta('lastBackup', Date.now());
      toast(`Restored ${b.entries.length} entries`);
      show('entry');
    } catch (err) { toast('Restore failed: ' + err.message); }
  }

  // ── Navigation ──
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
    if (name === 'entry') renderEntry();
    if (name === 'history') renderHistory();
    if (name === 'export') { updateExportCount(); refreshBackupUi(); }
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  // ── Entry ──
  function renderEntry() {
    if (!$('entry-date').value) $('entry-date').value = today();
    $('entry-time').value = nowTime();
    const form = $('entry-form');
    form.textContent = '';
    config.rows.forEach((row, ri) => {
      const wrap = el('div', { className: 'entry-row' });
      const line = el('div', { className: 'row' });
      row.fields.forEach((f, fi) => {
        const id = `in-${ri}-${fi}`;
        const input = el('input', { id, type: 'text', value: f.def || '', autocomplete: 'off' });
        input.inputMode = 'decimal';
        line.append(el('div', {}, el('label', { className: 'field-label', htmlFor: id, textContent: f.name }), input));
      });
      wrap.append(line);
      form.append(wrap);
    });
  }

  async function saveEntry() {
    const date = $('entry-date').value || today();
    const time = $('entry-time').value || nowTime();
    const list = [];
    config.rows.forEach((row, ri) => {
      const values = row.fields.map((_, fi) => $(`in-${ri}-${fi}`).value.trim());
      if (values.every(v => v === '')) return;
      list.push({ date, time, item: rowName(row), values, ts: Date.now() });
    });
    if (!list.length) { toast('Nothing to save'); return; }
    await S.addEntries(list);
    toast(`Saved ${list.length} item${list.length > 1 ? 's' : ''}`);
    renderEntry();
    await autoBackup(true); // click gesture lets the browser re-grant file permission
    refreshBackupUi();
  }

  // ── History ──
  async function renderHistory() {
    const all = (await S.entriesInRange()).reverse();
    const box = $('history-list');
    box.textContent = '';
    if (!all.length) box.append(el('p', { className: 'muted', textContent: 'No entries yet.' }));
    let lastDate = null;
    all.slice(0, histLimit).forEach(e => {
      if (e.date !== lastDate) { box.append(el('div', { className: 'hist-day', textContent: e.date })); lastDate = e.date; }
      const del = el('button', { className: 'btn small danger', textContent: '✕', title: 'Delete' });
      del.onclick = async () => {
        if (!confirm(`Delete ${e.item} = ${e.values.join(' / ')} on ${e.date} ${S.timeOf(e)}?`)) return;
        await S.deleteEntry(e.id);
        renderHistory();
        autoBackup(false);
      };
      const b = el('b', { textContent: e.item });
      const t = el('span', { className: 'muted', textContent: S.timeOf(e) + ' ' });
      box.append(el('div', { className: 'hist-item' }, el('span', {}, t, b, ': ' + e.values.join(' / ')), del));
    });
    $('btn-more').hidden = all.length <= histLimit;
  }

  // ── Export ──
  async function updateExportCount() {
    const list = await S.entriesInRange($('exp-from').value, $('exp-to').value);
    $('exp-count').textContent = `${list.length} entr${list.length === 1 ? 'y' : 'ies'} selected`;
  }

  function csvCell(v) {
    v = String(v ?? '');
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function download(name, text, type) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function exportCsv() {
    const from = $('exp-from').value, to = $('exp-to').value;
    const list = await S.entriesInRange(from, to);
    const width = Math.max(1, ...list.map(e => e.values.length));
    const head = ['date', 'time', 'item', ...Array.from({ length: width }, (_, i) => 'value' + (i + 1))];
    const lines = [head, ...list.map(e => [e.date, S.timeOf(e), e.item, ...e.values])].map(r => r.map(csvCell).join(','));
    const suffix = from || to ? `${from || 'start'}_${to || 'end'}` : 'all';
    download(`tracker-${suffix}.csv`, lines.join('\r\n') + '\r\n', 'text/csv');
    toast(`Exported ${list.length} entries`);
  }

  // ── Settings / config ──
  function renderSettings() {
    draft = clone(config);
    renderCfgRows();
    $('ver').textContent = 'v' + TR.Version.current;
    const log = $('changelog');
    log.textContent = '';
    TR.Version.changelog.forEach(c => {
      log.append(el('div', { className: 'changelog-ver', textContent: `v${c.version} — ${c.date}` }));
      log.append(el('ul', {}, ...c.items.map(i => el('li', { textContent: i }))));
    });
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => {
        $('persist-info').textContent = p
          ? 'Persistent storage: granted (browser will not evict data automatically).'
          : 'Persistent storage: NOT granted — browser may evict data. Install the app to home screen and keep backups.';
      });
    }
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        $('storage-info').textContent = `Storage: ${(usage / 1048576).toFixed(2)} MB used of ${Math.round(quota / 1048576)} MB`;
      });
    }
  }

  function renderCfgRows() {
    const box = $('cfg-rows');
    box.textContent = '';
    draft.rows.forEach((row, ri) => {
      const card = el('div', { className: 'cfg-row' });
      row.fields.forEach(f => {
        const name = el('input', { type: 'text', value: f.name, placeholder: 'Name' });
        name.oninput = () => { f.name = name.value; };
        const def = el('input', { type: 'text', value: f.def || '', placeholder: 'Default' });
        def.oninput = () => { f.def = def.value; };
        card.append(el('div', { className: 'cfg-field' }, name, def));
      });
      const act = el('div', { className: 'cfg-actions' });
      const btn = (text, fn, disabled, cls = '') => {
        const b = el('button', { className: 'btn small ' + cls, textContent: text, disabled });
        b.onclick = fn; act.append(b);
      };
      const move = d => () => { const [r] = draft.rows.splice(ri, 1); draft.rows.splice(ri + d, 0, r); renderCfgRows(); };
      btn('▲', move(-1), ri === 0);
      btn('▼', move(1), ri === draft.rows.length - 1);
      if (row.fields.length === 1) {
        const next = draft.rows[ri + 1];
        btn('Merge with next', () => {
          next.fields.forEach(f => row.fields.push(f));
          draft.rows.splice(ri + 1, 1);
          renderCfgRows();
        }, !next || next.fields.length !== 1 || row.fields.length !== 1);
      } else {
        btn('Split', () => {
          draft.rows.splice(ri + 1, 0, { fields: [row.fields.pop()] });
          renderCfgRows();
        });
      }
      btn('Delete', () => { draft.rows.splice(ri, 1); renderCfgRows(); }, false, 'danger');
      card.append(act);
      box.append(card);
    });
  }

  async function saveCfg() {
    const rows = draft.rows.filter(r => r.fields.some(f => f.name.trim()));
    rows.forEach(r => r.fields.forEach(f => { f.name = f.name.trim() || '?'; }));
    if (!rows.length) { toast('Add at least one field'); return; }
    config = { rows };
    await S.saveConfig(config);
    toast('Form saved');
    renderSettings();
  }

  function validConfig(c) {
    return c && Array.isArray(c.rows) && c.rows.length &&
      c.rows.every(r => Array.isArray(r.fields) && r.fields.length >= 1 && r.fields.length <= 2 &&
        r.fields.every(f => typeof f.name === 'string'));
  }

  async function importCfg(file) {
    try {
      const c = JSON.parse(await file.text());
      if (!validConfig(c)) throw new Error('not a valid config');
      if (!confirm('Replace the current form with the imported one?')) return;
      config = { rows: c.rows.map(r => ({ fields: r.fields.map(f => ({ name: f.name, def: String(f.def ?? '') })) })) };
      await S.saveConfig(config);
      toast('Config imported');
      renderSettings();
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  }

  async function clearCache() {
    if (!confirm('Clear app cache and reload? Your data is kept.')) return;
    if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister()));
    location.reload();
  }

  // ── Init ──
  async function init() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    config = await S.getConfig();
    fileHandle = (await S.getMeta('fileHandle')) || null;
    document.querySelectorAll('.tab').forEach(t => { t.onclick = () => show(t.dataset.screen); });
    $('header-title').textContent = `Tracker v${TR.Version.current}`;
    $('btn-save').onclick = saveEntry;
    $('btn-more').onclick = () => { histLimit += 50; renderHistory(); };
    $('exp-from').onchange = $('exp-to').onchange = updateExportCount;
    $('btn-export').onclick = exportCsv;
    $('btn-add-row').onclick = () => { draft.rows.push({ fields: [{ name: '', def: '' }] }); renderCfgRows(); };
    $('btn-save-cfg').onclick = saveCfg;
    $('btn-cfg-export').onclick = () => download('tracker-config.json', JSON.stringify(config, null, 2), 'application/json');
    $('btn-cfg-import').onclick = () => $('cfg-file').click();
    $('cfg-file').onchange = e => { if (e.target.files[0]) importCfg(e.target.files[0]); e.target.value = ''; };
    $('btn-clear-cache').onclick = clearCache;
    $('btn-backup').onclick = backupNow;
    $('backup-banner').onclick = backupNow;
    $('btn-auto').onclick = pickAutoFile;
    $('btn-restore').onclick = () => $('restore-file').click();
    $('restore-file').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
    show('entry');
    refreshBackupUi();
  }

  init();
})();
