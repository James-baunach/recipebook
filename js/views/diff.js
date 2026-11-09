// Compare two of your versions of the same recipe.
import { $, esc, diffLines, fmtMin } from '../util.js';
import { getRecipe } from '../store.js';

function block(title, a, b) {
  const rows = diffLines(a, b);
  if (!rows.some((x) => x.op !== 'same')) return `<h3>${title}</h3><p class="hint">No changes.</p>`;
  return `<h3>${title}</h3><ul class="diff">${rows.map((x) => `<li class="${x.op}">${x.op === 'add' ? '+ ' : x.op === 'del' ? '− ' : ''}${esc(x.text)}</li>`).join('')}</ul>`;
}

export function render(el, { id, query }) {
  const r = getRecipe(id);
  if (!r?.rec || r.rec.versions.length < 2) { el.innerHTML = `<div class="empty"><h2>Only one version so far</h2><p><a href="#/r/${encodeURIComponent(id)}">Back</a></p></div>`; return; }
  const vs = r.rec.versions;
  let a = +(query.get('a') || vs[vs.length - 2].v), b = +(query.get('b') || vs[vs.length - 1].v);
  const sel = (name, cur) => `<select id="${name}">${vs.map((x) => `<option value="${x.v}" ${x.v === cur ? 'selected' : ''}>v${x.v}${r.rec.final === x.v ? ' ★' : ''}</option>`).join('')}</select>`;
  const draw = () => {
    const A = vs.find((x) => x.v === a), B = vs.find((x) => x.v === b);
    const meta = (d) => [`Servings ${d.servings}`, `Prep ${fmtMin(d.prep)}`, `Cook ${fmtMin(d.cook)}`];
    el.innerHTML = `
    <section class="panel">
      <div class="crumbs"><a href="#/r/${encodeURIComponent(id)}">← ${esc(r.data.name)}</a></div>
      <h1>Compare versions</h1>
      <div class="vcompare">From ${sel('va', a)} to ${sel('vb', b)}</div>
      <p class="hint">Green lines were added in v${b}, red lines were removed.</p>
      ${A.data.name !== B.data.name ? `<p>Name: <s>${esc(A.data.name)}</s> → <b>${esc(B.data.name)}</b></p>` : ''}
      ${block('Basics', meta(A.data), meta(B.data))}
      ${block('Ingredients', A.data.ingredients, B.data.ingredients)}
      ${block('Steps', A.data.steps, B.data.steps)}
      ${block('Notes', A.data.notes ? A.data.notes.split('\n') : [], B.data.notes ? B.data.notes.split('\n') : [])}
    </section>`;
    $('#va', el).onchange = (e) => { a = +e.target.value; draw(); };
    $('#vb', el).onchange = (e) => { b = +e.target.value; draw(); };
  };
  draw();
}
