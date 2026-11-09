// Shopping list: combines ingredients across recipes and groups them by store aisle.
import { $, esc, uid, toast, confirmDialog } from '../util.js';
import { getKV, setKV, state } from '../store.js';
import { parseIngredient, isHeader, UNITS, convert, fmtAmount, fmtFrac, singular } from '../parse.js';

const AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Tortillas', 'Pasta, Rice & Grains', 'Canned & Jarred', 'Oils, Sauces & Condiments', 'Spices & Baking', 'Frozen', 'Other'];

const RULES = [
  ['Frozen', /\bfrozen\b/],
  ['Canned & Jarred', /\b(broth|stock|bouillon|canned|cans?\b|tomato (?:paste|sauce|puree)|crushed tomatoes|diced tomatoes|whole peeled|fire[- ]roasted|marinara|pasta sauce|salsa|coconut milk|chipotles?|adobo|olives|pickles?|capers|enchilada sauce|evaporated milk|condensed|cream of (?:mushroom|chicken|celery)|black beans|kidney beans|pinto beans|cannellini|navy beans|great northern|garbanzo|chickpeas|refried|baked beans|artichoke hearts|roasted red peppers|green chiles|rotel|sauerkraut|tuna\b(?!.*steak))/],
  ['Spices & Baking', /\b(salt|black pepper|white pepper|ground pepper|peppercorns?|red pepper flakes|pepper flakes|cayenne|paprika|cumin|chili powder|oregano|dried|thyme(?!.*fresh)|cinnamon|nutmeg|allspice|cloves? \(ground\)|ground cloves|garlic powder|onion powder|bay lea(?:f|ves)|seasoning|spice|curry powder|garam masala|turmeric|coriander|cardamom|five[- ]spice|old bay|cajun|creole seasoning|flour|sugar|cornstarch|baking (?:powder|soda)|yeast|cornmeal|breadcrumbs|bread crumbs|panko|cocoa|vanilla|msg|sesame seeds|mustard seed|fennel seed|celery seed|smoked paprika|liquid smoke|gelatin)\b/],
  ['Oils, Sauces & Condiments', /\b(oil|vinegar|soy sauce|tamari|worcestershire|ketchup|mustard|mayo(?:nnaise)?|hot sauce|bbq sauce|barbecue sauce|honey|maple syrup|molasses|fish sauce|oyster sauce|hoisin|sriracha|gochujang|miso|tahini|peanut butter|ranch|teriyaki|mirin|sake|wine|beer|bourbon|sambal|chili sauce|chili oil|steak sauce|horseradish|relish|jam|jelly|preserves|dressing|nuts?|peanuts|almonds|walnuts|pecans|cashews|pine nuts|raisins)\b/],
  ['Pasta, Rice & Grains', /\b(pasta|spaghetti|penne|macaroni|elbow|fettuccine|linguine|rigatoni|ziti|lasagna noodles|egg noodles|noodles|orzo|ravioli|tortellini|gnocchi|rice|quinoa|couscous|oats|grits|polenta|lentils|split peas|barley|farro|bulgur|tortilla chips|crackers|ramen)\b/],
  ['Bakery & Tortillas', /\b(buns?|rolls?|bread|tortillas?|pitas?|naan|baguette|hoagie|english muffins?|croutons|brioche|taco shells|tostadas?|wraps?|biscuits?)\b/],
  ['Dairy & Eggs', /\b(milk|cream|half[- ]and[- ]half|butter|cheese|cheddar|mozzarella|parmesan|parmigiano|pecorino|romano|monterey|jack|provolone|swiss|gruyere|feta|ricotta|mascarpone|queso|cotija|sour cream|yogurt|eggs?|buttermilk|ghee|crema|paneer|velveeta)\b/],
  ['Meat & Seafood', /\b(chicken|beef|pork|bacon|sausages?|ham|turkey|lamb|steaks?|ground|ribs?|brisket|chuck|sirloin|ribeye|chorizo|andouille|kielbasa|pancetta|prosciutto|pepperoni|salami|veal|shrimp|prawns|salmon|fish|cod|tilapia|halibut|catfish|mahi|crab|scallops|clams|mussels|lobster|crawfish|oysters|anchov(?:y|ies)|tuna steaks?|duck|venison|bratwurst|hot dogs?|pastrami|corned beef|meatballs)\b/],
  ['Produce', /\b(onions?|garlic|potato(?:es)?|tomato(?:es)?|peppers?|bell|jalape[nñ]os?|poblanos?|serranos?|habaneros?|chiles?|carrots?|celery|lettuce|romaine|cilantro|parsley|basil|mint|dill|chives|rosemary|sage|thyme|lemons?|limes?|oranges?|ginger|scallions?|green onions?|shallots?|leeks?|mushrooms?|zucchini|squash|corn|cabbage|spinach|kale|arugula|broccoli|cauliflower|avocados?|cucumbers?|apples?|pears?|pineapple|mango|green beans|asparagus|eggplant|sweet potato(?:es)?|okra|collard|greens|bok choy|bean sprouts|radish(?:es)?|beets?|peas|edamame|lemongrass|tomatillos?|plantains?|fennel|herbs?|banana)\b/],
];

