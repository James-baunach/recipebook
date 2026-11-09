// Recipe card list shared by Browse, Fridge and My Book.
import { esc, fmtMin, $$ } from '../util.js';
import { photoURL, label, DIFFS } from '../store.js';

const STATUS = { final: '<span class="tag final">★ Final</span>', testing: '<span class="tag testing">Testing</span>', untested: '' };

export function cardHTML(it, extra = '') {
  return `<a class="card" href="#/r/${encodeURIComponent(it.id)}">
    <div class="thumb r-${it.region}">${it.photo ? `<img data-photo="${esc(it.photo)}" alt="">` : `<span class="emoji">${it.icon}</span>`}</div>
    <div class="cbody">
      <div class="cname">${esc(it.name)}</div>
      <div class="cmeta">${esc(it.cuisine)} · ${fmtMin(it.total)} · ${label(DIFFS, it.difficulty)}</div>
      ${extra || `<div class="cdesc">${esc(it.desc)}</div>`}
    </div>
    <div class="cflags">${it.favorite ? '<span class="fav" title="Favorite">♥</span>' : ''}${STATUS[it.status] || ''}</div>
  </a>`;
}

/** Render items progressively into `el`, with a "show more" sentinel. */
export function renderCardList(el, items, { extra, pageSize = 60, empty = 'No recipes match.' } = {}) {
  let shown = 0;
  el.innerHTML = '';
  if (!items.length) { el.innerHTML = `<div class="empty small">${empty}</div>`; return; }
  const list = document.createElement('div');
  list.className = 'cards';
  el.appendChild(list);
  const more = document.createElement('button');
  more.className = 'btn more';
  el.appendChild(more);
  const page = () => {
    const next = items.slice(shown, shown + pageSize);
    list.insertAdjacentHTML('beforeend', next.map((it) => cardHTML(it, extra?.(it))).join(''));
    shown += next.length;
    more.hidden = shown >= items.length;
    more.textContent = `Show more (${items.length - shown} left)`;
    loadPhotos(list);
  };
  more.onclick = page;
  const io = new IntersectionObserver((ents) => { if (ents[0].isIntersecting && shown < items.length) page(); }, { rootMargin: '600px' });
  io.observe(more);
  page();
}

export async function loadPhotos(root) {
  for (const img of $$('img[data-photo]:not([src])', root)) {
    const u = await photoURL(img.dataset.photo);
    if (u) img.src = u;
  }
}
