// "Log a cook" dialog: date, version, rating, notes, optional photo.
import { modal, today, compressImage, toast, esc } from '../util.js';
import { addAttempt, savePhoto, getRecipe } from '../store.js';

export async function logCookDialog(id, v) {
  const r = getRecipe(id, v);
  const versions = r.rec?.versions || [r.version];
  let rating = 0;
  let photoFile = null;
  const body = `
    <label class="field">Date <input type="date" id="ldate" value="${today()}"></label>
    <label class="field">Version cooked
      <select id="lver">${versions.map((x) => `<option value="${x.v}" ${x.v === r.v ? 'selected' : ''}>v${x.v}${x.note ? ' — ' + esc(x.note.slice(0, 50)) : ''}</option>`).join('')}</select>
    </label>
    <div class="field">How was it?
      <div class="rate" id="lrate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
    </div>
    <label class="field">Notes — what worked, what to change next time
      <textarea id="lnotes" rows="4" placeholder="e.g. Too salty — cut soy sauce in half. Sear longer for more crust."></textarea>
    </label>
    <label class="field">Photo (optional) <input type="file" id="lphoto" accept="image/*"></label>
    <img id="lprev" class="lprev" hidden alt="">`;
  const res = await modal({
    title: `Log a cook: ${r.data.name}`,
    body,
    onOpen: (w) => {
      const rate = w.querySelector('#lrate');
      rate.onclick = (e) => {
        const b = e.target.closest('[data-n]');
        if (!b) return;
        rating = +b.dataset.n === rating ? 0 : +b.dataset.n;
        rate.querySelectorAll('button').forEach((x) => x.classList.toggle('on', +x.dataset.n <= rating));
      };
      w.querySelector('#lphoto').onchange = (e) => {
        photoFile = e.target.files[0] || null;
        const img = w.querySelector('#lprev');
        img.hidden = !photoFile;
        if (photoFile) img.src = URL.createObjectURL(photoFile);
      };
    },
    actions: [
      { label: 'Cancel', value: null },
      {
        label: 'Save to log', kind: 'primary',
        collect: (w) => ({ date: w.querySelector('#ldate').value || today(), v: +w.querySelector('#lver').value, notes: w.querySelector('#lnotes').value.trim(), rating }),
      },
    ],
  });
  if (!res) return false;
  if (photoFile) {
    try { res.photo = await savePhoto(await compressImage(photoFile)); } catch { toast("Couldn't read that photo"); }
  }
  await addAttempt(id, res);
  toast('Cook logged');
  return true;
}