export function aisleFor(name) {
  const n = name.toLowerCase();
  for (const [aisle, re] of RULES) if (re.test(n)) return aisle;
  return 'Other';
}

function keyName(name) {
  return name.split(' ').map(singular).join(' ');
}

function displayName(rest) {
  return String(rest).replace(/\([^)]*\)/g, '').split(/,|;/)[0].replace(/\s+/g, ' ').trim();
}

/** Turn an ingredient line (already scaled by factor) into a list item contribution. */
function contribution(line, factor) {
  const p = parseIngredient(line);
  const name = p.name || p.rest.toLowerCase();
  if (!name || /^water$/.test(name)) return null;
  const disp = displayName(p.rest) || p.raw;
  if (p.qty == null) return { k: keyName(name) + '|none', name: disp, kind: 'none', amount: null };
  const q = (p.qty2 ?? p.qty) * factor;
  const u = p.unit && UNITS[p.unit];
  if (u && u.kind !== 'count') return { k: keyName(name) + '|' + u.kind, name: disp, kind: u.kind, amount: q * u.base };
  if (u) return { k: keyName(name) + '|' + p.unit, name: disp, kind: 'count', unit: p.unit, amount: q };
  return { k: keyName(name) + '|n', name: disp, kind: 'n', amount: q };
}

export function amountText(it, units = state.settings.units) {
  if (it.amount == null || it.kind === 'none' || it.kind === 'manual') return '';
  if (it.kind === 'vol') {
    if (units === 'metric') return it.amount >= 1000 ? fmtAmount('l', it.amount / 1000) : fmtAmount('ml', it.amount);
    const [u, q] = convert('ml', it.amount, 'us');
    return fmtAmount(u, q);
  }
  if (it.kind === 'wt') {
    if (units === 'metric') return it.amount >= 1000 ? fmtAmount('kg', it.amount / 1000) : fmtAmount('g', it.amount);
    const [u, q] = convert('g', it.amount, 'us');
    return fmtAmount(u, q);
  }
  if (it.kind === 'count') return fmtAmount(it.unit, it.amount);
  return fmtFrac(it.amount);
}

export async function addRecipeToList(data, factor = 1) {
  const list = await getKV('shopping', []);
  let n = 0;
  for (const line of data.ingredients) {
    if (isHeader(line)) continue;
    const c = contribution(line, factor);
    if (!c) continue;
    n++;
    const ex = list.find((x) => x.k === c.k && !x.checked);
    if (ex) {
      if (c.amount != null) ex.amount = (ex.amount || 0) + c.amount;
      if (!ex.recipes.includes(data.name)) ex.recipes.push(data.name);
    } else {
      list.push({ id: uid(), ...c, aisle: aisleFor(c.name), checked: false, recipes: [data.name] });
    }
  }
  await setKV('shopping', list);
  return n;
}

