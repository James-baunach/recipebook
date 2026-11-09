// Validates the starter catalog files and prints a summary.
// Run from the project folder:  node tools/check-data.mjs
import { readFileSync } from 'node:fs';
import { parseCatalog } from '../js/parse.js';

const US = new Set(['American', 'Southern', 'Soul Food', 'Cajun & Creole', 'Tex-Mex', 'Southwestern', 'BBQ', 'Midwest', 'New England', 'Mid-Atlantic', 'West Coast', 'Hawaiian', 'Italian-American', 'Asian-American', 'Jewish Deli']);
const PROTEINS = new Set(['chicken', 'beef', 'pork', 'turkey', 'lamb', 'fish', 'shellfish', 'vegetarian', 'mixed']);
const METHODS = new Set(['stovetop', 'oven', 'grill', 'smoker', 'slow-cooker', 'instant-pot', 'sheet-pan', 'air-fryer', 'fry', 'one-pot', 'no-cook']);
const DIFFS = new Set(['easy', 'medium', 'hard']);
const TYPES = new Set(['main', 'soup', 'sandwich', 'side']);
const BANNED = /\b(cake|cookie|brownie|pie crust|cobbler|(?<!corn )pudding|cupcake|muffin|scone|focaccia|sourdough|cornbread(?! dressing)|biscuits? recipe|pizza|flatbread|dessert)\b/i;

const idx = JSON.parse(readFileSync('data/index.json', 'utf8'));
const names = new Map();
const problems = [];
const tally = { cuisine: {}, type: {}, region: { us: 0, intl: 0 }, protein: {} };
let total = 0;

for (const [section, files] of Object.entries(idx)) {
  for (const f of files) {
    const text = readFileSync(`data/${f}`, 'utf8');
    const headers = text.split(/\r?\n/).filter((l) => l.trim().startsWith('@'));
    for (const h of headers) if (h.split('|').length !== 9) problems.push(`${f}: header needs 9 fields: ${h}`);
    for (const r of parseCatalog(text, section)) {
      total++;
      const where = `${f}: ${r.name}`;
      const key = r.name.toLowerCase();
      if (names.has(key)) problems.push(`${where}: duplicate of ${names.get(key)}`);
      names.set(key, f);
      if (!PROTEINS.has(r.protein)) problems.push(`${where}: protein "${r.protein}"`);
      for (const m of r.methods) if (!METHODS.has(m)) problems.push(`${where}: method "${m}"`);
      if (!r.methods.length) problems.push(`${where}: no method`);
      if (!DIFFS.has(r.difficulty)) problems.push(`${where}: difficulty "${r.difficulty}"`);
      if (!TYPES.has(r.type)) problems.push(`${where}: type "${r.type}"`);
      if (r.ingredients.length < 3) problems.push(`${where}: only ${r.ingredients.length} ingredients`);
      if (r.steps.length < 2) problems.push(`${where}: only ${r.steps.length} steps`);
      if (!r.desc) problems.push(`${where}: no description`);
      if (!(r.servings > 0) || !(r.prep + r.cook > 0)) problems.push(`${where}: bad servings/time`);
      if (BANNED.test(r.name)) problems.push(`${where}: looks like bread/dessert/pizza`);
      tally.cuisine[r.cuisine] = (tally.cuisine[r.cuisine] || 0) + 1;
      tally.type[r.type] = (tally.type[r.type] || 0) + 1;
      tally.protein[r.protein] = (tally.protein[r.protein] || 0) + 1;
      tally.region[US.has(r.cuisine) ? 'us' : 'intl']++;
    }
  }
}

const sortObj = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`Total recipes: ${total}`);
console.log(`Region: USA ${tally.region.us} (${Math.round((100 * tally.region.us) / total)}%), International ${tally.region.intl}`);
console.log(`Types: ${sortObj(tally.type)}`);
console.log(`Proteins: ${sortObj(tally.protein)}`);
console.log(`Cuisines: ${sortObj(tally.cuisine)}`);
if (problems.length) { console.log(`\n${problems.length} problems:`); for (const p of problems) console.log(' - ' + p); process.exitCode = 1; } else console.log('\nNo problems found.');
