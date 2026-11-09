// Recipe editor. Saving creates a new version unless "update this version" is ticked.
// Also used to review a draft read from a photo (route #/inbox/<id>).
import { $, esc, toast, confirmDialog } from '../util.js';
import { getRecipe, addVersion, createCustom, PROTEINS, METHODS, TYPES, DIFFS, listItems, state, photoURL } from '../store.js';
import { getDraft, removeDraft } from '../inbox.js';

const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
const BLANK = { name: '', desc: '', cuisine: 'American', protein: 'chicken', methods: ['stovetop'], prep: 15, cook: 30, servings: 4, difficulty: 'easy', type: 'main', ingredients: [], steps: [], notes: '' };

export async function render(el, { id, isNew, draftId, query }) {
  let draft = null;
  if (draftId) {
    draft = await getDraft(draftId);
    if (!draft || draft.status !== 'ready') { el.innerHTML = `<div class="empty"><h2>This draft isn't ready</h2><p><a href="#/inbox">Back to the inbox</a></p></div>`; return; }
  }
  const r = isNew || draft ? null : getRecipe(id, query.get('v') ? +query.get('v') : undefined);
  if (!isNew && !draft && !r) { el.innerHTML = '<div class="empty"><h2>Recipe not found</h2></div>'; return; }
  const d = r ? r.data : { ...BLANK, ...(draft?.draft || {}) };
  const items = listItems();
  const cuisines = [...new Set(items.map((x) => x.cuisine))].sort();
  const nextV = r ? Math.max(...(r.rec?.versions || [r.version]).map((x) => x.v)) + 1 : 1;
  let dirty = false;

  const title = draft ? 'Review photo draft' : isNew ? 'New recipe' : `Edit ${esc(d.name)}`;
  el.innerHTML = `
  <form class="editor ${draft ? 'with-photo' : ''}" id="ef">
    <div class="phead"><h1>${title}</h1>${draft ? '<a class="btn small" href="#/inbox">← Inbox</a>' : ''}</div>
    ${r ? `<p class="hint">Editing v${r.v}. Saving creates <b>v${nextV}</b>, so the earlier version stays in your history.</p>` : ''}
    ${draft ? `
    <div class="draftsrc">
      <div class="draftphotos">${draft.photoIds.map((p) => `<img data-photo="${esc(p)}" alt="Recipe photo">`).join('')}</div>
      <p class="hint">Text was read from your photo, so check amounts closely — misread fractions (½ vs 1/2, l vs 1) are the most common slip. The photo is deleted once you add or discard this draft.</p>
      <details><summary>Show the raw text that was read</summary><pre class="rawtext">${esc(draft.text)}</pre></details>
    </div>` : ''}
    <div class="egrid">
      <label class="field wide">Name <input name="name" required value="${esc(d.name)}"></label>
      <label class="field wide">Short description <input name="desc" value="${esc(d.desc)}"></label>
      <label class="field">Cuisine <input name="cuisine" list="cuisines" value="${esc(d.cuisine)}"><datalist id="cuisines">${cuisines.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field">Main protein <select name="protein">${opt(PROTEINS, d.protein)}</select></label>
      <label class="field">Dish type <select name="type">${opt(TYPES, d.type)}</select></label>
      <label class="field">Difficulty <select name="difficulty">${opt(DIFFS, d.difficulty)}</select></label>
      <label class="field">Prep (min) <input name="prep" type="number" min="0" value="${+d.prep || 0}"></label>
      <label class="field">Cook (min) <input name="cook" type="number" min="0" value="${+d.cook || 0}"></label>
      <label class="field">Servings <input name="servings" type="number" min="1" value="${+d.servings || 4}"></label>
    </div>
    <fieldset class="field wide"><legend>Method & equipment</legend>
      <div class="chips">${METHODS.map(([v, t]) => `<label class="chip check"><input type="checkbox" name="methods" value="${v}" ${(d.methods || []).includes(v) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
    </fieldset>
    <label class="field wide">Ingredients <span class="muted">— one per line. Start a line with <code>## </code> for a heading like <code>## Sauce</code>.</span>
      <textarea name="ingredients" rows="12" spellcheck="false">${esc(d.ingredients.join('\n'))}</textarea>
    </label>
    <label class="field wide">Steps <span class="muted">— one step per line.</span>
      <textarea name="steps" rows="12">${esc(d.steps.join('\n'))}</textarea>
    </label>
    <label class="field wide">Notes & tips <textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
    ${r ? `
    <label class="field wide">What changed in this version? <input name="vnote" placeholder="e.g. Halved the salt, added smoked paprika, 10 min longer in the oven"></label>
    <label class="checkline"><input type="checkbox" name="replace"> Just fix v${r.v} instead (typo or small correction, no new version)</label>` : ''}
    ${draft ? `
    <label class="field wide">Or add it as a new version of a dish already in your book <span class="muted">(leave blank to add it as its own recipe)</span>
      <input name="addto" list="dishes" placeholder="Start typing a dish name, e.g. Chicken and Dumplings" autocomplete="off">
      <datalist id="dishes">${items.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
    </label>` : ''}
    <div class="actions sticky">
      ${draft ? '<button type="button" class="btn danger" id="discard">Discard draft</button>' : `<a class="btn" href="${isNew ? '#/' : `#/r/${encodeURIComponent(id)}`}">Cancel</a>`}
      <button class="btn primary">${draft ? 'Add to my book' : isNew ? 'Create recipe' : `Save as v${nextV}`}</button>
    </div>
  </form>`;

  for (const img of el.querySelectorAll('img[data-photo]')) photoURL(img.dataset.photo).then((u) => u && (img.src = u));

  const form = $('#ef', el);
  form.addEventListener('input', () => { dirty = true; });
  if (r) form.replace.onchange = (e) => { form.querySelector('.primary').textContent = e.target.checked ? `Update v${r.v}` : `Save as v${nextV}`; };
  if (draft) {
    form.elements.addto.oninput = (e) => { form.querySelector('.primary').textContent = e.target.value.trim() ? 'Add as new version' : 'Add to my book'; };
    $('#discard', el).onclick = async () => {
      if (!await confirmDialog('Discard draft?', 'Delete this draft and its photo? This cannot be undone.', 'Discard', true)) return;
      dirty = false; window.leaveGuard = null;
      await removeDraft(draftId);
      location.hash = '#/inbox';
    };
  }
  window.leaveGuard = () => (dirty ? 'You have unsaved changes. Leave without saving?' : null);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const lines = (k) => f.get(k).split('\n').map((s) => s.trim()).filter(Boolean);
    const data = {
      name: f.get('name').trim(), desc: f.get('desc').trim(), cuisine: f.get('cuisine').trim() || 'American',
      protein: f.get('protein'), type: f.get('type'), difficulty: f.get('difficulty'),
      prep: +f.get('prep') || 0, cook: +f.get('cook') || 0, servings: +f.get('servings') || 4,
      methods: f.getAll('methods'), ingredients: lines('ingredients'), steps: lines('steps'), notes: f.get('notes').trim(),
    };
    if (!data.name) { toast('Give it a name'); return; }

    if (draft) {
      const targetName = (f.get("addto") || '').trim().toLowerCase();
      let dest;
      if (targetName) {
        const it = items.find((x) => x.name.toLowerCase() === targetName);
        if (!it) { toast('No dish with that name — pick one from the list or leave it blank'); return; }
        const v = await addVersion(it.id, data, { from: 'import', note: 'Added from a recipe photo' });
        dest = `#/r/${encodeURIComponent(it.id)}?v=${v}`;
        toast(`Added as v${v} of ${it.name}`);
      } else {
        const nid = await createCustom(data, state.section);
        dest = `#/r/${encodeURIComponent(nid)}`;
        toast('Added to your book');
      }
      dirty = false; window.leaveGuard = null;
      await removeDraft(draftId);
      location.hash = dest;
      return;
    }

    dirty = false;
    window.leaveGuard = null;
    if (isNew) {
      const nid = await createCustom(data, state.section);
      toast('Recipe created');
      location.hash = `#/r/${encodeURIComponent(nid)}`;
      return;
    }
    const replace = f.get('replace') === 'on';
    const v = await addVersion(id, data, { note: f.get('vnote')?.trim() || '', from: 'edit', replaceV: replace ? r.v : null });
    toast(replace ? `Updated v${v}` : `Saved v${v}`);
    location.hash = `#/r/${encodeURIComponent(id)}?v=${v}`;
  };
}
