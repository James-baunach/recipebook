// My Book: the dishes you've touched — favorites, in testing, finals, your own recipes.
import { $, esc, fmtDate } from '../util.js';
import { listItems } from '../store.js';
import { renderCardList } from './cards.js';

const TABS = [
  ['testing', 'Testing', (it) => it.status === 'testing'],
  ['final', '★ Final', (it) => it.status === 'final'],
  ['favorites', '♥ Favorites', (it) => it.favorite],
  ['recent', 'Recently cooked', (it) => !!it.lastCooked],
  ['mine', 'My own recipes', (it) => it.custom],
];
let tab = 'testing';

export function render(el) {
  const items = listItems();
  const counts = Object.fromEntries(TABS.map(([k, , f]) => [k, items.filter(f).length]));
  const draw = () => {
    const [, , f] = TABS.find((t) => t[0] === tab);
    let list = items.filter(f);
    if (tab === 'recent') list.sort((a, b) => b.lastCooked.localeCompare(a.lastCooked));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    $('#mtabs', el).innerHTML = TABS.map(([k, t]) => `<button class="chip ${k === tab ? 'on' : ''}" data-t="${k}">${esc(t)} <small>${counts[k]}</small></button>`).join('');
    renderCardList($('#mres', el), list, {
      empty: {
        testing: 'Nothing in testing yet. Edit a recipe, log a cook, or build a version in Compare and it shows up here.',
        final: 'No finals yet. When a version is the one, open it and tap ★ Make final.',
        favorites: 'Tap ♥ on any recipe to keep it here.',
        recent: 'Log a cook from any recipe to see it here.',
        mine: 'Recipes you create from scratch show up here.',
      }[tab],
      extra: tab === 'recent' ? (it) => `<div class="cdesc">Last cooked ${fmtDate(it.lastCooked)} · ${it.versions} version${it.versions > 1 ? 's' : ''}</div>`
        : (it) => `<div class="cdesc">${it.versions} version${it.versions > 1 ? 's' : ''}${it.lastCooked ? ` · last cooked ${fmtDate(it.lastCooked)}` : ''}</div>`,
    });
  };
  el.innerHTML = `
  <section>
    <div class="phead"><h1>My Book</h1><a class="btn primary small" href="#/new">+ New recipe</a></div>
    <div class="chips" id="mtabs"></div>
    <div id="mres"></div>
  </section>`;
  $('#mtabs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  draw();
}
