// Recipebook — web recipe helper (Cloudflare Worker, free plan)
//
// Recipe sites don't allow browser apps to read their pages directly (CORS),
// so this tiny worker does it for you. It only ever returns structured recipe
// data (name, servings, ingredients, steps), never whole pages.
//
//   GET /ping                 -> { ok: true }
//   GET /search?q=chili       -> { results: [{ site, title, url }], failed: [site names] }
//   GET /recipe?url=https://… -> { name, site, url, servings, prep, cook, ingredients[], steps[], image }
//
// Optional: set an ACCESS_KEY variable on the worker; the app then has to send ?key=… to use it.
// Setup steps are in the app under Settings → Web recipe helper.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const SITES = [
  { name: 'AllRecipes', host: 'allrecipes.com', search: (q) => `https://www.allrecipes.com/search?q=${q}`, link: /https:\/\/www\.allrecipes\.com\/(?:recipe\/\d+\/[a-z0-9-]+\/?|[a-z0-9-]+-recipe-\d+)/g },
  { name: 'Serious Eats', host: 'seriouseats.com', search: (q) => `https://www.seriouseats.com/search?q=${q}`, link: /https:\/\/www\.seriouseats\.com\/[a-z0-9-]+-recipe(?:-\d+)?(?![a-z])/g },
  { name: 'Simply Recipes', host: 'simplyrecipes.com', search: (q) => `https://www.simplyrecipes.com/search?q=${q}`, link: /https:\/\/www\.simplyrecipes\.com\/(?:recipes\/[a-z0-9_-]+\/?|[a-z0-9-]+-recipe-\d+)/g },
  { name: 'Food Network', host: 'foodnetwork.com', search: (q) => `https://www.foodnetwork.com/search/${q.replace(/%20|\+/g, '-')}-`, link: /(?:https:)?\/\/www\.foodnetwork\.com\/recipes\/[a-z0-9-]+\/[a-z0-9-]+-\d+/g, fix: (u) => (u.startsWith('//') ? 'https:' + u : u) },
  { name: 'Taste of Home', host: 'tasteofhome.com', search: (q) => `https://www.tasteofhome.com/search/?search=${q}`, link: /https:\/\/www\.tasteofhome\.com\/recipes\/[a-z0-9-]+\/?/g },
  { name: 'Bon Appétit', host: 'bonappetit.com', search: (q) => `https://www.bonappetit.com/search?q=${q}`, link: /(?:https:\/\/www\.bonappetit\.com)?\/recipe\/[a-z0-9-]+/g, fix: (u) => (u.startsWith('/') ? 'https://www.bonappetit.com' + u : u) },
  { name: 'Epicurious', host: 'epicurious.com', search: (q) => `https://www.epicurious.com/search?q=${q}`, link: /(?:https:\/\/www\.epicurious\.com)?\/recipes\/food\/views\/[a-z0-9-]+/g, fix: (u) => (u.startsWith('/') ? 'https://www.epicurious.com' + u : u) },
  { name: 'Delish', host: 'delish.com', search: (q) => `https://www.delish.com/search/?q=${q}`, link: /(?:https:\/\/www\.delish\.com)?\/cooking\/recipe-ideas\/(?:a\d+\/)?[a-z0-9-]+\/?/g, fix: (u) => (u.startsWith('/') ? 'https://www.delish.com' + u : u) },
];
const PER_SITE = 3;

export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (env.ACCESS_KEY && url.searchParams.get('key') !== env.ACCESS_KEY) return json({ error: 'Wrong or missing access key (check Settings → Access key in the app).' }, 401);
    try {
      if (url.pathname === '/ping' || url.pathname === '/') return json({ ok: true, name: 'recipebook-helper', version: 1 });
      if (url.pathname === '/search') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
        if (!q) return json({ error: 'Type something to search for.' }, 400);
        return json(await search(q));
      }
      if (url.pathname === '/recipe') {
        const target = url.searchParams.get('url') || '';
        return json(await getRecipe(target));
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Helper error' }, e.status || 500);
    }
  },
};

function fail(msg, status) { const e = new Error(msg); e.status = status; return e; }

