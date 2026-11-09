// Parsing and formatting for recipes: quantities, units, ingredient lines,
// the starter-catalog text format, and free-form pasted recipe text.

export const FRAC_CHARS = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const FC = Object.keys(FRAC_CHARS).join('');

export const UNITS = {
  tsp: { kind: 'vol', base: 4.92892, one: 'tsp', many: 'tsp', aliases: ['tsp', 'tsps', 'teaspoon', 'teaspoons'] },
  tbsp: { kind: 'vol', base: 14.7868, one: 'tbsp', many: 'tbsp', aliases: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons'] },
  floz: { kind: 'vol', base: 29.5735, one: 'fl oz', many: 'fl oz', aliases: [] },
  cup: { kind: 'vol', base: 236.588, one: 'cup', many: 'cups', aliases: ['c', 'cup', 'cups'] },
  pint: { kind: 'vol', base: 473.176, one: 'pint', many: 'pints', aliases: ['pt', 'pint', 'pints'] },
  quart: { kind: 'vol', base: 946.353, one: 'quart', many: 'quarts', aliases: ['qt', 'qts', 'quart', 'quarts'] },
  gallon: { kind: 'vol', base: 3785.41, one: 'gallon', many: 'gallons', aliases: ['gal', 'gallon', 'gallons'] },
  ml: { kind: 'vol', base: 1, one: 'ml', many: 'ml', aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
  l: { kind: 'vol', base: 1000, one: 'L', many: 'L', aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  oz: { kind: 'wt', base: 28.3495, one: 'oz', many: 'oz', aliases: ['oz', 'ounce', 'ounces'] },
  lb: { kind: 'wt', base: 453.592, one: 'lb', many: 'lb', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  g: { kind: 'wt', base: 1, one: 'g', many: 'g', aliases: ['g', 'gram', 'grams', 'gr'] },
  kg: { kind: 'wt', base: 1000, one: 'kg', many: 'kg', aliases: ['kg', 'kilogram', 'kilograms'] },
  clove: { kind: 'count', one: 'clove', many: 'cloves', aliases: ['clove', 'cloves'] },
  can: { kind: 'count', one: 'can', many: 'cans', aliases: ['can', 'cans'] },
  jar: { kind: 'count', one: 'jar', many: 'jars', aliases: ['jar', 'jars'] },
  pkg: { kind: 'count', one: 'package', many: 'packages', aliases: ['package', 'packages', 'pkg', 'pkgs'] },
  packet: { kind: 'count', one: 'packet', many: 'packets', aliases: ['packet', 'packets', 'envelope', 'envelopes'] },
  bag: { kind: 'count', one: 'bag', many: 'bags', aliases: ['bag', 'bags'] },
  box: { kind: 'count', one: 'box', many: 'boxes', aliases: ['box', 'boxes'] },
  bottle: { kind: 'count', one: 'bottle', many: 'bottles', aliases: ['bottle', 'bottles'] },
  stick: { kind: 'count', one: 'stick', many: 'sticks', aliases: ['stick', 'sticks'] },
  slice: { kind: 'count', one: 'slice', many: 'slices', aliases: ['slice', 'slices'] },
  pinch: { kind: 'count', one: 'pinch', many: 'pinches', aliases: ['pinch', 'pinches'] },
  dash: { kind: 'count', one: 'dash', many: 'dashes', aliases: ['dash', 'dashes'] },
  bunch: { kind: 'count', one: 'bunch', many: 'bunches', aliases: ['bunch', 'bunches'] },
  sprig: { kind: 'count', one: 'sprig', many: 'sprigs', aliases: ['sprig', 'sprigs'] },
  head: { kind: 'count', one: 'head', many: 'heads', aliases: ['head', 'heads'] },
  stalk: { kind: 'count', one: 'stalk', many: 'stalks', aliases: ['stalk', 'stalks'] },
  handful: { kind: 'count', one: 'handful', many: 'handfuls', aliases: ['handful', 'handfuls'] },
};

const ALIAS = {};
for (const [key, u] of Object.entries(UNITS)) for (const a of u.aliases) ALIAS[a] = key;
const MULTI = [['fluid ounces', 'floz'], ['fluid ounce', 'floz'], ['fl. oz', 'floz'], ['fl oz', 'floz']];

const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?\\s*[${FC}]|\\d+(?:\\.\\d+)?|\\.\\d+|[${FC}])`;
const QTY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|—|to)\\s*(${NUM}))?(?![-\\d/])\\s*`);

export function numVal(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if ((m = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*([${FC}])$`)))) return +m[1] + FRAC_CHARS[m[2]];
  if (FRAC_CHARS[s] != null) return FRAC_CHARS[s];
  return parseFloat(s);
}

export const isHeader = (line) => /^##\s/.test(line);
export const headerText = (line) => line.replace(/^##\s*/, '');

function matchUnit(rest) {
  const low = rest.toLowerCase();
  for (const [alias, key] of MULTI) {
    if (low.startsWith(alias) && /^(?:[\s.,)]|$)/.test(rest.slice(alias.length))) return { key, len: alias.length };
  }
  const w = rest.match(/^([A-Za-z]+)\.?(?=[\s,)]|$)/);
  if (!w) return null;
  const t = w[1];
  const key = t === 'T' ? 'tbsp' : t === 't' ? 'tsp' : ALIAS[t.toLowerCase()];
  return key ? { key, len: w[0].length } : null;
}

/** Split an ingredient line into quantity, unit and the rest. */
export function parseIngredient(raw) {
  const line = String(raw || '').trim();
  const out = { raw: line, qty: null, qty2: null, unit: null, paren: '', rest: line, name: '' };
  if (isHeader(line)) return out;
  const m = line.match(QTY_RE);
  if (m) {
    out.qty = numVal(m[1]);
    if (m[2]) out.qty2 = numVal(m[2]);
    let rest = line.slice(m[0].length);
    const pm = rest.match(/^(\([^)]*\))\s*/);
    if (pm) { out.paren = pm[1]; rest = rest.slice(pm[0].length); }
    const u = matchUnit(rest);
    // "4 cloves" on its own is the spice, not a unit of garlic.
    if (u && rest.slice(u.len).replace(/^\.?\s*/, '')) { out.unit = u.key; rest = rest.slice(u.len).replace(/^\.?\s*(?:of\s+)?/, ''); }
    out.rest = rest;
  }
  out.name = ingredientName(out.rest);
  return out;
}

const PREP_WORDS = /\b(fresh(?:ly)?|chopped|finely|roughly|coarsely|thinly|thickly|minced|diced|sliced|grated|shredded|crushed|cubed|halved|quartered|peeled|seeded|trimmed|divided|softened|melted|beaten|large|medium|small|extra|packed|heaping|level|cold|warm|hot|room temperature|to taste|optional|plus more|or more|about|approximately)\b/g;

/** A short normalised name used for matching (fridge search, shopping list). */
export function ingredientName(rest) {
  let s = String(rest || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.split(/,|;| - | – | for (?:serving|garnish|frying|the)\b/)[0];
  s = s.replace(PREP_WORDS, ' ').replace(/[^a-z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d[\d\/. -]*(?:inch|in)\b\s*(?:pieces?|knobs?|chunks?)?\s*(?:of\s+)?/, '');
  s = s.replace(/^(?:of|and|or)\s+/, '').replace(/\s+(?:and|or)$/, '');
  return s;
}

export function singular(w) {
  if (/(?:ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(?:oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

// ---------- number formatting ----------
const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];

export function fmtFrac(v) {
  if (!isFinite(v)) return '';
  if (v >= 20) return String(Math.round(v));
  if (v >= 10) {
    const r = Math.round(v * 2) / 2;
    return r % 1 ? `${Math.floor(r)}½` : String(r);
  }
  let whole = Math.floor(v);
  const frac = v - whole;
  let best = NICE[0], bd = 9;
  for (const n of NICE) { const d = Math.abs(n[0] - frac); if (d < bd) { bd = d; best = n; } }
  if (best[0] === 1) { whole += 1; best = NICE[0]; }
  if (!whole && !best[1]) return '⅛';
  return whole ? `${whole}${best[1] ? ' ' + best[1] : ''}` : best[1];
}

function fmtDec(v) {
  if (v >= 100) return String(Math.round(v / 5) * 5);
  if (v >= 10) return String(Math.round(v));
  return String(Math.round(v * 10) / 10);
}

const nearNice = (v) => { const f = v % 1; return [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1].some((n) => Math.abs(n - f) < 0.03); };

/** Choose a unit + amount for a volume in ml (US kitchen units). */
function bestUSVol(ml) {
  const cups = ml / UNITS.cup.base;
  if (cups >= 8 && nearNice(cups / 4)) return ['quart', cups / 4];
  if (cups >= 0.25 && (cups >= 1 || nearNice(cups))) return ['cup', cups];
  const tb = ml / UNITS.tbsp.base;
  if (tb >= 1) return ['tbsp', tb];
  return ['tsp', ml / UNITS.tsp.base];
}

/** Convert a quantity in `unit` to the target system. Returns [unit, qty]. */
export function convert(unit, qty, system, normalise) {
  const u = UNITS[unit];
  if (!u || u.kind === 'count') return [unit, qty];
  const base = qty * u.base;
  if (system === 'metric') {
    if (u.kind === 'vol') {
      if (unit === 'tsp' || unit === 'tbsp') return [unit, qty];
      if (unit === 'ml' || unit === 'l') return [unit, qty];
      return base >= 1000 ? ['l', base / 1000] : ['ml', base];
    }
    if (unit === 'g' || unit === 'kg') return [unit, qty];
    return base >= 1000 ? ['kg', base / 1000] : ['g', base];
  }
  // US
  if (u.kind === 'vol') {
    const isMetric = unit === 'ml' || unit === 'l';
    if (isMetric || (normalise && ['tsp', 'tbsp', 'cup'].includes(unit))) return bestUSVol(base);
    return [unit, qty];
  }
  if (unit === 'g' || unit === 'kg' || (normalise && unit === 'oz' && qty >= 16)) return base >= 453 ? ['lb', base / UNITS.lb.base] : ['oz', base / UNITS.oz.base];
  return [unit, qty];
}

/** Round weights to amounts you'd actually buy or measure. */
export function roundFor(unit, q) {
  if (unit === 'oz' && q >= 4) return Math.round(q);
  if (unit === 'lb') return Math.round(q * 4) / 4;
  return q;
}

export function fmtAmount(unit, qty) {
  const u = UNITS[unit];
  const metricNum = unit === 'g' || unit === 'ml' || unit === 'l' || unit === 'kg';
  const n = metricNum ? fmtDec(qty) : fmtFrac(qty);
  if (!u) return n;
  return `${n} ${qty > 1 ? u.many : u.one}`;
}

/** Scale and/or convert an ingredient line. Returns the original text when nothing changes. */
export function scaleLine(raw, factor = 1, system = 'us') {
  const p = parseIngredient(raw);
  if (p.qty == null) return p.raw;
  const u = p.unit && UNITS[p.unit];
  const needsConv = u && u.kind !== 'count' && (
    (system === 'metric' && ['cup', 'floz', 'pint', 'quart', 'gallon', 'oz', 'lb'].includes(p.unit)) ||
    (system === 'us' && ['ml', 'l', 'g', 'kg'].includes(p.unit)));
  if (Math.abs(factor - 1) < 1e-9 && !needsConv) return p.raw;
  let q = p.qty * factor, q2 = p.qty2 != null ? p.qty2 * factor : null;
  let unit = p.unit;
  if (u && u.kind !== 'count') {
    const [nu, nq] = convert(unit, q, system, Math.abs(factor - 1) > 1e-9);
    if (q2 != null) q2 = roundFor(nu, q2 * (nq / q));
    unit = nu; q = roundFor(nu, nq);
  }
  let amount;
  if (unit) {
    const uu = UNITS[unit];
    const metricNum = ['g', 'ml', 'l', 'kg'].includes(unit);
    const f = metricNum ? fmtDec : fmtFrac;
    const num = `${f(q)}${q2 != null ? '–' + f(q2) : ''}`;
    const word = (q2 ?? q) > 1 ? uu.many : uu.one;
    amount = p.paren && p.unit === unit ? `${num} ${p.paren} ${word}` : `${num} ${word}`;
    if (p.paren && p.unit === unit) return [amount, p.rest].filter(Boolean).join(' ');
  } else {
    amount = `${fmtFrac(q)}${q2 != null ? '–' + fmtFrac(q2) : ''}`;
  }
  return [amount, p.paren, p.rest].filter(Boolean).join(' ');
}

// ---------- starter catalog format ----------
// @ Name | Cuisine | protein | method,method | prep | cook | servings | difficulty | type
// description line(s)
// - ingredient            -- Section heading
// > step                  ! tip / note

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseCatalog(text, section = 'dinners') {
  const out = [];
  let cur = null;
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('@')) {
      const f = line.slice(1).split('|').map((s) => s.trim());
      cur = {
        section, name: f[0], cuisine: f[1] || 'American', protein: f[2] || 'mixed',
        methods: (f[3] || '').split(',').map((s) => s.trim()).filter(Boolean),
        prep: +f[4] || 0, cook: +f[5] || 0, servings: +f[6] || 4,
        difficulty: f[7] || 'easy', type: f[8] || 'main',
        desc: '', ingredients: [], steps: [], notes: '',
      };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('--')) cur.ingredients.push('## ' + line.slice(2).trim());
    else if (line.startsWith('-')) cur.ingredients.push(line.slice(1).trim());
    else if (line.startsWith('>')) cur.steps.push(line.slice(1).trim());
    else if (line.startsWith('!')) cur.notes += (cur.notes ? '\n' : '') + line.slice(1).trim();
    else cur.desc += (cur.desc ? ' ' : '') + line;
  }
  return out;
}

// ---------- pasted recipe text ----------
const ING_HDR = /^(ingredients?|what you(?:'ll)? need)\b:?$/i;
const STEP_HDR = /^(instructions?|directions?|method|steps?|preparation|how to make it)\b:?$/i;

export function parseRecipeText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/^[\s•*·▢☐□-]+/, '').trim()).filter(Boolean);
  const r = { name: '', servings: 4, ingredients: [], steps: [], notes: '' };
  const sv = String(text).match(/(?:serves|servings?|yield|makes)\s*:?\s*(\d+)/i);
  if (sv) r.servings = +sv[1];
  let mode = null;
  for (const l of lines) {
    if (ING_HDR.test(l)) { mode = 'ing'; continue; }
    if (STEP_HDR.test(l)) { mode = 'step'; continue; }
    if (/^(notes?|tips?)\b:?$/i.test(l)) { mode = 'note'; continue; }
    if (!mode) {
      if (!r.name && l.length < 80 && !QTY_RE.test(l)) { r.name = l; continue; }
      if (QTY_RE.test(l) && l.length < 90) { r.ingredients.push(l); continue; }
      if (l.length > 40) { r.steps.push(stripStepNum(l)); continue; }
      continue;
    }
    if (mode === 'ing') {
      if (/^for the\b|:$/i.test(l) && l.length < 40) r.ingredients.push('## ' + l.replace(/:$/, ''));
      else r.ingredients.push(l);
    } else if (mode === 'step') {
      const s = stripStepNum(l);
      if (s) r.steps.push(s);
    } else r.notes += (r.notes ? '\n' : '') + l;
  }
  return r;
}

function stripStepNum(l) {
  return l.replace(/^(?:step\s*)?\d+[.):]?\s*/i, '').trim();
}

/** Find durations in a step like "simmer 20 minutes" or "1 1/2 hours". Returns [{label, seconds}]. */
export function findTimers(step) {
  const out = [];
  const re = new RegExp(`(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b`, 'gi');
  let m;
  while ((m = re.exec(step))) {
    const v = numVal(m[2] || m[1]);
    const u = m[3].toLowerCase();
    const mult = u.startsWith('h') ? 3600 : u.startsWith('m') ? 60 : 1;
    if (v > 0) out.push({ label: m[0], seconds: Math.round(v * mult) });
  }
  return out;
}
