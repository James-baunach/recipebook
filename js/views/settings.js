// Settings: units, web recipe helper, backup/restore, storage.
import { $, esc, toast, download, confirmDialog, modal } from '../util.js';
import { state, saveSettings, exportBackup, importBackup, listItems } from '../store.js';
import { ping } from '../helper.js';

const WORKER_SRC = 'https://github.com/James-baunach/recipebook/blob/main/worker/recipe-helper.js';

export async function render(el) {
  const s = state.settings;
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const recs = [...state.records.values()];
  const nAttempts = recs.reduce((n, r) => n + r.attempts.length, 0);

  el.innerHTML = `
  <section class="settings">
    <h1>Settings</h1>

    <div class="panel">
      <h2>Units</h2>
      <div class="seg" role="group" aria-label="Units">
        <button data-u="us" class="${s.units === 'us' ? 'on' : ''}">US (cups, oz, lb)</button><button data-u="metric" class="${s.units === 'metric' ? 'on' : ''}">Metric (ml, g)</button>
      </div>
    </div>

    <div class="panel">
      <h2>Web recipe helper</h2>
      <p>Lets <b>Compare & build</b> search AllRecipes, Serious Eats, Food Network, Simply Recipes, Taste of Home, Bon Appétit and others, and import recipes from any link. It runs free on your own Cloudflare account.</p>
      <label class="field">Helper URL <input id="wurl" placeholder="https://recipe-helper.yourname.workers.dev" value="${esc(s.workerUrl)}"></label>
      <label class="field">Access key <span class="muted">(optional; only if you set ACCESS_KEY on the helper)</span> <input id="wkey" value="${esc(s.workerKey)}"></label>
      <div class="actions"><button class="btn primary" id="wsave">Save & test</button><span id="wstat" class="muted"></span></div>
      <details class="setup">
        <summary>How to set up the helper (about 5 minutes, free)</summary>
        <ol>
          <li>Go to <b>dash.cloudflare.com</b> and sign up for a free account (or sign in).</li>
          <li>In the left menu choose <b>Compute (Workers) → Workers & Pages</b>, then <b>Create → Create Worker</b> (start from "Hello World").</li>
          <li>Name it <code>recipe-helper</code> and click <b>Deploy</b>.</li>
          <li>Click <b>Edit code</b>. Delete everything in the editor and paste in the contents of <a href="${WORKER_SRC}" target="_blank" rel="noopener">worker/recipe-helper.js</a> (on GitHub: click "Raw", select all, copy).</li>
          <li>Click <b>Deploy</b>. Copy the address shown, something like <code>https://recipe-helper.yourname.workers.dev</code>.</li>
          <li>Paste it into <b>Helper URL</b> above and tap <b>Save & test</b>.</li>
        </ol>
        <p class="hint">Optional: to keep other people from using your helper, add a variable named <code>ACCESS_KEY</code> (Worker → Settings → Variables and Secrets) with any password-like value and enter the same value above. The free plan allows 100,000 requests a day.</p>
      </details>
    </div>

    <div class="panel">
      <h2>Backup & moving devices</h2>
      <p>Your recipes, versions, cook log and photos are saved on this device only. Export a backup file now and then, and use it to move everything to another phone or computer.</p>
      <p class="muted">${recs.length} recipes with your changes · ${nAttempts} cook log entries · ${listItems().length.toLocaleString()} dishes in the catalog</p>
      <div class="actions">
        <button class="btn primary" id="exp">Export backup file</button>
        <label class="btn">Import backup file<input type="file" id="imp" accept=".json,application/json" hidden></label>
      </div>
      ${est ? `<p class="hint">Using ${(est.usage / 1048576).toFixed(1)} MB of storage${persisted ? ' · protected from automatic cleanup' : ''}.</p>` : ''}
    </div>

    <div class="panel">
      <h2>About</h2>
      <p>Recipebook keeps 1,000 starter dinners. They're placeholders to test and improve: every edit is saved as a new version, your cook log tracks each attempt, and you star the version that wins as Final.</p>
      <p class="hint">Bread and dessert sections are planned. Works offline once loaded.</p>
    </div>
  </section>`;

  el.querySelectorAll('[data-u]').forEach((b) => (b.onclick = async () => { await saveSettings({ units: b.dataset.u }); render(el); }));

  $('#wsave', el).onclick = async () => {
    let url = $('#wurl', el).value.trim();
    if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    await saveSettings({ workerUrl: url, workerKey: $('#wkey', el).value.trim() });
    $('#wurl', el).value = url;
    const st = $('#wstat', el);
    if (!url) { st.textContent = 'Helper removed.'; return; }
    st.textContent = 'Testing…';
    try { await ping(); st.textContent = '✓ Connected'; st.className = 'ok'; } catch (e) { st.textContent = '✕ ' + e.message; st.className = 'bad'; }
  };

  $('#exp', el).onclick = async () => {
    const data = await exportBackup();
    download(`recipebook-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    toast('Backup downloaded');
  };
  $('#imp', el).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast("That file isn't a valid backup"); return; }
    const mode = await modal({
      title: 'Import backup',
      body: `<p>Backup from ${esc(new Date(data.exported).toLocaleString())} with ${(data.records || []).length} recipes.</p>
        <p><b>Merge</b> keeps what's on this device and adds or updates from the file (newer edits win).<br><b>Replace</b> wipes this device's recipes, log and photos and uses the file instead.</p>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Replace', value: 'replace', kind: 'danger' }, { label: 'Merge', value: 'merge', kind: 'primary' }],
    });
    if (!mode) return;
    if (mode === 'replace' && !await confirmDialog('Replace everything?', 'This deletes all recipes, versions, cook log entries and photos on this device first. This cannot be undone.', 'Replace', true)) return;
    try {
      const r = await importBackup(data, mode);
      toast(`Imported: ${r.added} new, ${r.updated} updated`);
      render(el);
    } catch (err) { toast(err.message); }
  };
}
