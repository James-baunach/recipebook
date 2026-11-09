// Entry point: loads data, registers the service worker, and routes between views.
import { loadAll, SECTIONS, state } from './store.js';
import { $, esc } from './util.js';

const routes = [
  [/^$/, () => import('./views/browse.js')],
  [/^fridge$/, () => import('./views/fridge.js')],
  [/^mine$/, () => import('./views/mine.js')],
  [/^list$/, () => import('./views/shopping.js')],
  [/^settings$/, () => import('./views/settings.js')],
  [/^new$/, () => import('./views/edit.js'), () => ({ isNew: true })],
  [/^r\/([^/]+)$/, () => import('./views/recipe.js'), (m) => ({ id: m[1] })],
  [/^r\/([^/]+)\/edit$/, () => import('./views/edit.js'), (m) => ({ id: m[1] })],
  [/^r\/([^/]+)\/cook$/, () => import('./views/cook.js'), (m) => ({ id: m[1] })],
  [/^r\/([^/]+)\/compare$/, () => import('./views/compare.js'), (m) => ({ id: m[1] })],
  [/^r\/([^/]+)\/diff$/, () => import('./views/diff.js'), (m) => ({ id: m[1] })],
];

let cleanup = null;
let lastHash = location.hash;
// A view can set this to a function returning a warning message when it has unsaved work.
window.leaveGuard = null;

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, qs] = h.split('?');
  return { path: path.replace(/\/$/, ''), query: new URLSearchParams(qs || '') };
}

async function route() {
  if (window.leaveGuard) {
    const msg = window.leaveGuard();
    if (msg && !confirm(msg)) { history.replaceState(null, '', lastHash || '#/'); return; }
  }
  window.leaveGuard = null;
  lastHash = location.hash;
  const { path, query } = parseHash();
  const view = $('#view');
  cleanup?.(); cleanup = null;
  document.body.classList.remove('cooking');
  for (const [re, load, params] of routes) {
    const m = path.match(re);
    if (!m) continue;
    const mod = await load();
    // Each view gets a fresh element so event listeners never pile up between visits.
    const host = document.createElement('div');
    view.replaceChildren(host);
    window.scrollTo(0, 0);
    cleanup = (await mod.render(host, { ...(params ? params(m) : {}), query })) || null;
    highlightNav(path);
    return;
  }
  view.innerHTML = `<div class="empty"><h2>Page not found</h2><p><a href="#/">Back to recipes</a></p></div>`;
}

function highlightNav(path) {
  const key = path.split('/')[0] || 'browse';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === key || (key === 'r' && a.dataset.nav === 'browse')));
}

function renderSectionSwitch() {
  const vis = SECTIONS.filter((s) => s.visible);
  const el = $('#sections');
  if (vis.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = vis.map((s) => `<button class="${s.id === state.section ? 'on' : ''}" data-sec="${s.id}">${esc(s.name)}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-sec]');
    if (!b) return;
    state.section = b.dataset.sec;
    renderSectionSwitch();
    route();
  };
}

window.addEventListener('beforeunload', (e) => {
  if (window.leaveGuard?.()) { e.preventDefault(); e.returnValue = ''; }
});

async function start() {
  try {
    await loadAll();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty"><h2>Couldn't load recipes</h2><p>${esc(err.message)}</p></div>`;
    throw err;
  }
  renderSectionSwitch();
  window.addEventListener('hashchange', route);
  route();
  // Skipped on localhost so development always sees fresh files.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
