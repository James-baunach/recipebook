// "What's in my fridge": rank dishes by how few extra ingredients they need.
import { $, esc } from '../util.js';
import { listItems, getKV, setKV, saveSettings, state, TYPES } from '../store.js';
import { singular } from '../parse.js';
import { renderCardList } from './cards.js';

export const STAPLE = /(?:^|\b)(?:kosher salt|sea salt|salt|black pepper|white pepper|pepper$|^pepper|oil|cooking spray|butter$|unsalted butter|salted butter|flour|all-purpose flour|sugar|brown sugar|powdered sugar|water|ice|garlic powder|onion powder|paprika|smoked paprika|cumin|chili powder|dried \w+|oregano|bay lea(?:f|ves)|cinnamon|cayenne|red pepper flakes|baking soda|baking powder|cornstarch|vinegar|soy sauce|ketchup|mustard|dijon mustard|hot sauce|worcestershire(?: sauce)?|honey|seasoning|nutmeg|ground (?:cumin|coriander|ginger|cinnamon|nutmeg|cloves|allspice|turmeric|cardamom|mustard)|italian seasoning|cajun seasoning|old bay|garlic salt|seasoned salt|mayonnaise|black peppercorns)(?:\b|$)/;

const norm = (s) => s.toLowerCase().trim().split(/\s+/).map(singular).join(' ');

function matches(term, name) {
  const n = norm(name);
  return n.includes(term) || (n.length > 3 && term.includes(n));
}

export async function render(el) {
  let have = await getKV('fridge', []);
  let type = '', maxMissing = 3;

  el.innerHTML = `
  <section class="fridge">
    <h1>What's in my fridge?</h1>
    <p class="hint">Add what you have and dishes are ranked by how few extra ingredients they need.</p>
    <form class="addrow" id="ff"><input id="fi" placeholder="e.g. chicken thighs, rice, broccoli, cheddar" autocomplete="off"><button class="btn primary">Add</button></form>
    <div class="chips" id="have"></div>
    <div class="fopts">
      <label class="checkline"><input type="checkbox" id="pantry" ${state.settings.pantry ? 'checked' : ''}> I have pantry basics (salt, pepper, oil, butter, flour, sugar, common spices & condiments)</label>
      <label>Dish type <select id="ftype"><option value="">All</option>${TYPES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
      <label>Missing at most <select id="fmax"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="5">5</option><option value="99">any</option></select></label>
    </div>
    <div id="fcount" class="resulthead"></div>
    <div id="fres"></div>
  </section>`;

  const draw = () => {
    $('#have', el).innerHTML = have.map((h, i) => `<button class="chip on removable" data-i="${i}">${esc(h)} ✕</button>`).join('') + (have.length ? `<button class="chip" id="hclear">Clear</button>` : '');
    if (!have.length) { $('#fcount', el).textContent = ''; $('#fres', el).innerHTML = '<div class="empty small">Add a few ingredients to get ideas.</div>'; return; }
    const terms = have.map(norm);
    const pantry = state.settings.pantry;
    const scored = [];
    for (const it of listItems()) {
      if (type && it.type !== type) continue;
      const req = [...new Set(it.ingNames)].filter((n) => !(pantry && STAPLE.test(n)));
      if (!req.length) continue;
      const got = [], miss = [];
      for (const n of req) (terms.some((t) => matches(t, n)) ? got : miss).push(n);
      if (!got.length || miss.length > maxMissing) continue;
      scored.push({ it, got, miss });
    }
    scored.sort((a, b) => a.miss.length - b.miss.length || b.got.length - a.got.length || a.it.name.localeCompare(b.it.name));
    $('#fcount', el).textContent = `${scored.length} ${scored.length === 1 ? 'dish' : 'dishes'}`;
    const info = new Map(scored.map((s) => [s.it.id, s]));
    renderCardList($('#fres', el), scored.map((s) => s.it), {
      empty: 'Nothing matches yet. Try adding more ingredients or allow more missing items.',
      extra: (it) => {
        const s = info.get(it.id);
        return `<div class="cdesc"><span class="have">Have ${s.got.length} of ${s.got.length + s.miss.length}</span>${s.miss.length ? ` · need: ${esc(s.miss.slice(0, 6).join(', '))}${s.miss.length > 6 ? '…' : ''}` : ' · nothing extra to buy'}</div>`;
      },
    });
  };

  $('#ff', el).onsubmit = async (e) => {
    e.preventDefault();
    const vals = $('#fi', el).value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const v of vals) if (!have.includes(v)) have.push(v);
    $('#fi', el).value = '';
    await setKV('fridge', have);
    draw();
  };
  $('#have', el).onclick = async (e) => {
    if (e.target.id === 'hclear') have = [];
    else { const c = e.target.closest('[data-i]'); if (!c) return; have.splice(+c.dataset.i, 1); }
    await setKV('fridge', have);
    draw();
  };
  $('#pantry', el).onchange = async (e) => { await saveSettings({ pantry: e.target.checked }); draw(); };
  $('#ftype', el).onchange = (e) => { type = e.target.value; draw(); };
  $('#fmax', el).onchange = (e) => { maxMissing = +e.target.value; draw(); };
  draw();
}
