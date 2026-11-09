// App data: the read-only starter catalog plus your saved records on top of it.
import { db } from './db.js';
import { parseCatalog, parseIngredient, slugify, isHeader } from './parse.js';
import { uid } from './util.js';

// Sections share one recipe engine. Breads and Desserts get added here later
// (with their own data files listed in data/index.json) and set visible: true.
export const SECTIONS = [
  { id: 'dinners', name: 'Dinners', noun: 'dinners', visible: true },
  { id: 'breads', name: 'Breads', noun: 'breads', visible: false },
  { id: 'desserts', name: 'Desserts', noun: 'desserts', visible: false },
];

export const US_CUISINES = new Set(['American', 'Southern', 'Soul Food', 'Cajun & Creole', 'Tex-Mex', 'Southwestern', 'BBQ', 'Midwest', 'New England', 'Mid-Atlantic', 'West Coast', 'Hawaiian', 'Italian-American', 'Asian-American', 'Jewish Deli']);

export const PROTEINS = [['chicken', 'Chicken'], ['beef', 'Beef'], ['pork', 'Pork'], ['turkey', 'Turkey'], ['lamb', 'Lamb'], ['fish', 'Fish'], ['shellfish', 'Shellfish'], ['vegetarian', 'Vegetarian'], ['mixed', 'Mixed / other']];
export const METHODS = [['stovetop', 'Stovetop'], ['oven', 'Oven'], ['grill', 'Grill'], ['smoker', 'Smoker'], ['slow-cooker', 'Slow cooker'], ['instant-pot', 'Instant Pot'], ['sheet-pan', 'Sheet pan'], ['air-fryer', 'Air fryer'], ['fry', 'Fried'], ['one-pot', 'One-pot'], ['no-cook', 'No-cook']];
export const TYPES = [['main', 'Entrées'], ['soup', 'Soups, stews & chili'], ['sandwich', 'Burgers, sandwiches & tacos'], ['side', 'Sides']];
export const DIFFS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Project']];
export const label = (list, key) => (list.find((x) => x[0] === key) || [key, key])[1];

export const FIELDS = ['name', 'desc', 'cuisine', 'protein', 'methods', 'prep', 'cook', 'servings', 'difficulty', 'type', 'ingredients', 'steps', 'notes'];

export const state = {
  section: 'dinners',
  catalog: new Map(),
  records: new Map(),
  settings: { units: 'us', workerUrl: '', workerKey: '', pantry: true },
  rev: 0,
};

export async function loadAll() {
  const idx = await fetch('data/index.json').then((r) => r.json());
  for (const sec of SECTIONS) {
    const files = idx[sec.id] || [];
    const texts = await Promise.all(files.map((f) => fetch(`data/${f}`).then((r) => (r.ok ? r.text() : ''))));
    for (const t of texts) {
      for (const r of parseCatalog(t, sec.id)) {
        let id = slugify(r.name), n = 2;
        while (state.catalog.has(id)) id = `${slugify(r.name)}-${n++}`;
        r.id = id;
        state.catalog.set(id, r);
      }
    }
  }
  for (const rec of await db.all('records')) state.records.set(rec.id, rec);
  Object.assign(state.settings, (await db.get('kv', 'settings')) || {});
  navigator.storage?.persist?.();
}

export const pickData = (src) => {
  const d = {};
  for (const f of FIELDS) d[f] = Array.isArray(src[f]) ? [...src[f]] : src[f] ?? '';
  return d;
};

const bump = () => { state.rev++; listCache = null; };

// ---------- records ----------
export function shownV(rec) {
  if (!rec || !rec.versions.length) return null;
  return rec.final ?? rec.versions[rec.versions.length - 1].v;
}

export function versionOf(rec, v) {
  return rec.versions.find((x) => x.v === v) || rec.versions[rec.versions.length - 1];
}

/** The recipe as it should be displayed: { id, data, rec, base, v, version } */
export function getRecipe(id, v) {
  const rec = state.records.get(id);
  const base = state.catalog.get(id);
  if (rec) {
    const ver = versionOf(rec, v ?? shownV(rec));
    return { id, rec, base, v: ver.v, version: ver, data: ver.data };
  }
  if (base) return { id, rec: null, base, v: 1, version: { v: 1, from: 'catalog', note: 'Starter placeholder recipe' }, data: pickData(base) };
  return null;
}

