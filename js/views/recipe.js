// Recipe detail: shown version, scaling, units, cook log, versions.
import { $, esc, fmtMin, fmtDate, stars, toast, confirmDialog } from '../util.js';
import { getRecipe, state, label, PROTEINS, METHODS, TYPES, DIFFS, toggleFavorite, setFinal, deleteVersion, deleteRecord, deleteAttempt, saveSettings, photoURL, statusOf, iconFor } from '../store.js';
import { scaleLine, isHeader, headerText } from '../parse.js';
import { logCookDialog } from './logcook.js';
import { addRecipeToList } from './shopping.js';

export const servingsMemory = new Map();

export function ingredientsHTML(lines, factor, units) {
  return `<ul class="ings">${lines.map((l) => isHeader(l)
    ? `<li class="ihead">${esc(headerText(l))}</li>`
    : `<li>${esc(scaleLine(l, factor, units))}</li>`).join('')}</ul>`;
}

export function stepsHTML(steps) {
  return `<ol class="steps">${steps.map((s) => isHeader(s) ? `<li class="shead">${esc(headerText(s))}</li>` : `<li>${esc(s)}</li>`).join('')}</ol>`;
}

const FROM = { catalog: 'Starter', edit: 'Edited', compare: 'Built from compare', new: 'New', import: 'Imported' };