function listText(list) {
  const lines = [];
  for (const a of AISLES) {
    const items = list.filter((x) => x.aisle === a && !x.checked);
    if (!items.length) continue;
    lines.push(a.toUpperCase());
    for (const it of items) lines.push(`☐ ${[amountText(it), it.name].filter(Boolean).join(' ')}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export async function render(el) {
  let list = await getKV('shopping', []);
  const save = () => setKV('shopping', list);

  const draw = () => {
    const groups = AISLES.map((a) => [a, list.filter((x) => x.aisle === a)]).filter((g) => g[1].length);
    const recipes = [...new Set(list.flatMap((x) => x.recipes))];
    el.innerHTML = `
    <section class="shopping">
      <div class="phead"><h1>Shopping list</h1></div>
      <form class="addrow" id="addf"><input id="addi" placeholder="Add an item, e.g. 2 lb chicken thighs" autocomplete="off"><button class="btn primary">Add</button></form>
      ${recipes.length ? `<p class="hint">For: ${recipes.map(esc).join(' · ')}</p>` : ''}
      ${groups.length ? groups.map(([a, items]) => `
        <div class="aisle"><h3>${a}</h3><ul>
          ${items.map((it) => `<li class="${it.checked ? 'done' : ''}">
            <label><input type="checkbox" data-id="${it.id}" ${it.checked ? 'checked' : ''}>
            <span><b>${esc(amountText(it))}</b> ${esc(it.name)}${it.recipes.length > 1 ? ` <small class="muted">(${it.recipes.length} recipes)</small>` : ''}</span></label>
            <select class="mini" data-aisle="${it.id}" aria-label="Move to aisle">${AISLES.map((x) => `<option ${x === it.aisle ? 'selected' : ''}>${x}</option>`).join('')}</select>
            <button class="icon-btn" data-del="${it.id}" aria-label="Remove">✕</button>
          </li>`).join('')}
        </ul></div>`).join('') : `<div class="empty small">Your list is empty. Open a recipe and tap <b>+ Shopping list</b>; amounts are scaled to the servings you chose and combined across recipes.</div>`}
      ${list.length ? `<div class="actions">
        <button class="btn" id="copy">Copy / share list</button>
        <button class="btn" id="clrchk">Clear checked</button>
        <button class="btn danger" id="clrall">Clear all</button>
      </div>` : ''}
    </section>`;
  };
  draw();

  el.addEventListener('submit', async (e) => {
    if (e.target.id !== 'addf') return;
    e.preventDefault();
    const v = $('#addi', el).value.trim();
    if (!v) return;
    const c = contribution(v, 1) || { k: v.toLowerCase(), name: v, kind: 'none', amount: null };
    list.push({ id: uid(), ...c, aisle: aisleFor(c.name), checked: false, recipes: [] });
    await save(); draw(); $('#addi', el).focus();
  });
  el.addEventListener('change', async (e) => {
    const cb = e.target.closest('input[type=checkbox][data-id]');
    if (cb) { list.find((x) => x.id === cb.dataset.id).checked = cb.checked; await save(); draw(); return; }
    const sel = e.target.closest('select[data-aisle]');
    if (sel) { list.find((x) => x.id === sel.dataset.aisle).aisle = sel.value; await save(); draw(); }
  });
  el.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { list = list.filter((x) => x.id !== d.dataset.del); await save(); draw(); return; }
    if (e.target.id === 'clrchk') { list = list.filter((x) => !x.checked); await save(); draw(); }
    if (e.target.id === 'clrall' && await confirmDialog('Clear the whole list?', 'Remove every item from your shopping list?', 'Clear', true)) { list = []; await save(); draw(); }
    if (e.target.id === 'copy') {
      const text = listText(list);
      if (navigator.share) { try { await navigator.share({ title: 'Shopping list', text }); return; } catch { /* fall through to copy */ } }
      await navigator.clipboard.writeText(text);
      toast('List copied');
    }
  });
}
