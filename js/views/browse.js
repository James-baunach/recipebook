// Browse: search plus filters for cuisine, protein, method, time, difficulty and type.
import { $, esc, debounce } from '../util.js';
import { listItems, PROTEINS, METHODS, TYPES, DIFFS, US_CUISINES, state, SECTIONS } from '../store.js';
import { renderCardList } from './cards.js';

// Filter state survives navigation (kept in memory for the session).
const F = {
  q: '', regions: new Set(), cuisines: new Set(), proteins: new Set(), methods: new Set(),
  types: new Set(), diffs: new Set(), maxTime: 0, show: 'all', sort: 'relevance', open: false,
};
let savedScroll = 0;

const TIMES = [[30, '≤ 30 min'], [45, '≤ 45 min'], [60, '≤ 1 hr'], [90, '≤ 1½ hr'], [180, '≤ 3 hr']];
const SHOWS = [['all', 'All'], ['favorites', '♥ Favorites'], ['untested', 'Untested'], ['testing', 'Testing'], ['final', '★ Final'], ['mine', 'My own']];
const SORTS = [['relevance', 'Best match'], ['name', 'A–Z'], ['time', 'Quickest'], ['recent', 'Recently cooked'], ['rating', 'Top rated']];

function activeCount() {
  return F.regions.size + F.cuisines.size + F.proteins.size + F.methods.size + F.types.size + F.diffs.size + (F.maxTime ? 1 : 0) + (F.show !== 'all' ? 1 : 0);
}

function chip(group, value, text, on, count) {
  return `<button class="chip${on ? ' on' : ''}" data-g="${group}" data-v="${esc(value)}">${esc(text)}${count != null ? ` <small>${count}</small>` : ''}</button>`;
}

function filterItems() {
  const tokens = F.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of listItems()) {
    if (F.regions.size && !F.regions.has(it.region)) continue;
    if (F.cuisines.size && !F.cuisines.has(it.cuisine)) continue;
    if (F.proteins.size && !F.proteins.has(it.protein)) continue;
    if (F.methods.size && !it.methods.some((m) => F.methods.has(m))) continue;
    if (F.types.size && !F.types.has(it.type)) continue;
    if (F.diffs.size && !F.diffs.has(it.difficulty)) continue;
    if (F.maxTime && it.total > F.maxTime) continue;
    if (F.show === 'favorites' && !it.favorite) continue;
    if (F.show === 'mine' && !it.custom) continue;
    if (['untested', 'testing', 'final'].includes(F.show) && it.status !== F.show) continue;
    let score = 0;
    if (tokens.length) {
      if (!tokens.every((t) => it.hay.includes(t))) continue;
      const n = it.name.toLowerCase();
      score = n.includes(F.q.toLowerCase().trim()) ? 0 : tokens.every((t) => n.includes(t)) ? 1 : 2;
    }
    out.push([score, it]);
  }
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    time: (a, b) => a.total - b.total || a.name.localeCompare(b.name),
    recent: (a, b) => (b.lastCooked || '').localeCompare(a.lastCooked || '') || a.name.localeCompare(b.name),
    rating: (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
  };
  const sort = F.sort === 'relevance' ? by.name : by[F.sort];
  out.sort((a, b) => (F.sort === 'relevance' ? a[0] - b[0] : 0) || sort(a[1], b[1]));
  return out.map((x) => x[1]);
}

function panelHTML() {
  const items = listItems();
  const cuisineCounts = {};
  for (const it of items) cuisineCounts[it.cuisine] = (cuisineCounts[it.cuisine] || 0) + 1;
  const cuisines = Object.keys(cuisineCounts).sort();
  const us = cuisines.filter((c) => US_CUISINES.has(c));
  const intl = cuisines.filter((c) => !US_CUISINES.has(c));
  const g = (title, html) => `<div class="fgroup"><div class="flabel">${title}</div><div class="chips">${html}</div></div>`;
  return `
    ${g('Show', SHOWS.map(([v, t]) => chip('show', v, t, F.show === v)).join(''))}
    ${g('Region', chip('regions', 'us', 'USA', F.regions.has('us')) + chip('regions', 'intl', 'International', F.regions.has('intl')))}
    ${g('American styles', us.map((c) => chip('cuisines', c, c, F.cuisines.has(c), cuisineCounts[c])).join(''))}
    ${g('International', intl.map((c) => chip('cuisines', c, c, F.cuisines.has(c), cuisineCounts[c])).join(''))}
    ${g('Main protein', PROTEINS.map(([v, t]) => chip('proteins', v, t, F.proteins.has(v))).join(''))}
    ${g('Dish type', TYPES.map(([v, t]) => chip('types', v, t, F.types.has(v))).join(''))}
    ${g('Total time', TIMES.map(([v, t]) => chip('maxTime', v, t, F.maxTime === v)).join(''))}
    ${g('Difficulty', DIFFS.map(([v, t]) => chip('diffs', v, t, F.diffs.has(v))).join(''))}
    ${g('Method & equipment', METHODS.map(([v, t]) => chip('methods', v, t, F.methods.has(v))).join(''))}
    <div class="factions"><button class="btn" id="fclear">Clear all filters</button><button class="btn primary" id="fdone">Done</button></div>`;
}

