(() => {
  const S = TR.Storage;
  const $ = id => document.getElementById(id);
  const clone = o => JSON.parse(JSON.stringify(o));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  // ── Navigation ──
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
    if (name === 'entry') renderEntry();
    if (name === 'history') renderHistory();
    if (name === 'export') updateExportCount();
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  // ── Entry ──
  function renderEntry() {
    if (!$('entry-date').value) $('entry-date').value = today();
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
    const list = [];
    config.rows.forEach((row, ri) => {
      const values = row.fields.map((_, fi) => $(`in-${ri}-${fi}`).value.trim());
      if (values.every(v => v === '')) return;
      list.push({ date, item: rowName(row), values, ts: Date.now() });
    });
    if (!list.length) { toast('Nothing to save'); return; }
    await S.addEntries(list);
    toast(`Saved ${list.length} item${list.length > 1 ? 's' : ''}`);
    renderEntry();
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
        if (!confirm(`Delete ${e.item} = ${e.values.join(' / ')} on ${e.date}?`)) return;
        await S.deleteEntry(e.id);
        renderHistory();
      };
      const b = el('b', { textContent: e.item });
      box.append(el('div', { className: 'hist-item' }, el('span', {}, b, ': ' + e.values.join(' / ')), del));
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
    const head = ['date', 'item', ...Array.from({ length: width }, (_, i) => 'value' + (i + 1))];
    const lines = [head, ...list.map(e => [e.date, e.item, ...e.values])].map(r => r.map(csvCell).join(','));
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
    show('entry');
  }

  init();
})();
