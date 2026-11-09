// Compare & build: put several recipes side by side (scaled to the same servings),
// tick the ingredient lines and steps you want from each, edit, save as a new version.
import { $, esc, toast, modal, uid } from '../util.js';
import { getRecipe, state, saveSources, addVersion, saveSettings, listItems } from '../store.js';
import { scaleLine, isHeader, headerText, parseRecipeText, fmtFrac } from '../parse.js';

// Imported pages often write amounts as decimals ("0.25 cup"); show them as fractions.
const tidyQty = (l) => l.replace(/^(\d*\.\d+)(?=\s)/, (m) => fmtFrac(+m));
import { helperReady, searchWeb, fetchRecipe } from '../helper.js';

export function render(el, { id, query }) {
  const r = getRecipe(id, query.get('v') ? +query.get('v') : undefined);
  if (!r) { el.innerHTML = '<div class="empty"><h2>Recipe not found</h2></div>'; return; }
  const d = r.data;
  const nextV = Math.max(...(r.rec?.versions || [r.version]).map((x) => x.v)) + 1;

  let target = +d.servings || 4;
  const mkSource = (o) => ({ sid: uid(), servings: 4, ingredients: [], steps: [], ...o });
  const sources = [mkSource({ kind: 'version', name: d.name, site: `Your v${r.v}`, servings: +d.servings || 4, ingredients: d.ingredients, steps: d.steps, fixed: true })];
  for (const s of r.rec?.sources || []) sources.push(mkSource({ ...s, saved: true }));
  const build = { name: d.name, prep: d.prep, cook: d.cook, note: '', ings: [], steps: [] };
  let drawerOpen = false;
  let saved = false;

  window.leaveGuard = () => (!saved && (build.ings.length || build.steps.length) ? 'Your new version isn\'t saved yet. Leave anyway?' : null);

  const persistSources = () => saveSources(id, sources.filter((s) => s.kind === 'web' || s.kind === 'text').map(({ sid, saved: _s, fixed: _f, ...rest }) => rest));
  const factorOf = (s) => target / (+s.servings || target);
  const units = () => state.settings.units;
  const picked = (key) => build.ings.some((x) => x.key === key) || build.steps.some((x) => x.key === key);

  function togglePick(s, kind, idx) {
    const key = `${s.sid}:${kind}:${idx}`;
    const arr = kind === 'i' ? build.ings : build.steps;
    const at = arr.findIndex((x) => x.key === key);
    if (at >= 0) arr.splice(at, 1);
    else {
      const raw = kind === 'i' ? s.ingredients[idx] : s.steps[idx];
      const text = kind === 'i' && !isHeader(raw) ? scaleLine(raw, factorOf(s), units()) : raw;
      arr.push({ key, text, from: s.sid });
    }
  }

  function pickAll(s, kind) {
    const list = kind === 'i' ? s.ingredients : s.steps;
    const allOn = list.every((_, i) => picked(`${s.sid}:${kind}:${i}`));
    list.forEach((_, i) => { if (allOn === picked(`${s.sid}:${kind}:${i}`)) togglePick(s, kind, i); });
  }

  const colHTML = (s, n) => {
    const f = factorOf(s);
    return `<div class="col" data-sid="${s.sid}">
      <div class="colhead">
        <div class="colnum">${n + 1}</div>
        <div class="coltitle"><b>${esc(s.name)}</b>
          <div class="muted small">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.site || 'Web')} ↗</a>` : esc(s.site || '')} · makes ${s.servings}${Math.abs(f - 1) > 0.01 ? ` · <span class="scaled">×${(Math.round(f * 100) / 100)}</span>` : ''}</div>
        </div>
        ${s.fixed ? '' : `<button class="icon-btn" data-rm="${s.sid}" aria-label="Remove column" title="Remove">✕</button>`}
      </div>
      <div class="colsec"><span>Ingredients</span><button class="linkbtn" data-all="i">all</button></div>
      <ul class="picks">${s.ingredients.map((l, i) => `<li class="pick ${isHeader(l) ? 'hd' : ''} ${picked(`${s.sid}:i:${i}`) ? 'on' : ''}" data-k="i" data-i="${i}">${isHeader(l) ? esc(headerText(l)) : esc(scaleLine(l, f, units()))}</li>`).join('')}</ul>
      <div class="colsec"><span>Steps</span><button class="linkbtn" data-all="s">all</button></div>
      <ol class="picks psteps">${s.steps.map((l, i) => `<li class="pick ${isHeader(l) ? 'hd' : ''} ${picked(`${s.sid}:s:${i}`) ? 'on' : ''}" data-k="s" data-i="${i}">${esc(isHeader(l) ? headerText(l) : l)}</li>`).join('')}</ol>
    </div>`;
  };

  const colNum = (sid) => sources.findIndex((s) => s.sid === sid) + 1;
  const rowHTML = (x, kind, i, n) => `<li class="brow">
      <span class="bsrc" title="From column ${colNum(x.from)}">${colNum(x.from) || '+'}</span>
      ${kind === 'i' ? `<input value="${esc(x.text)}" data-bk="i" data-bi="${i}">` : `<textarea rows="2" data-bk="s" data-bi="${i}">${esc(x.text)}</textarea>`}
      <span class="bbtns"><button class="icon-btn" data-mv="-1" data-bk="${kind}" data-bi="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="icon-btn" data-mv="1" data-bk="${kind}" data-bi="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button class="icon-btn" data-bx="${kind}" data-bi="${i}" aria-label="Remove">✕</button></span>
    </li>`;

  const builderHTML = () => `
    <div class="bhead" id="btoggle"><b>Your new version (v${nextV})</b><span class="muted">${build.ings.length} ingredients · ${build.steps.length} steps</span><span class="chev">${drawerOpen ? '▼' : '▲'}</span></div>
    <div class="bbody">
      <label class="field">Name <input id="bname" value="${esc(build.name)}"></label>
      <div class="brow3"><label class="field">Servings <input type="number" value="${target}" disabled></label><label class="field">Prep min <input id="bprep" type="number" value="${build.prep}"></label><label class="field">Cook min <input id="bcook" type="number" value="${build.cook}"></label></div>
      <h3>Ingredients</h3>
      ${build.ings.length ? '' : '<p class="hint">Tap ingredient lines in any column to add them here.</p>'}
      <ul class="blist">${build.ings.map((x, i) => rowHTML(x, 'i', i, build.ings.length)).join('')}</ul>
      <button class="linkbtn" data-add="i">+ Add a line</button>
      <h3>Steps</h3>
      ${build.steps.length ? '' : '<p class="hint">Tap steps to add them. Edit the wording so the steps fit together.</p>'}
      <ol class="blist">${build.steps.map((x, i) => rowHTML(x, 's', i, build.steps.length)).join('')}</ol>
      <button class="linkbtn" data-add="s">+ Add a step</button>
      <label class="field">What's different in this version? <input id="bnote" value="${esc(build.note)}" placeholder="e.g. AllRecipes sauce + Serious Eats searing method"></label>
      <button class="btn primary wide" id="bsave" ${build.ings.length && build.steps.length ? '' : 'disabled'}>Save as v${nextV}</button>
    </div>`;

  function draw() {
    const colsEl = $('.cols', el);
    const sl = colsEl?.scrollLeft || 0;
    el.innerHTML = `
    <section class="compare">
      <div class="ctop">
        <div class="crumbs"><a href="#/r/${encodeURIComponent(id)}">← ${esc(d.name)}</a></div>
        <h1>Compare & build</h1>
        <p class="hint">Every column is scaled to <b>${target} servings</b> so the amounts line up. Tap lines to add them to your new version, then edit the result.</p>
        <div class="ctools">
          <div class="scaler"><button class="icon-btn" id="tminus" aria-label="Fewer servings">−</button><span><b>${target}</b> servings</span><button class="icon-btn" id="tplus" aria-label="More servings">+</button></div>
          <div class="seg" role="group" aria-label="Units"><button data-u="us" class="${units() === 'us' ? 'on' : ''}">US</button><button data-u="metric" class="${units() === 'metric' ? 'on' : ''}">Metric</button></div>
          <button class="btn accent" id="addweb">🔎 Search the web</button>
          <button class="btn" id="addurl">Paste a link</button>
          <button class="btn" id="addtext">Paste recipe text</button>
          <button class="btn" id="addmine">Add another recipe</button>
        </div>
      </div>
      <div class="cwrap">
        <div class="cols">${sources.map(colHTML).join('')}
          ${sources.length < 2 ? `<div class="col ghost"><p><b>Add recipes to compare.</b></p><p class="hint">Search the web for "${esc(d.name)}", paste a link or the text of a recipe, or pull in one of your versions or another dish.</p><button class="btn accent" id="addweb2">🔎 Search the web</button></div>` : ''}
        </div>
        <aside class="builder ${drawerOpen ? 'open' : ''}" id="builder">${builderHTML()}</aside>
      </div>
    </section>`;
    $('.cols', el).scrollLeft = sl;
  }

  function drawBuilder() {
    const b = $('#builder', el);
    const st = b.querySelector('.bbody')?.scrollTop || 0;
    b.innerHTML = builderHTML();
    b.querySelector('.bbody').scrollTop = st;
    el.querySelectorAll('.col[data-sid]').forEach((col) => {
      col.querySelectorAll('.pick').forEach((li) => li.classList.toggle('on', picked(`${col.dataset.sid}:${li.dataset.k}:${li.dataset.i}`)));
    });
  }

  // ----- events -----
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const col = t.closest('.col[data-sid]');
    if (col) {
      const s = sources.find((x) => x.sid === col.dataset.sid);
      const pick = t.closest('.pick');
      if (pick) { togglePick(s, pick.dataset.k, +pick.dataset.i); drawBuilder(); return; }
      if (t.dataset.all) { pickAll(s, t.dataset.all === 'i' ? 'i' : 's'); drawBuilder(); return; }
      if (t.closest('[data-rm]')) {
        sources.splice(sources.indexOf(s), 1);
        build.ings = build.ings.filter((x) => x.from !== s.sid);
        build.steps = build.steps.filter((x) => x.from !== s.sid);
        if (s.kind === 'web' || s.kind === 'text') await persistSources();
        draw(); return;
      }
    }
    if (t.closest('#btoggle')) { drawerOpen = !drawerOpen; $('#builder', el).classList.toggle('open', drawerOpen); $('#btoggle .chev', el).textContent = drawerOpen ? '▼' : '▲'; return; }
    const mv = t.closest('[data-mv]');
    if (mv) {
      const arr = mv.dataset.bk === 'i' ? build.ings : build.steps;
      const i = +mv.dataset.bi, j = i + +mv.dataset.mv;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      drawBuilder(); return;
    }
    const bx = t.closest('[data-bx]');
    if (bx) { (bx.dataset.bx === 'i' ? build.ings : build.steps).splice(+bx.dataset.bi, 1); drawBuilder(); return; }
    if (t.dataset.add) { (t.dataset.add === 'i' ? build.ings : build.steps).push({ key: 'new:' + uid(), text: '', from: null }); drawBuilder(); $(`#builder [data-bk="${t.dataset.add}"][data-bi="${(t.dataset.add === 'i' ? build.ings : build.steps).length - 1}"]`, el)?.focus(); return; }
    if (t.id === 'tplus' || t.id === 'tminus') { rescaleTo(Math.max(1, target + (t.id === 'tplus' ? 1 : -1))); return; }
    if (t.dataset.u) { await saveSettings({ units: t.dataset.u }); rescaleTo(target, true); return; }
    if (t.id === 'addweb' || t.id === 'addweb2') return addFromWeb();
    if (t.id === 'addurl') return addFromUrl();
    if (t.id === 'addtext') return addFromText();
    if (t.id === 'addmine') return addOther();
    if (t.id === 'bsave') return save();
  });

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bk) (t.dataset.bk === 'i' ? build.ings : build.steps)[+t.dataset.bi].text = t.value;
    else if (t.id === 'bname') build.name = t.value;
    else if (t.id === 'bnote') build.note = t.value;
    else if (t.id === 'bprep') build.prep = +t.value || 0;
    else if (t.id === 'bcook') build.cook = +t.value || 0;
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.bk === 's') return;
    if (e.target.dataset.bk === 'i' || e.target.id === 'bname') drawBuilder();
  });

  // Re-scale picked lines that are still untouched copies when servings or units change.
  function rescaleTo(n, unitsChanged) {
    const old = target;
    target = n;
    for (const x of build.ings) {
      if (!x.from || isHeader(x.text)) continue;
      const s = sources.find((y) => y.sid === x.from);
      const idx = +x.key.split(':')[2];
      const prev = scaleLine(s.ingredients[idx], (unitsChanged ? n : old) / (+s.servings || old), unitsChanged ? (units() === 'us' ? 'metric' : 'us') : units());
      if (x.text === prev) x.text = scaleLine(s.ingredients[idx], factorOf(s), units());
    }
    draw();
  }

  async function addSource(src, persist) {
    sources.push(mkSource(src));
    if (persist) await persistSources();
    draw();
    requestAnimationFrame(() => { const c = $('.cols', el); c.scrollLeft = c.scrollWidth; });
  }

  const fromHelper = (x) => ({ kind: 'web', name: x.name || 'Web recipe', site: x.site || hostOf(x.url), url: x.url, servings: x.servings || target, ingredients: (x.ingredients || []).map(tidyQty), steps: x.steps || [], prep: x.prep, cook: x.cook, fetched: new Date().toISOString() });

  async function addFromWeb() {
    if (!helperReady()) return needHelper();
    let results = [];
    const body = `<form id="wsf" class="addrow"><input id="wsq" value="${esc(d.name)}"><button class="btn primary">Search</button></form><div id="wsr" class="wsr"><p class="hint">Searching…</p></div>`;
    const run = async (w, q) => {
      const box = w.querySelector('#wsr');
      box.innerHTML = '<p class="hint">Searching recipe sites…</p>';
      try {
        const res = await searchWeb(q);
        results = res.results || [];
        box.innerHTML = results.length ? `<p class="hint">Pick up to 5 to import.</p><ul class="wslist">${results.map((x, i) => `<li><label><input type="checkbox" value="${i}"> <span><b>${esc(x.title)}</b><br><small class="muted">${esc(x.site)}</small></span></label><a href="${esc(x.url)}" target="_blank" rel="noopener" class="small">open ↗</a></li>`).join('')}</ul>`
          : '<p>No results. Try a simpler search like "chicken pot pie".</p>';
        if (res.failed?.length) box.insertAdjacentHTML('beforeend', `<p class="hint">Couldn't search: ${esc(res.failed.join(', '))}</p>`);
      } catch (err) { box.innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
    };
    const picks = await modal({
      title: 'Find similar recipes', body, wide: true,
      onOpen: (w) => {
        w.querySelector('#wsf').onsubmit = (e) => { e.preventDefault(); run(w, w.querySelector('#wsq').value); };
        run(w, d.name);
      },
      actions: [{ label: 'Cancel', value: null }, {
        label: 'Import selected', kind: 'primary',
        collect: (w) => {
          const sel = [...w.querySelectorAll('.wslist input:checked')].map((c) => results[+c.value]);
          if (!sel.length) { toast('Tick at least one recipe'); return false; }
          return sel.slice(0, 5);
        },
      }],
    });
    if (!picks) return;
    toast(`Importing ${picks.length} recipe${picks.length > 1 ? 's' : ''}…`);
    const got = await Promise.allSettled(picks.map((p) => fetchRecipe(p.url)));
    let ok = 0;
    got.forEach((g, i) => {
      if (g.status === 'fulfilled' && g.value.ingredients?.length) { sources.push(mkSource(fromHelper({ site: picks[i].site, ...g.value }))); ok++; }
    });
    await persistSources();
    draw();
    const bad = picks.length - ok;
    toast(`Imported ${ok}${bad ? ` · ${bad} had no readable recipe` : ''}`);
  }

  async function addFromUrl() {
    if (!helperReady()) return needHelper();
    const url = await modal({
      title: 'Import from a link', body: '<label class="field">Recipe page address<input id="uurl" type="url" placeholder="https://www.example.com/recipe/..."></label>',
      actions: [{ label: 'Cancel', value: null }, { label: 'Import', kind: 'primary', collect: (w) => w.querySelector('#uurl').value.trim() || false }],
    });
    if (!url) return;
    toast('Importing…');
    try {
      const x = await fetchRecipe(url);
      if (!x.ingredients?.length) throw new Error('No ingredient list found on that page.');
      await addSource(fromHelper(x), true);
    } catch (err) { toast(err.message); }
  }

  async function addFromText() {
    const text = await modal({
      title: 'Paste recipe text', wide: true,
      body: `<p class="hint">Copy a recipe from any site, cookbook or note, including the "Ingredients" and "Instructions" headings, and paste it here.</p><textarea id="ptext" rows="14" placeholder="Grandma's Chili&#10;Serves 6&#10;Ingredients&#10;2 lb ground beef&#10;...&#10;Instructions&#10;1. Brown the beef..."></textarea>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Add column', kind: 'primary', collect: (w) => w.querySelector('#ptext').value.trim() || false }],
    });
    if (!text) return;
    const p = parseRecipeText(text);
    if (!p.ingredients.length && !p.steps.length) { toast("Couldn't find ingredients or steps in that text"); return; }
    await addSource({ kind: 'text', name: p.name || 'Pasted recipe', site: 'Pasted', servings: p.servings, ingredients: p.ingredients, steps: p.steps }, true);
  }

  async function addOther() {
    const versions = (r.rec?.versions || []).filter((x) => x.v !== r.v);
    const names = listItems().filter((x) => x.id !== id).map((x) => x.name).sort();
    const res = await modal({
      title: 'Add another recipe',
      body: `${versions.length ? `<label class="field">One of your versions <select id="ov"><option value="">—</option>${versions.map((x) => `<option value="${x.v}">v${x.v}${x.note ? ' — ' + esc(x.note.slice(0, 40)) : ''}</option>`).join('')}</select></label><p class="muted">or</p>` : ''}
        <label class="field">Any dish in your book <input id="oc" list="ocl" placeholder="Start typing a dish name"><datalist id="ocl">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></label>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Add column', kind: 'primary', collect: (w) => ({ v: w.querySelector('#ov')?.value, name: w.querySelector('#oc').value.trim() }) }],
    });
    if (!res) return;
    if (res.v) {
      const ver = r.rec.versions.find((x) => x.v === +res.v);
      return addSource({ kind: 'version', name: ver.data.name, site: `Your v${ver.v}`, servings: +ver.data.servings, ingredients: ver.data.ingredients, steps: ver.data.steps });
    }
    const it = listItems().find((x) => x.name.toLowerCase() === res.name.toLowerCase());
    if (!it) { if (res.name) toast('No dish with that name'); return; }
    const o = getRecipe(it.id);
    addSource({ kind: 'catalog', name: o.data.name, site: o.rec ? `Your v${o.v}` : 'Starter recipe', servings: +o.data.servings, ingredients: o.data.ingredients, steps: o.data.steps });
  }

  async function needHelper() {
    const go = await modal({
      title: 'Set up the web recipe helper',
      body: `<p>Searching and importing from recipe sites needs the free helper on your Cloudflare account (about 5 minutes, one time). Instructions are in Settings.</p>
        <p>Without it you can still <b>search in a new tab</b>, copy a recipe, and use <b>Paste recipe text</b>.</p>`,
      actions: [{ label: 'Search in new tab', value: 'tab' }, { label: 'Paste text', value: 'text' }, { label: 'Open Settings', value: 'settings', kind: 'primary' }],
    });
    if (go === 'tab') window.open(`https://www.google.com/search?q=${encodeURIComponent(d.name + ' recipe')}`, '_blank', 'noopener');
    if (go === 'text') addFromText();
    if (go === 'settings') { window.leaveGuard = null; location.hash = '#/settings'; }
  }

  async function save() {
    const ings = build.ings.map((x) => x.text.trim()).filter(Boolean);
    const steps = build.steps.map((x) => x.text.trim()).filter(Boolean);
    if (!ings.length || !steps.length) { toast('Add at least one ingredient and one step'); return; }
    const used = [...new Set([...build.ings, ...build.steps].map((x) => sources.find((s) => s.sid === x.from)).filter(Boolean))];
    const autoNote = 'Built from: ' + used.map((s) => s.site && s.kind === 'web' ? `${s.site} (${s.name})` : s.site || s.name).join(' + ');
    const sourceNote = used.filter((s) => s.url).map((s) => `${s.site}: ${s.url}`).join('\n');
    const data = { ...d, name: build.name.trim() || d.name, servings: target, prep: build.prep, cook: build.cook, ingredients: ings, steps, notes: [d.notes, sourceNote && 'Sources:\n' + sourceNote].filter(Boolean).join('\n\n') };
    const v = await addVersion(id, data, { from: 'compare', note: build.note.trim() || autoNote });
    saved = true;
    window.leaveGuard = null;
    toast(`Saved v${v}`);
    location.hash = `#/r/${encodeURIComponent(id)}?v=${v}`;
  }

  draw();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Web'; }
}