async function get(u, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw fail(`The site answered ${res.status}`, 502);
    return await res.text();
  } catch (e) {
    if (e.name === 'AbortError') throw fail('The site took too long to answer', 504);
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- search ----------
function titleFromUrl(u) {
  const path = new URL(u).pathname.split('/').filter(Boolean);
  let slug = path.reverse().find((p) => /[a-z]/.test(p) && !/^(recipe|recipes|views|food|cooking|recipe-ideas)$/.test(p)) || '';
  slug = slug.replace(/_/g, '-').replace(/-recipe(?:-\d+)?$/, '').replace(/-\d+$/, '').replace(/^a\d+$/, '');
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || u;
}

async function search(q) {
  const enc = encodeURIComponent(q);
  const failed = [];
  const perSite = await Promise.all(SITES.map(async (s) => {
    try {
      const html = await get(s.search(enc), 8000);
      const seen = new Set();
      const out = [];
      for (const m of html.matchAll(s.link)) {
        let u = (s.fix ? s.fix(m[0]) : m[0]).replace(/\/$/, '');
        if (seen.has(u) || /all-recipes|\/recipes?\/?$|collection|gallery|roundup/.test(u)) continue;
        seen.add(u);
        out.push({ site: s.name, url: u, title: titleFromUrl(u) });
        if (out.length >= PER_SITE) break;
      }
      return out;
    } catch { failed.push(s.name); return []; }
  }));
  let results = perSite.flat();
  if (results.length < 6) {
    try { results = results.concat(await ddg(q, new Set(results.map((r) => r.url)))); } catch { failed.push('Web search'); }
  }
  // Interleave sites so the top of the list mixes sources.
  const mixed = [];
  for (let i = 0; i < PER_SITE + 8; i++) for (const group of groupBy(results)) if (group[i]) mixed.push(group[i]);
  return { results: mixed, failed };
}

function groupBy(results) {
  const m = new Map();
  for (const r of results) { if (!m.has(r.site)) m.set(r.site, []); m.get(r.site).push(r); }
  return [...m.values()];
}

async function ddg(q, seen) {
  const html = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q + ' recipe')}`, 8000);
  const out = [];
  for (const m of html.matchAll(/uddg=([^&"]+)/g)) {
    const u = decodeURIComponent(m[1]);
    if (seen.has(u) || /youtube|pinterest|facebook|instagram|tiktok|reddit|amazon|wikipedia/.test(u)) continue;
    seen.add(u);
    let host = '';
    try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { continue; }
    out.push({ site: siteName(host), url: u, title: titleFromUrl(u) });
    if (out.length >= 8) break;
  }
  return out;
}

const siteName = (host) => (SITES.find((s) => host.endsWith(s.host)) || {}).name || host;

// ---------- recipe extraction ----------
function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw fail('That doesn\'t look like a web address.', 400); }
  if (!/^https?:$/.test(u.protocol)) throw fail('Only http and https links are supported.', 400);
  const h = u.hostname;
  if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(h) || !h.includes('.')) throw fail('That address is not allowed.', 400);
  return u.toString();
}

async function getRecipe(raw) {
  const url = checkUrl(raw);
  const html = await get(url, 10000);
  const node = findRecipeNode(html);
  if (!node) throw fail('No recipe data found on that page. Try "Paste recipe text" instead.', 422);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const prep = isoMinutes(node.prepTime);
  let cook = isoMinutes(node.cookTime);
  const total = isoMinutes(node.totalTime);
  if (!cook && total) cook = Math.max(0, total - prep);
  return {
    name: clean(node.name) || 'Web recipe',
    site: siteName(host),
    url,
    description: clean(node.description).slice(0, 300),
    servings: yieldNumber(node.recipeYield ?? node.yield) || 4,
    prep, cook,
    ingredients: [].concat(node.recipeIngredient || node.ingredients || []).map(clean).filter(Boolean),
    steps: flattenSteps(node.recipeInstructions),
    image: imageUrl(node.image),
  };
}

function findRecipeNode(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { try { data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const hit = walk(data, 0);
    if (hit) return hit;
  }
  return null;
}

function walk(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) { for (const n of node) { const h = walk(n, depth + 1); if (h) return h; } return null; }
  const types = [].concat(node['@type'] || []);
  if (types.some((t) => String(t).toLowerCase() === 'recipe')) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const h = walk(node[k], depth + 1);
    if (h) return h;
  }
  return null;
}

function flattenSteps(ins) {
  const out = [];
  const add = (x) => {
    if (!x) return;
    if (typeof x === 'string') {
      const s = clean(x);
      if (!s) return;
      const parts = /<li|\n/.test(x) ? x.split(/<\/li>|\n+/).map(clean).filter(Boolean) : [s];
      out.push(...parts);
      return;
    }
    if (Array.isArray(x)) { x.forEach(add); return; }
    const types = [].concat(x['@type'] || []);
    if (types.includes('HowToSection')) {
      if (x.name) out.push('## ' + clean(x.name));
      add(x.itemListElement || x.steps);
      return;
    }
    if (x.itemListElement && !x.text) { add(x.itemListElement); return; }
    const t = clean(x.text || x.name || x.description || '');
    if (t) out.push(t);
  };
  add(ins);
  return out
    .map((s) => s.replace(/^(?:step\s*)?\d+[.):]\s*/i, ''))
    .filter((s) => !/^gather (?:all )?(?:the|your) ingredients\.?$/i.test(s));
}

function isoMinutes(v) {
  if (!v || typeof v !== 'string') return 0;
  const m = v.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function yieldNumber(y) {
  if (y == null) return 0;
  if (Array.isArray(y)) { for (const v of y) { const n = yieldNumber(v); if (n) return n; } return 0; }
  if (typeof y === 'number') return y;
  const m = String(y).match(/\d+/);
  return m ? +m[0] : 0;
}

function imageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  return img.url || '';
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', ntilde: 'ñ', reg: '®', trade: '™', copy: '©' };
function clean(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
