// Client for the free Cloudflare "recipe helper" (worker/recipe-helper.js).
// Recipe sites don't let browser apps read their pages directly; the helper
// fetches a page server-side and returns only the structured recipe data.
import { state } from './store.js';

export const helperReady = () => !!state.settings.workerUrl;

async function call(path, params) {
  const base = state.settings.workerUrl.replace(/\/+$/, '');
  if (!base) throw new Error('The recipe helper is not set up yet (Settings → Web recipe helper).');
  const qs = new URLSearchParams(params);
  if (state.settings.workerKey) qs.set('key', state.settings.workerKey);
  let res;
  try {
    res = await fetch(`${base}${path}?${qs}`);
  } catch {
    throw new Error("Couldn't reach the recipe helper. Check your connection and the helper URL in Settings.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Helper error ${res.status}`);
  return body;
}

export const ping = () => call('/ping', {});
export const searchWeb = (q) => call('/search', { q });
export const fetchRecipe = (url) => call('/recipe', { url });
