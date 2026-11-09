// On-device text recognition for recipe photos, using Tesseract.js.
// The library (~3 MB) and English language data (~10 MB) download the first
// time you read a photo, then the browser keeps them cached. Photos never
// leave the device.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let scriptP = null;
let workerP = null;
let progressCb = null;

function loadScript() {
  scriptP ||= new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = resolve;
    s.onerror = () => { scriptP = null; reject(new Error('Couldn\'t download the text reader. Check your internet connection (it is only needed the first time).')); };
    document.head.appendChild(s);
  });
  return scriptP;
}

async function getWorker() {
  await loadScript();
  workerP ||= window.Tesseract.createWorker('eng', 1, {
    logger: (m) => progressCb?.(m),
  }).catch((e) => { workerP = null; throw e; });
  return workerP;
}

/**
 * Prepare a photo for recognition: fix orientation, scale to a size Tesseract
 * reads well, convert to grayscale and stretch the contrast.
 */
async function prepare(blob, smooth) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const longSide = Math.max(bmp.width, bmp.height);
  const scale = longSide > 2400 ? 2400 / longSide : longSide < 1400 ? 1400 / longSide : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // Second-pass option: a slight blur smooths heavy camera grain and paper texture,
  // which the contrast stretch would otherwise amplify into fake "letters".
  // It softens clean text, so it is only used when a normal read finds little.
  if (smooth) ctx.filter = `blur(${Math.max(0.8, c.width / 1300).toFixed(2)}px)`;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Grayscale + find the 2nd and 98th percentile for a contrast stretch.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = g; hist[g]++;
  }
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Read the text in one or more photos (e.g. the front and back of a card).
 * onProgress receives a number 0..1 for the current photo.
 */
export async function readPhotos(blobs, onProgress) {
  const worker = await getWorker();
  const parts = [], raw = [];
  for (let i = 0; i < blobs.length; i++) {
    progressCb = (m) => {
      if (m.status === 'recognizing text') onProgress?.((i + m.progress) / blobs.length, 'Reading text');
      else onProgress?.(i / blobs.length, m.status === 'loading language traineddata' ? 'Downloading reader (first time only)' : 'Starting reader');
    };
    let { data } = await worker.recognize(await prepare(blobs[i], false));
    let kept = keepGoodText(data);
    // Grainy or textured photo? Try again smoothed and keep whichever read more usable lines.
    if (countLines(kept) < 4) {
      const second = await worker.recognize(await prepare(blobs[i], true));
      const kept2 = keepGoodText(second.data);
      if (countLines(kept2) > countLines(kept)) { data = second.data; kept = kept2; }
    }
    raw.push(data.text || '');
    parts.push(kept);
  }
  progressCb = null;
  return { text: parts.join('\n\n'), raw: raw.join('\n\n') };
}

/**
 * Drop junk the reader produces from shadows, table edges and handwriting it
 * can't make out: lines it scores as low confidence, and lines that are mostly
 * one- and two-letter fragments. Paragraph breaks are kept (the parser uses them).
 */
const countLines = (t) => t.split('\n').filter((l) => l.trim()).length;

function keepGoodText(data) {
  const good = (line) => {
    const t = line.trim();
    if (!/[A-Za-z0-9]/.test(t)) return false;
    const toks = t.split(/\s+/);
    const real = toks.filter((w) => /^[A-Za-z][a-z']{2,}[,.:;)]?$|^[A-Z]{3,}[,.:]?$|\d/.test(w)).length;
    return toks.length < 3 ? real >= 1 : real / toks.length >= 0.5;
  };
  const paras = data.paragraphs || data.blocks?.flatMap((b) => b.paragraphs || []) || [];
  if (paras.length) {
    return paras.map((p) => (p.lines || [])
      .filter((l) => (l.confidence ?? 100) >= 45 && good(l.text))
      .map((l) => l.text.trim()).join('\n'))
      .filter(Boolean).join('\n\n');
  }
  return (data.text || '').split('\n').filter((l) => !l.trim() || good(l)).join('\n');
}
