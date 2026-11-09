// Recipe editor. Saving creates a new version unless "update this version" is ticked.
import { $, esc, toast } from '../util.js';
import { getRecipe, addVersion, createCustom, PROTEINS, METHODS, TYPES, DIFFS, listItems, state } from '../store.js';

const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');

export function render(el, { id, isNew, query }) {
  const r = isNew ? null : getRecipe(id, query.get('v') ? +query.get('v') : undefined);
  if (!isNew && !r) { el.innerHTML = '<div class="empty"><h2>Recipe not found</h2></div>'; return; }
  const d = r ? r.data : { name: '', desc: '', cuisine: 'American', protein: 'chicken', methods: ['stovetop'], prep: 15, cook: 30, servings: 4, difficulty: 'easy', type: 'main', ingredients: [], steps: [], notes: '' };
  const cuisines = [...new Set(listItems().map((x) => x.cuisine))].sort();
  const nextV = r ? Math.max(...(r.rec?.versions || [r.version]).map((x) => x.v)) + 1 : 1;
  let dirty = false;

  el.innerHTML = `
  <form class="editor" id="ef">
    <div class="phead"><h1>${isNew ? 'New recipe' : `Edit ${esc(d.name)}`}</h1></div>
    ${r ? `<p class="hint">Editing v${r.v}. Saving creates <b>v${nextV}</b>, so the earlier version stays in your history.</p>` : ''}
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
    <div class="actions sticky">
      <a class="btn" href="${isNew ? '#/' : `#/r/${encodeURIComponent(id)}`}">Cancel</a>
      <button class="btn primary">${isNew ? 'Create recipe' : `Save as v${nextV}`}</button>
    </div>
  </form>`;

  const form = $('#ef', el);
  form.addEventListener('input', () => { dirty = true; });
  if (r) form.replace.onchange = (e) => { form.querySelector('.primary').textContent = e.target.checked ? `Update v${r.v}` : `Save as v${nextV}`; };
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