export function ensureRecord(id) {
  let rec = state.records.get(id);
  if (rec) return rec;
  const base = state.catalog.get(id);
  if (!base) throw new Error('Unknown recipe ' + id);
  rec = {
    id, section: base.section, custom: false,
    versions: [{ v: 1, created: new Date().toISOString(), from: 'catalog', note: 'Starter placeholder recipe', data: pickData(base) }],
    final: null, attempts: [], favorite: false, sources: [], updated: new Date().toISOString(),
  };
  return rec;
}

export async function saveRecord(rec) {
  rec.updated = new Date().toISOString();
  state.records.set(rec.id, rec);
  await db.put('records', rec);
  bump();
}

export async function addVersion(id, data, { note = '', from = 'edit', replaceV = null } = {}) {
  const rec = ensureRecord(id);
  if (replaceV != null) {
    const ver = versionOf(rec, replaceV);
    ver.data = pickData(data);
    ver.edited = new Date().toISOString();
    if (note) ver.note = note;
    await saveRecord(rec);
    return ver.v;
  }
  const v = Math.max(0, ...rec.versions.map((x) => x.v)) + 1;
  rec.versions.push({ v, created: new Date().toISOString(), from, note, data: pickData(data) });
  await saveRecord(rec);
  return v;
}

export async function createCustom(data, section = state.section) {
  const id = 'my-' + slugify(data.name || 'recipe') + '-' + uid().slice(-4);
  const rec = {
    id, section, custom: true,
    versions: [{ v: 1, created: new Date().toISOString(), from: 'new', note: 'First version', data: pickData(data) }],
    final: null, attempts: [], favorite: false, sources: [], updated: new Date().toISOString(),
  };
  await saveRecord(rec);
  return id;
}

export async function deleteVersion(id, v) {
  const rec = state.records.get(id);
  if (!rec || rec.versions.length < 2) return;
  rec.versions = rec.versions.filter((x) => x.v !== v);
  if (rec.final === v) rec.final = null;
  await saveRecord(rec);
}

export async function setFinal(id, v) {
  const rec = ensureRecord(id);
  rec.final = rec.final === v ? null : v;
  await saveRecord(rec);
}

export async function toggleFavorite(id) {
  const rec = ensureRecord(id);
  rec.favorite = !rec.favorite;
  await saveRecord(rec);
  return rec.favorite;
}

export async function addAttempt(id, attempt) {
  const rec = ensureRecord(id);
  rec.attempts.push({ id: uid(), ...attempt });
  rec.attempts.sort((a, b) => (a.date < b.date ? -1 : 1));
  await saveRecord(rec);
}

export async function updateAttempt(id, attemptId, patch) {
  const rec = state.records.get(id);
  const a = rec?.attempts.find((x) => x.id === attemptId);
  if (!a) return;
  Object.assign(a, patch);
  await saveRecord(rec);
}

export async function deleteAttempt(id, attemptId) {
  const rec = state.records.get(id);
  if (!rec) return;
  const a = rec.attempts.find((x) => x.id === attemptId);
  if (a?.photo) await db.del('photos', a.photo);
  rec.attempts = rec.attempts.filter((x) => x.id !== attemptId);
  await saveRecord(rec);
}

export async function saveSources(id, sources) {
  const rec = ensureRecord(id);
  rec.sources = sources;
  await saveRecord(rec);
}

export async function deleteRecord(id) {
  const rec = state.records.get(id);
  if (!rec) return;
  for (const a of rec.attempts) if (a.photo) await db.del('photos', a.photo);
  state.records.delete(id);
  await db.del('records', id);
  bump();
}

export function statusOf(rec) {
  if (!rec) return 'untested';
  if (rec.final != null) return 'final';
  if (rec.attempts.length || rec.versions.length > 1 || rec.custom) return 'testing';
  return 'untested';
}

// ---------- browse index ----------
let listCache = null;

