// Cook mode: big text, screen kept awake, steps checked off, tap-to-start timers.
import { $, esc, toast } from '../util.js';
import { getRecipe, state } from '../store.js';
import { scaleLine, isHeader, headerText, findTimers } from '../parse.js';
import { servingsMemory } from './recipe.js';
import { logCookDialog } from './logcook.js';

let audioCtx;
function beep() {
  try {
    audioCtx ||= new AudioContext();
    const t = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t + i * 0.45);
      g.gain.exponentialRampToValueAtTime(0.4, t + i * 0.45 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.45 + 0.35);
      o.start(t + i * 0.45); o.stop(t + i * 0.45 + 0.4);
    }
  } catch { /* no audio */ }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

const fmtClock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };

export function render(el, { id, query }) {
  const r = getRecipe(id, query.get('v') ? +query.get('v') : undefined);
  if (!r) { el.innerHTML = '<div class="empty"><h2>Recipe not found</h2></div>'; return; }
  const d = r.data;
  const servings = servingsMemory.get(id + ':' + r.v) || +d.servings;
  const factor = servings / (+d.servings || 4);
  const units = state.settings.units;
  const done = new Set();
  const haveIng = new Set();
  let cur = 0;
  const timers = []; // {id, label, end, total, paused, left, fired}
  let wake = null;
  document.body.classList.add('cooking');

  const stepIdx = d.steps.map((s, i) => (isHeader(s) ? -1 : i)).filter((i) => i >= 0);

  el.innerHTML = `
  <div class="cook">
    <div class="cookbar">
      <a class="btn" href="#/r/${encodeURIComponent(id)}">✕ Exit</a>
      <div class="cooktitle">${esc(d.name)} <small>v${r.v} · ${servings} servings</small></div>
      <span id="wake" class="muted small"></span>
    </div>
    <div class="timers" id="timers"></div>
    <details class="cookings" open>
      <summary>Ingredients <small class="muted">(tap to mark as ready)</small></summary>
      <ul>${d.ingredients.map((l, i) => isHeader(l) ? `<li class="ihead">${esc(headerText(l))}</li>` : `<li data-ing="${i}">${esc(scaleLine(l, factor, units))}</li>`).join('')}</ul>
    </details>
    <ol class="cooksteps" id="steps">
      ${d.steps.map((s, i) => isHeader(s) ? `<li class="shead">${esc(headerText(s))}</li>` : `
        <li data-step="${i}">
          <div class="stext">${esc(s)}</div>
          <div class="sbtns">${findTimers(s).map((t) => `<button class="btn timer-btn" data-sec="${t.seconds}" data-label="${esc(t.label)}">⏱ ${esc(t.label)}</button>`).join('')}
          <button class="btn donebtn">✓ Done</button></div>
        </li>`).join('')}
    </ol>
    <div class="cookend">
      <button class="btn primary" id="logit">✎ Log this cook</button>
      <a class="btn" href="#/r/${encodeURIComponent(id)}">Back to recipe</a>
    </div>
  </div>`;

  const paint = () => {
    el.querySelectorAll('[data-step]').forEach((li) => {
      const i = +li.dataset.step;
      li.classList.toggle('done', done.has(i));
      li.classList.toggle('current', i === cur);
    });
  };
  const advance = () => { cur = stepIdx.find((i) => !done.has(i)) ?? -1; paint(); const c = el.querySelector('.current'); c?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  paint();

  $('#steps', el).addEventListener('click', (e) => {
    const li = e.target.closest('[data-step]');
    if (!li) return;
    const i = +li.dataset.step;
    const tb = e.target.closest('.timer-btn');
    if (tb) { addTimer(+tb.dataset.sec, tb.dataset.label, i); return; }
    if (e.target.closest('.donebtn')) { done.has(i) ? done.delete(i) : done.add(i); advance(); return; }
    cur = i; paint();
  });
  el.querySelector('.cookings ul').addEventListener('click', (e) => {
    const li = e.target.closest('[data-ing]');
    if (!li) return;
    const i = +li.dataset.ing;
    haveIng.has(i) ? haveIng.delete(i) : haveIng.add(i);
    li.classList.toggle('done', haveIng.has(i));
  });
  $('#logit', el).onclick = async () => { if (await logCookDialog(id, r.v)) location.hash = `#/r/${encodeURIComponent(id)}`; };

  // ----- timers -----
  function addTimer(sec, lbl, step) {
    const stepText = d.steps[step].slice(0, 40);
    timers.push({ id: Math.random(), label: `${lbl} — ${stepText}${d.steps[step].length > 40 ? '…' : ''}`, end: Date.now() + sec * 1000, total: sec, paused: false, left: sec, fired: false });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    drawTimers();
  }
  function drawTimers() {
    const box = $('#timers', el);
    if (!box) return;
    box.innerHTML = timers.map((t) => {
      const left = t.paused ? t.left : (t.end - Date.now()) / 1000;
      return `<div class="timer ${left <= 0 ? 'ring' : ''}" data-t="${t.id}">
        <span class="tclock">${left <= 0 ? 'Done!' : fmtClock(left)}</span><span class="tlabel">${esc(t.label)}</span>
        ${left > 0 ? `<button class="icon-btn" data-act="pause">${t.paused ? '▶' : '❚❚'}</button><button class="icon-btn" data-act="plus">+1</button>` : ''}
        <button class="icon-btn" data-act="x">✕</button></div>`;
    }).join('');
  }
  $('#timers', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const t = timers.find((x) => String(x.id) === b.closest('[data-t]').dataset.t);
    if (b.dataset.act === 'x') timers.splice(timers.indexOf(t), 1);
    if (b.dataset.act === 'plus') { if (t.paused) t.left += 60; else t.end += 60000; }
    if (b.dataset.act === 'pause') {
      if (t.paused) { t.end = Date.now() + t.left * 1000; t.paused = false; } else { t.left = (t.end - Date.now()) / 1000; t.paused = true; }
    }
    drawTimers();
  });
  const tick = setInterval(() => {
    for (const t of timers) {
      if (!t.paused && !t.fired && t.end <= Date.now()) {
        t.fired = true;
        beep();
        toast(`Timer done: ${t.label}`);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Timer done', { body: t.label });
      }
    }
    if (timers.length) drawTimers();
  }, 500);

  // ----- keep screen awake -----
  async function lock() {
    try {
      wake = await navigator.wakeLock.request('screen');
      $('#wake', el) && ($('#wake', el).textContent = 'Screen stays on');
    } catch { $('#wake', el) && ($('#wake', el).textContent = ''); }
  }
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  if ('wakeLock' in navigator) { lock(); document.addEventListener('visibilitychange', onVis); }

  window.leaveGuard = () => (timers.some((t) => !t.fired) ? 'You have timers running. Leave cook mode?' : null);
  return () => {
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVis);
    wake?.release?.();
    document.body.classList.remove('cooking');
  };
}
