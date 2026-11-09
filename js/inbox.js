// Photo inbox: photos are read on-device one at a time and become editable drafts.
// Photos are kept only while their draft is in the inbox (so you can check the
// text against them) and are deleted when the draft is added or discarded.
import { db } from './db.js';
import { getKV, setKV } from './store.js';
import { uid, compressImage } from './util.js';
import { parseRecipeText } from './parse.js';
import { readPhotos } from './ocr.js';

const KEY = 'inbox';
const queue = [];
let running = false;
export const progress = new Map(); // draftId -> { pct, label }

const emit = () => window.dispatchEvent(new CustomEvent('inbox-change'));

export const listDrafts = () => getKV(KEY, []);
export async function getDraft(id) { return (await listDrafts()).find((d) => d.id === id); }

async function update(id, patch) {
  const list = await listDrafts();
  const d = list.find((x) => x.id === id);
  if (d) Object.assign(d, patch);
  await setKV(KEY, list);
  emit();
}

/** Guess tags from the text so the draft starts sensibly filled in. */
export function guessTags(r) {
  const all = (r.name + ' ' + r.ingredients.join(' ') + ' ' + r.steps.join(' ')).toLowerCase();
  const has = (re) => re.test(all);
  const protein = has(/\b(chicken|hen)\b/) ? 'chicken' : has(/\b(ground beef|beef|steak|chuck|roast beef|hamburger)\b/) ? 'beef'
    : has(/\b(pork|ham|bacon|sausage)\b/) ? 'pork' : has(/\bturkey\b/) ? 'turkey' : has(/\blamb\b/) ? 'lamb'
    : has(/\b(shrimp|crab|lobster|scallops?|clams?|oysters?|crawfish)\b/) ? 'shellfish'
    : has(/\b(fish|salmon|cod|tuna|catfish|tilapia|halibut)\b/) ? 'fish' : 'vegetarian';
  const methods = [];
  if (has(/slow cooker|crock ?pot/)) methods.push('slow-cooker');
  if (has(/instant pot|pressure cook/)) methods.push('instant-pot');
  if (has(/\b(bake|oven|roast|broil|\d{3} ?°? ?f?\b)/)) methods.push('oven');
  if (has(/\b(skillet|saucepan|simmer|boil|saut|fry|stir)/)) methods.push('stovetop');
  if (has(/\bgrill/)) methods.push('grill');
  const type = has(/\b(soup|stew|chili|chowder|gumbo|bisque)\b/) ? 'soup' : has(/\b(sandwich|burger|tacos?|wraps?|sliders?)\b/) ? 'sandwich' : 'main';
  return { protein, methods: methods.length ? methods : ['stovetop'], type };
}

async function processNext() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { id, photoIds } = queue.shift();
    try {
      progress.set(id, { pct: 0, label: 'Waiting' });
      const blobs = [];
      for (const p of photoIds) blobs.push(await db.get('photos', p));
      const { text, raw } = await readPhotos(blobs, (pct, label) => { progress.set(id, { pct, label }); emit(); });
      const parsed = parseRecipeText(text);
      const tags = guessTags(parsed);
      const draft = {
        name: parsed.name, desc: '', cuisine: 'American', ...tags,
        prep: parsed.prep, cook: parsed.cook, servings: parsed.servings, difficulty: 'easy',
        ingredients: parsed.ingredients, steps: parsed.steps, notes: parsed.notes,
      };
      const empty = !text.trim() || (!parsed.ingredients.length && !parsed.steps.length);
      await update(id, { status: empty ? "error" : "ready", text: raw, draft, error: empty ? 'No readable text was found. Try a sharper, well-lit photo taken straight on.' : null });
    } catch (e) {
      await update(id, { status: 'error', error: e.message || String(e) });
    }
    progress.delete(id);
    emit();
  }
  running = false;
}

/**
 * Add photos to the inbox. With asOne, all photos become one recipe
 * (front and back of a card); otherwise each photo is its own recipe.
 */
export async function addPhotos(files, asOne) {
  const groups = asOne ? [files] : files.map((f) => [f]);
  const list = await listDrafts();
  for (const g of groups) {
    const photoIds = [];
    for (const f of g) {
      const id = 'tmp-' + uid();
      // Keep enough resolution for reading; this copy is deleted once the draft is handled.
      await db.put('photos', await compressImage(f, 2400, 0.9), id);
      photoIds.push(id);
    }
    const draftId = 'd-' + uid();
    list.unshift({ id: draftId, created: new Date().toISOString(), status: 'queued', photoIds, text: '', draft: null, error: null });
    queue.push({ id: draftId, photoIds });
  }
  await setKV(KEY, list);
  emit();
  processNext();
  return groups.length;
}

export async function retryDraft(id) {
  const d = await getDraft(id);
  if (!d) return;
  await update(id, { status: 'queued', error: null });
  queue.push({ id, photoIds: d.photoIds });
  processNext();
}

/** Remove a draft and its temporary photos. */
export async function removeDraft(id) {
  const list = await listDrafts();
  const d = list.find((x) => x.id === id);
  if (d) for (const p of d.photoIds || []) await db.del('photos', p);
  await setKV(KEY, list.filter((x) => x.id !== id));
  emit();
}

/** Drafts left "queued" from a previous visit (the app was closed mid-read) get picked up again. */
export async function resumeQueue() {
  for (const d of await listDrafts()) {
    if (d.status === 'queued' && !queue.some((q) => q.id === d.id)) queue.push({ id: d.id, photoIds: d.photoIds });
  }
  if (queue.length) processNext();
}
