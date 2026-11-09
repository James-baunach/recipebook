// Photo inbox: upload recipe photos, watch them get read, then review each draft.
import { $, esc, fmtDate, toast, confirmDialog } from '../util.js';
import { listDrafts, addPhotos, retryDraft, removeDraft, progress } from '../inbox.js';
import { photoURL } from '../store.js';

export async function render(el) {
  el.innerHTML = `
  <section class="inbox">
    <div class="phead"><h1>Recipe photo inbox</h1><a class="btn small" href="#/mine">← My Book</a></div>
    <div class="panel">
      <p>Snap or pick photos of handwritten cards, cookbook pages or printouts. Each one is read <b>on this device</b> and turned into a draft you can check and fix before it goes into your book.</p>
      <div class="actions">
        <label class="btn primary">📷 Take a photo<input type="file" id="cam" accept="image/*" capture="environment" hidden></label>
        <label class="btn">🖼 Choose photos<input type="file" id="pick" accept="image/*" multiple hidden></label>
      </div>
      <label class="checkline"><input type="checkbox" id="asone"> The photos I pick are all <b>one</b> recipe (front and back of a card, two pages)</label>
      <p class="hint">Works best with typed or neatly printed text, flat and well lit, shot straight on. Handwriting is hit-or-miss, so expect to fix more by hand. The first read downloads the reader (~13 MB, one time).</p>
    </div>
    <div id="drafts"></div>
  </section>`;

  const draw = async () => {
    const list = await listDrafts();
    const box = $('#drafts', el);
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="empty small">No drafts yet. Add some photos above.</div>'; return; }
    box.innerHTML = `<ul class="draftlist">${list.map((d) => {
      const p = progress.get(d.id);
      const status = d.status === 'ready' ? `<span class="tag testing">Ready to review</span>`
        : d.status === 'error' ? `<span class="tag bad">Couldn't read</span>`
        : `<span class="tag">${p ? `${esc(p.label)} ${Math.round(p.pct * 100)}%` : 'Waiting…'}</span>`;
      const name = d.draft?.name || (d.status === 'error' ? 'Photo' : 'Reading…');
      const meta = d.draft ? `${d.draft.ingredients.length} ingredients · ${d.draft.steps.length} steps` : esc(d.error || '');
      return `<li>
        <img class="dthumb" data-photo="${esc(d.photoIds[0])}" alt="">
        <div class="dbody"><b>${esc(name)}</b> ${status}<div class="muted small">${meta}${d.photoIds.length > 1 ? ` · ${d.photoIds.length} photos` : ''} · added ${fmtDate(d.created)}</div>
          ${d.status !== 'ready' && d.status !== 'error' && p ? `<div class="bar"><span style="width:${Math.round(p.pct * 100)}%"></span></div>` : ''}
        </div>
        <div class="dbtns">
          ${d.status === 'ready' ? `<a class="btn small primary" href="#/inbox/${d.id}">Review</a>` : ''}
          ${d.status === 'error' ? `<button class="btn small" data-retry="${d.id}">Try again</button>` : ''}
          <button class="icon-btn" data-del="${d.id}" aria-label="Discard" title="Discard">🗑</button>
        </div>
      </li>`;
    }).join('')}</ul>`;
    for (const img of box.querySelectorAll('img[data-photo]')) photoURL(img.dataset.photo).then((u) => u && (img.src = u));
  };

  const onFiles = async (files, asOne) => {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const n = await addPhotos(files, asOne);
    toast(n === 1 ? 'Reading your photo…' : `Reading ${n} recipes…`);
  };
  $('#cam', el).onchange = (e) => { onFiles(e.target.files, false); e.target.value = ''; };
  $('#pick', el).onchange = (e) => { onFiles(e.target.files, $('#asone', el).checked); e.target.value = ''; };

  el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-retry]');
    if (r) { retryDraft(r.dataset.retry); return; }
    const d = e.target.closest('[data-del]');
    if (d && await confirmDialog('Discard draft?', 'Delete this draft and its photo?', 'Discard', true)) { await removeDraft(d.dataset.del); }
  });

  // Live updates while photos are being read (throttled so progress doesn't thrash the list).
  let pending = false;
  const onChange = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; draw(); }, 300); };
  window.addEventListener('inbox-change', onChange);
  await draw();
  return () => window.removeEventListener('inbox-change', onChange);
}