export async function render(el, { id, query }) {
  const vq = query.get('v') ? +query.get('v') : undefined;
  const r = getRecipe(id, vq);
  if (!r) { el.innerHTML = `<div class="empty"><h2>Recipe not found</h2><p><a href="#/">Back to browse</a></p></div>`; return; }
  const { rec, data: d, v } = r;
  const units = state.settings.units;
  const servings = servingsMemory.get(id + ':' + v) || +d.servings || 4;
  const factor = servings / (+d.servings || 4);
  const status = statusOf(rec);
  const versions = rec?.versions || [r.version];
  const attempts = rec?.attempts || [];
  const photoA = [...attempts].reverse().find((a) => a.photo);
  const isShown = !rec || v === (rec.final ?? versions[versions.length - 1].v);
  const vparam = isShown ? '' : `?v=${v}`;

  el.innerHTML = `
  <article class="recipe">
    <div class="rhead">
      <div class="rhero">${photoA ? `<img id="hero" alt="">` : `<span class="emoji big">${iconFor(d)}</span>`}</div>
      <div class="rtitle">
        <div class="crumbs"><a href="#/">Browse</a> · ${esc(d.cuisine)}</div>
        <h1>${esc(d.name)}</h1>
        <p class="rdesc">${esc(d.desc)}</p>
        <div class="metarow">
          <span><b>Prep</b> ${fmtMin(d.prep)}</span><span><b>Cook</b> ${fmtMin(d.cook)}</span><span><b>Total</b> ${fmtMin(+d.prep + +d.cook)}</span>
          <span>${label(DIFFS, d.difficulty)}</span><span>${label(PROTEINS, d.protein)}</span><span>${label(TYPES, d.type)}</span>
        </div>
        <div class="metarow methods">${(d.methods || []).map((m) => `<span class="tag">${esc(label(METHODS, m))}</span>`).join('')}</div>
      </div>
    </div>

    <div class="vbar">
      <label class="vpick">Version
        <select id="vsel">${versions.map((x) => `<option value="${x.v}" ${x.v === v ? 'selected' : ''}>v${x.v}${rec?.final === x.v ? ' ★ Final' : ''} — ${FROM[x.from] || ''} ${fmtDate(x.created)}</option>`).join('')}</select>
      </label>
      <span class="status s-${status}">${{ final: '★ Final version chosen', testing: 'Testing', untested: 'Untested placeholder' }[status]}</span>
      <button class="icon-btn fav ${rec?.favorite ? 'on' : ''}" id="fav" aria-label="Favorite" title="Favorite">♥</button>
    </div>
    ${!isShown ? `<div class="notice">You're viewing an older version (v${v}). <a href="#/r/${encodeURIComponent(id)}">Show current</a></div>` : ''}

    <div class="actions">
      <a class="btn primary" href="#/r/${encodeURIComponent(id)}/cook${vparam}">▶ Cook mode</a>
      <button class="btn" id="log">✎ Log a cook</button>
      <a class="btn" href="#/r/${encodeURIComponent(id)}/edit${vparam}">Edit → new version</a>
      <a class="btn accent" href="#/r/${encodeURIComponent(id)}/compare${vparam}">⇆ Compare & build</a>
      <button class="btn" id="tolist">+ Shopping list</button>
    </div>

    <div class="rgrid">
      <section class="panel">
        <div class="phead">
          <h2>Ingredients</h2>
          <div class="scaler">
            <button class="icon-btn" id="sminus" aria-label="Fewer servings">−</button>
            <span><b id="sv">${servings}</b> servings</span>
            <button class="icon-btn" id="splus" aria-label="More servings">+</button>
          </div>
          <div class="seg" role="group" aria-label="Units">
            <button data-u="us" class="${units === 'us' ? 'on' : ''}">US</button><button data-u="metric" class="${units === 'metric' ? 'on' : ''}">Metric</button>
          </div>
        </div>
        ${factor !== 1 ? `<p class="hint">Scaled from ${d.servings} servings. <button class="linkbtn" id="sreset">Reset</button></p>` : ''}
        <div id="ings">${ingredientsHTML(d.ingredients, factor, units)}</div>
      </section>
      <section class="panel">
        <h2>Steps</h2>
        ${stepsHTML(d.steps)}
        ${d.notes ? `<div class="notes"><h3>Notes</h3><p>${esc(d.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
        ${r.version.note ? `<p class="hint">v${v} change note: ${esc(r.version.note)}</p>` : ''}
      </section>
    </div>

    <section class="panel">
      <div class="phead"><h2>Cook log</h2><button class="btn small" id="log2">+ Log a cook</button></div>
      ${attempts.length ? `<ul class="attempts">${[...attempts].reverse().map((a) => `
        <li>
          ${a.photo ? `<img class="aphoto" data-photo="${esc(a.photo)}" alt="">` : ''}
          <div class="abody">
            <div class="ahead"><b>${fmtDate(a.date)}</b> · v${a.v} ${a.rating ? stars(a.rating) : ''}</div>
            ${a.notes ? `<p>${esc(a.notes).replace(/\n/g, '<br>')}</p>` : ''}
          </div>
          <button class="icon-btn" data-delatt="${a.id}" aria-label="Delete entry" title="Delete entry">🗑</button>
        </li>`).join('')}</ul>` : `<p class="hint">Each time you cook this, log what you thought (rating, what to change, a photo). It's how you'll decide on your final version.</p>`}
    </section>

    <section class="panel">
      <div class="phead"><h2>Versions</h2>${versions.length > 1 ? `<a class="btn small" href="#/r/${encodeURIComponent(id)}/diff">Compare two versions</a>` : ''}</div>
      <ul class="versions">${[...versions].reverse().map((x) => `
        <li class="${x.v === v ? 'cur' : ''}">
          <div><b>v${x.v}</b> ${rec?.final === x.v ? '<span class="tag final">★ Final</span>' : ''} <span class="muted">${FROM[x.from] || ''} · ${fmtDate(x.created)}</span>
          ${x.note ? `<div class="muted">${esc(x.note)}</div>` : ''}</div>
          <div class="vbtns">
            ${x.v !== v ? `<a class="btn small" href="#/r/${encodeURIComponent(id)}?v=${x.v}">View</a>` : ''}
            <button class="btn small" data-final="${x.v}">${rec?.final === x.v ? 'Unmark final' : '★ Make final'}</button>
            ${versions.length > 1 ? `<button class="icon-btn" data-delv="${x.v}" aria-label="Delete version" title="Delete version">🗑</button>` : ''}
          </div>
        </li>`).join('')}</ul>
      ${rec?.sources?.length ? `<p class="hint">${rec.sources.length} web recipe${rec.sources.length > 1 ? 's' : ''} saved for comparing. <a href="#/r/${encodeURIComponent(id)}/compare">Open compare</a></p>` : ''}
      ${rec ? `<p class="danger-zone"><button class="linkbtn danger" id="reset">${rec.custom ? 'Delete this recipe' : 'Reset to starter recipe (deletes your versions and log)'}</button></p>` : ''}
    </section>
  </article>`;

  if (photoA) photoURL(photoA.photo).then((u) => { if (u && $('#hero', el)) $('#hero', el).src = u; });
  for (const img of el.querySelectorAll('img[data-photo]')) photoURL(img.dataset.photo).then((u) => u && (img.src = u));

  const rerender = () => render(el, { id, query });
  const setServ = (n) => { servingsMemory.set(id + ':' + v, Math.max(1, n)); rerender(); };
  $('#splus', el).onclick = () => setServ(servings + 1);
  $('#sminus', el).onclick = () => setServ(servings - 1);
  $('#sreset', el) && ($('#sreset', el).onclick = () => setServ(+d.servings));
  el.querySelectorAll('.seg [data-u]').forEach((b) => (b.onclick = async () => { await saveSettings({ units: b.dataset.u }); rerender(); }));
  $('#vsel', el).onchange = (e) => { location.hash = `#/r/${encodeURIComponent(id)}?v=${e.target.value}`; };
  $('#fav', el).onclick = async () => { const on = await toggleFavorite(id); toast(on ? 'Added to favorites' : 'Removed from favorites'); rerender(); };
  const log = async () => { if (await logCookDialog(id, v)) rerender(); };
  $('#log', el).onclick = log;
  $('#log2', el).onclick = log;
  $('#tolist', el).onclick = async () => { const n = await addRecipeToList(d, factor); toast(`Added ${n} items to your shopping list`); };

  el.querySelector('.versions').addEventListener('click', async (e) => {
    const f = e.target.closest('[data-final]');
    if (f) { await setFinal(id, +f.dataset.final); toast(getRecipe(id).rec.final ? `v${f.dataset.final} is now your final version` : 'Final mark removed'); location.hash = `#/r/${encodeURIComponent(id)}`; rerender(); return; }
    const dv = e.target.closest('[data-delv]');
    if (dv && await confirmDialog('Delete version?', `Delete v${dv.dataset.delv}? This can't be undone.`, 'Delete', true)) {
      await deleteVersion(id, +dv.dataset.delv);
      location.hash = `#/r/${encodeURIComponent(id)}`;
      rerender();
    }
  });
  el.querySelector('.attempts')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delatt]');
    if (b && await confirmDialog('Delete log entry?', 'Delete this cook log entry and its photo?', 'Delete', true)) { await deleteAttempt(id, b.dataset.delatt); rerender(); }
  });
  $('#reset', el) && ($('#reset', el).onclick = async () => {
    const msg = rec.custom ? 'Delete this recipe, all its versions, cook log and photos? This cannot be undone.' : 'Remove all your versions, cook log entries and photos for this dish and go back to the starter recipe? This cannot be undone.';
    if (!await confirmDialog(rec.custom ? 'Delete recipe?' : 'Reset recipe?', msg, rec.custom ? 'Delete' : 'Reset', true)) return;
    await deleteRecord(id);
    if (rec.custom) location.hash = '#/mine'; else rerender();
  });
}