export function iconFor(d) {
  const n = (d.name || '').toLowerCase();
  if (/taco|burrito|quesadilla|enchilada|fajita|nacho|tostada|chimichanga|tamale/.test(n)) return '🌮';
  if (/burger|sliders?\b/.test(n)) return '🍔';
  if (/sandwich|sub\b|hoagie|po'? ?boy|cheesesteak|wrap|panini|melt|reuben|gyro|banh mi|sloppy/.test(n)) return '🥪';
  if (d.type === 'soup' || /soup|stew|chili|gumbo|chowder|bisque|pho|ramen/.test(n)) return '🍲';
  if (/curry|masala|korma|vindaloo|tikka/.test(n)) return '🍛';
  if (/pasta|spaghetti|lasagn|ziti|fettuccine|penne|linguine|macaroni|mac and|noodle|lo mein|carbonara|alfredo|ravioli|gnocchi|tortellini|rigatoni|orzo|pad thai/.test(n)) return '🍝';
  if (/rice|risotto|paella|jambalaya|biryani|pilaf|fried rice|bowl/.test(n)) return '🍚';
  if (/potato|fries|hash brown|yams?\b/.test(n)) return '🥔';
  if (/corn|elote/.test(n)) return '🌽';
  if (/egg|frittata|quiche|shakshuka/.test(n)) return '🍳';
  const p = { chicken: '🍗', beef: '🥩', pork: '🥓', turkey: '🦃', lamb: '🍖', fish: '🐟', shellfish: '🦐', vegetarian: '🥦' }[d.protein];
  if (d.type === 'side') return p && d.protein !== 'vegetarian' ? p : '🥗';
  return p || '🍽️';
}

export function listItems(section = state.section) {
  if (listCache && listCache.section === section) return listCache.items;
  const items = [];
  const seen = new Set();
  const push = (id) => {
    const r = getRecipe(id);
    if (!r) return;
    const rec = r.rec;
    const d = r.data;
    if ((rec?.section || r.base?.section) !== section) return;
    const ingNames = d.ingredients.filter((l) => !isHeader(l)).map((l) => parseIngredient(l).name).filter(Boolean);
    const lastA = rec?.attempts?.[rec.attempts.length - 1];
    const rated = rec?.attempts?.filter((a) => a.rating) || [];
    const photoA = rec ? [...rec.attempts].reverse().find((a) => a.photo) : null;
    items.push({
      id, ...d,
      methods: d.methods || [],
      total: (+d.prep || 0) + (+d.cook || 0),
      region: US_CUISINES.has(d.cuisine) ? 'us' : 'intl',
      ingNames,
      hay: [d.name, d.desc, d.cuisine, ...ingNames].join(' ').toLowerCase(),
      status: statusOf(rec),
      favorite: !!rec?.favorite,
      custom: !!rec?.custom,
      photo: photoA?.photo || null,
      lastCooked: lastA?.date || '',
      rating: rated.length ? rated[rated.length - 1].rating : 0,
      versions: rec?.versions.length || 1,
      icon: iconFor(d),
    });
  };
  for (const id of state.catalog.keys()) { seen.add(id); push(id); }
  for (const id of state.records.keys()) if (!seen.has(id)) push(id);
  listCache = { section, items };
  return items;
}

// ---------- photos ----------
const urlCache = new Map();
export async function savePhoto(blob) {
  const id = 'p-' + uid();
  await db.put('photos', blob, id);
  return id;
}
export async function photoURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await db.get('photos', id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(id, u);
  return u;
}

// ---------- settings / kv ----------
export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await db.put('kv', state.settings, 'settings');
}
export const getKV = async (k, dflt) => (await db.get('kv', k)) ?? dflt;
export const setKV = (k, v) => db.put('kv', v, k);

// ---------- backup ----------
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

export async function exportBackup() {
  const photos = {};
  for (const k of await db.keys('photos')) photos[k] = await blobToDataURL(await db.get('photos', k));
  return {
    app: 'recipebook', format: 1, exported: new Date().toISOString(),
    records: [...state.records.values()],
    settings: state.settings,
    shopping: await getKV('shopping', []),
    fridge: await getKV('fridge', []),
    photos,
  };
}

export async function importBackup(data, mode = 'merge') {
  if (data?.app !== 'recipebook') throw new Error('That file is not a Recipebook backup.');
  if (mode === 'replace') {
    await db.clear('records'); await db.clear('photos');
    state.records.clear();
  }
  let added = 0, updated = 0;
  for (const rec of data.records || []) {
    const cur = state.records.get(rec.id);
    if (cur && mode === 'merge' && cur.updated >= rec.updated) continue;
    cur ? updated++ : added++;
    state.records.set(rec.id, rec);
    await db.put('records', rec);
  }
  for (const [k, url] of Object.entries(data.photos || {})) {
    const blob = await fetch(url).then((r) => r.blob());
    await db.put('photos', blob, k);
  }
  if (mode === 'replace' || !(await getKV('shopping', null))?.length) await setKV('shopping', data.shopping || []);
  if (mode === 'replace') await setKV('fridge', data.fridge || []);
  if (data.settings) await saveSettings({ ...data.settings, ...(mode === 'merge' ? { workerUrl: state.settings.workerUrl || data.settings.workerUrl, workerKey: state.settings.workerKey || data.settings.workerKey } : {}) });
  bump();
  return { added, updated };
}