function activeChipsHTML() {
  const out = [];
  const add = (g, v, t) => out.push(`<button class="chip on removable" data-g="${g}" data-v="${esc(v)}">${esc(t)} ✕</button>`);
  if (F.show !== 'all') add('show', 'all', SHOWS.find((s) => s[0] === F.show)[1]);
  for (const v of F.regions) add('regions', v, v === 'us' ? 'USA' : 'International');
  for (const v of F.cuisines) add('cuisines', v, v);
  for (const v of F.proteins) add('proteins', v, PROTEINS.find((p) => p[0] === v)[1]);
  for (const v of F.types) add('types', v, TYPES.find((p) => p[0] === v)[1]);
  if (F.maxTime) add('maxTime', F.maxTime, TIMES.find((t) => t[0] === F.maxTime)[1]);
  for (const v of F.diffs) add('diffs', v, DIFFS.find((p) => p[0] === v)[1]);
  for (const v of F.methods) add('methods', v, METHODS.find((p) => p[0] === v)[1]);
  return out.join('');
}

function toggle(g, v) {
  if (g === 'show') F.show = F.show === v && v !== 'all' ? 'all' : v;
  else if (g === 'maxTime') F.maxTime = F.maxTime === +v ? 0 : +v;
  else F[g].has(v) ? F[g].delete(v) : F[g].add(v);
}

export function render(el) {
  const sec = SECTIONS.find((s) => s.id === state.section);
  const total = listItems().length;
  el.innerHTML = `
    <section class="browse">
      <div class="searchbar">
        <input id="q" type="search" placeholder="Search ${total.toLocaleString()} ${sec.noun} by dish or ingredient" value="${esc(F.q)}" autocomplete="off">
        <button class="btn" id="ftoggle" aria-expanded="${F.open}">Filters<span class="badge" id="fcount"></span></button>
      </div>
      <div class="fpanel" id="fpanel" ${F.open ? '' : 'hidden'}></div>
      <div class="chips active" id="active"></div>
      <div class="resulthead">
        <span id="count"></span>
        <span class="spacer"></span>
        <a class="btn small" href="#/inbox">📷 From photos</a>
        <a class="btn small" href="#/new">+ New recipe</a>
        <select id="sort" aria-label="Sort">${SORTS.map(([v, t]) => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div id="results"></div>
    </section>`;

  const refresh = () => {
    const items = filterItems();
    $('#count', el).textContent = `${items.length.toLocaleString()} ${items.length === 1 ? 'recipe' : 'recipes'}`;
    const n = activeCount();
    $('#fcount', el).textContent = n ? n : '';
    $('#active', el).innerHTML = activeChipsHTML();
    if (F.open) $('#fpanel', el).innerHTML = panelHTML();
    renderCardList($('#results', el), items, { empty: 'No recipes match. Try fewer filters or a different word.' });
  };

  $('#q', el).addEventListener('input', debounce((e) => { F.q = e.target.value; refresh(); }, 150));
  $('#sort', el).onchange = (e) => { F.sort = e.target.value; refresh(); };
  $('#ftoggle', el).onclick = () => {
    F.open = !F.open;
    $('#fpanel', el).hidden = !F.open;
    $('#ftoggle', el).setAttribute('aria-expanded', F.open);
    refresh();
  };
  el.addEventListener('click', (e) => {
    const c = e.target.closest('.chip[data-g]');
    if (c) { toggle(c.dataset.g, c.dataset.v); refresh(); return; }
    if (e.target.id === 'fclear') {
      for (const k of ['regions', 'cuisines', 'proteins', 'methods', 'types', 'diffs']) F[k].clear();
      F.maxTime = 0; F.show = 'all'; refresh();
    }
    if (e.target.id === 'fdone') { F.open = false; $('#fpanel', el).hidden = true; refresh(); }
  });

  refresh();
  if (savedScroll) requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  return () => { savedScroll = window.scrollY; };
}
