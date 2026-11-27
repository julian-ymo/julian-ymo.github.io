/* Lumora Film web — core: state, storage, workers, shared controls. Mirrors ui/EditorViewModel.kt and ui/Kit.kt. */
'use strict';
const M = FDM, F = FDF;
const C = { bg: '#0B0B0C', surface: '#17181A', surface2: '#222326', line: '#2E3034', text: '#F1F0EC', muted: '#A3A39E', amber: '#F2A33A', onAmber: '#1A1206' };
const PREVIEW_EDGE = 1440, THUMB_EDGE = 200, STUDIO_THUMB_EDGE = 360;
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const RAW_ACCEPT = '.raf,.dng,.cr2,.cr3,.crw,.nef,.nrw,.arw,.srf,.sr2,.orf,.rw2,.raw,.pef,.srw,.3fr,.fff,.iiq,.rwl,.x3f,.erf,.kdc,.dcr,.mrw,.mos,.mef';
const MAX_EXPORT_PIXELS = IS_IOS ? 16e6 : ((navigator.deviceMemory || 8) <= 4 ? 24e6 : 60e6);

// ------------------------------------------------------------------ DOM helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const icon = (name, size) => h('span', { class: 'material-icons', 'aria-hidden': 'true', style: size ? { fontSize: size + 'px' } : null }, name);
const iconBtn = (name, label, onclick, opts = {}) => h('button', Object.assign({ class: 'icon-btn' + (opts.sm ? ' sm' : ''), 'aria-label': label, title: label, onclick, disabled: !!opts.disabled, style: opts.color ? { color: opts.color } : null }), icon(name, opts.size));
const clamp = M.clamp;
const signedInt = v => v > 0 ? '+' + v : v < 0 ? '−' + (-v) : '0';
function dprCanvas(cv, w, h) {
  const d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return g;
}
function imgToCanvas(img, cv) {
  cv = cv || document.createElement('canvas');
  cv.width = img.w; cv.height = img.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.buf || img.data.buffer), img.w, img.h), 0, 0);
  return cv;
}

// ------------------------------------------------------------------ state
const S = {
  screen: 'studio', backStack: [],
  studio: [], thumbs: new Map(), missing: new Set(),
  selection: new Set(), selectMode: false, clipboard: null, justPasted: new Set(), filter: 'All', batchProgress: null,
  // editor
  currentId: null, params: M.defaults(), committed: M.defaults(), undo: [], redo: [],
  tab: 'Film', sheet: null, sheetBefore: null, loading: false, rendering: false,
  source: null, thumbSource: null, stats: null, fullW: 0, fullH: 0, previewFor: null, previewCrop: false,
  simThumbs: [], curveMode: false, curveCh: 0, softCh: 0, picker: false, sample: null, samplePos: null, histogram: null,
  cropGuide: 'Thirds', guideTurn: 0, cropHandle: null, straightening: false, cropResets: 0, dragging: false,
  // recipes / export
  recipes: [], recipeThumbs: new Map(), recipeTargets: new Set(), recipesFromStudio: false,
  exportSettings: M.exportDefaults(), exportPresets: [], exportTargets: [], exporting: false, exportEstimate: null,
};

// ------------------------------------------------------------------ storage
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('filmdesk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      if (!this.db) return res(null);
      const t = this.db.transaction('photos', mode), st = t.objectStore('photos');
      const out = fn(st);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.tx('readonly', st => st.getAll()); },
  put(item) { return this.tx('readwrite', st => st.put(item)); },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem('fd.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('fd.' + k, JSON.stringify(v)); } catch (_) { /* storage full or blocked */ } },
};
function saveRecipes() { LS.set('recipes', S.recipes.map(r => ({ id: r.id, name: r.name, params: M.toJson(r.params) }))); }
function loadRecipes() {
  const raw = LS.get('recipes', null);
  if (!raw) { S.recipes = M.starterRecipes(); saveRecipes(); return; }
  S.recipes = raw.map(r => ({ id: r.id, name: String(r.name || 'Recipe').slice(0, 60), params: M.withoutGeometry(M.fromJson(r.params)) }));
}

// ------------------------------------------------------------------ workers
const W = {
  main: null, thumbs: null, jobs: new Map(), jobSeq: 0,
  init() {
    this.main = new Worker('worker.js?v=5');
    this.thumbs = new Worker('worker.js?v=5');
    this.main.onmessage = e => onMainWorker(e.data);
    this.thumbs.onmessage = e => this.route(e.data);
    this.exportW = null;
  },
  route(m) {
    const j = this.jobs.get(m.job);
    if (!j) return;
    if (m.type === 'thumb') j.onThumb && j.onThumb(m);
    else if (m.type === 'thumbsDone' || m.type === 'exported' || m.type === 'resized' || m.type === 'rawDone') { this.jobs.delete(m.job); j.resolve(m); }
    else if (m.type === 'error') { this.jobs.delete(m.job); j.reject(new Error(m.message)); }
  },
  /** Runs a job on the background worker (thumbnails) or a fresh export worker. */
  run(target, msg, transfer, onThumb) {
    const job = ++this.jobSeq;
    return new Promise((resolve, reject) => {
      this.jobs.set(job, { resolve, reject, onThumb });
      let w = this.thumbs;
      if (target === 'export') {
        if (!this.exportW) { this.exportW = new Worker('worker.js?v=5'); this.exportW.onmessage = e => this.route(e.data); }
        w = this.exportW;
      } else if (target === 'raw') {
        // RAW develops one at a time in their own worker (they are big).
        if (!this.rawW) { this.rawW = new Worker('worker.js?v=5'); this.rawW.onmessage = e => this.route(e.data); }
        w = this.rawW;
      }
      w.postMessage(Object.assign({ job }, msg), transfer || []);
    });
  },
};
const packImg = img => ({ w: img.w, h: img.h, buf: img.data.buffer });
const cloneImg = img => ({ w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) });

// ------------------------------------------------------------------ decoding
async function bitmapOf(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (_) {
    // Fallback through <img> (older Safari, some HEIC on Safari).
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image(); im.decoding = 'async'; im.src = url;
      await im.decode();
      return im;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
const bmpW = b => b.naturalWidth || b.width, bmpH = b => b.naturalHeight || b.height;
/** Draws [bmp] scaled to fit [maxEdge] (or exactly tw×th) and returns RGBA pixels. Steps down by halves for quality. */
function pixelsOf(bmp, tw, th) {
  let src = bmp, sw = bmpW(bmp), sh = bmpH(bmp);
  while (sw / 2 >= tw * 1.05 && sh / 2 >= th * 1.05 && sw * sh > 4e6) {
    const c = document.createElement('canvas'); c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  const d = g.getImageData(0, 0, tw, th);
  return { w: tw, h: th, data: d.data };
}
/** True when [blob] is a camera RAW (by name / type, or the Fujifilm RAF header). Cached per blob. */
const rawCache = new WeakMap();
async function isRawBlob(blob) {
  if (!blob) return false;
  if (rawCache.has(blob)) return rawCache.get(blob);
  let raw = FDR.isRawName(blob.name, blob.type);
  if (!raw && !/^image\/(jpe?g|png|webp|gif|bmp|avif|hei[cf])$/i.test(blob.type || '')) {
    try { raw = FDR.isRawHeader(new Uint8Array(await blob.slice(0, 16).arrayBuffer())); } catch (_) { }
  }
  rawCache.set(blob, raw);
  return raw;
}
/** Develops a RAW in the background. Half-size develop when [maxEdge] allows (as in the app). */
async function developRaw(blob, maxEdge, fit) {
  const buf = await blob.arrayBuffer();
  const m = await W.run('raw', { type: 'raw', buf, maxEdge, fit }, [buf]);
  return { img: { w: m.img.w, h: m.img.h, data: new Uint8ClampedArray(m.img.buf) }, fullW: m.fullW, fullH: m.fullH };
}
async function decodeBlob(blob, maxEdge) {
  if (await isRawBlob(blob)) return developRaw(blob, maxEdge, maxEdge);
  const bmp = await bitmapOf(blob);
  const w = bmpW(bmp), hh = bmpH(bmp);
  const k = Math.min(1, maxEdge / Math.max(w, hh));
  const img = pixelsOf(bmp, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(hh * k)));
  if (bmp.close) bmp.close();
  return { img, fullW: w, fullH: hh };
}
function downscale(img, maxEdge) {
  const k = Math.min(1, maxEdge / Math.max(img.w, img.h));
  if (k >= 1) return cloneImg(img);
  const c = imgToCanvas(packImg(cloneImg(img)));
  return pixelsOf(c, Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)));
}

// ------------------------------------------------------------------ toast / dialogs / menus
let toastTimer = 0;
function toast(text, undo) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'grow' }, text),
    undo ? h('button', { onclick: () => { t.remove(); undo(); } }, 'Undo') : null);
  document.getElementById('app').append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), undo ? 8000 : 4000);
}
function closeOverlays() { document.querySelectorAll('.scrim').forEach(s => s.remove()); }
function dialog(title, body, buttons) {
  const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) scrim.remove(); } });
  const close = () => scrim.remove();
  scrim.append(h('div', { class: 'dialog', role: 'dialog', 'aria-label': title },
    h('h3', null, title), body,
    h('div', { class: 'btns' }, buttons.map(b => h('button', { style: { color: b.color || C.amber }, onclick: () => { if (b.onclick(close) !== false) close(); } }, b.label)))));
  document.body.append(scrim);
  const inp = scrim.querySelector('input, textarea');
  if (inp) setTimeout(() => inp.focus(), 30);
  return close;
}
function confirmDialog(title, okLabel, onOk) {
  dialog(title, null, [{ label: 'Cancel', color: C.muted, onclick: () => {} }, { label: okLabel, onclick: onOk }]);
}
function popupMenu(anchor, items) {
  const scrim = h('div', { class: 'scrim clear', onclick: e => { if (e.target === scrim) scrim.remove(); } });
  const menu = h('div', { class: 'menu', role: 'menu' }, items.map(it => it === '-' ? h('hr') :
    h('button', { role: 'menuitem', disabled: it.disabled, onclick: () => { scrim.remove(); it.onclick(); } }, it.icon ? icon(it.icon) : null, it.label)));
  scrim.append(menu); document.body.append(scrim);
  const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
  menu.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh) : r.bottom) + 'px';
}
/** "What to paste" sheet, used by the Studio and the editor. */
function pasteSheet(title, from, confirm, onPaste) {
  const parts = new Set(M.PASTE_PARTS.filter(p => p.on).map(p => p.id));
  const scrim = h('div', { class: 'scrim sheet-scrim', onclick: e => { if (e.target === scrim) scrim.remove(); } });
  const draw = () => {
    scrim.innerHTML = '';
    const allOn = parts.size === M.PASTE_PARTS.length;
    scrim.append(h('div', { class: 'sheet' }, h('div', { class: 'grip' }),
      h('div', { class: 'scroll-y', style: { padding: '0 20px 8px' } },
        h('div', { style: { fontSize: '19px', fontWeight: 600 } }, title),
        h('div', { class: 'muted', style: { fontSize: '12px', margin: '2px 0 8px' } }, 'From ' + from + ' · choose what to paste'),
        h('div', { class: 'row' }, h('div', { class: 'label grow' }, 'What to paste'),
          h('button', { class: 'text-btn', style: { color: C.amber, fontWeight: 600 }, onclick: () => { if (allOn) parts.clear(); else M.PASTE_PARTS.forEach(p => parts.add(p.id)); draw(); } }, allOn ? 'Clear all' : 'Select all')),
        M.PASTE_PARTS.map(p => h('div', { class: 'check-row', role: 'checkbox', 'aria-checked': String(parts.has(p.id)), tabindex: 0,
          onclick: () => { parts.has(p.id) ? parts.delete(p.id) : parts.add(p.id); draw(); } },
          h('div', { class: 'cbox' + (parts.has(p.id) ? ' on' : '') }, parts.has(p.id) ? icon('check') : null),
          h('div', { class: 'grow' }, h('div', { style: { fontSize: '15px' } }, p.title), h('div', { class: 'muted', style: { fontSize: '12px' } }, p.subtitle))))),
      h('div', { class: 'row', style: { gap: '10px', padding: '10px 20px 16px' } },
        h('button', { class: 'btn outline grow', onclick: () => scrim.remove() }, 'Cancel'),
        h('button', { class: 'btn primary grow', disabled: parts.size === 0, onclick: () => { scrim.remove(); onPaste(parts); } }, confirm))));
  };
  draw();
  document.body.append(scrim);
}

// ------------------------------------------------------------------ shared controls (ui/Kit.kt)
/** Live hooks: refreshed on every params change while a slider is dragged (no DOM rebuild mid-gesture). */
let liveHooks = [];
function live(fn) { liveHooks.push(fn); return fn; }
function runLive() { liveHooks.forEach(f => f()); }

/**
 * VSCO-style slider: ticks, a mark at "no change", amber fill from there and a white knob.
 * Only a sideways drag changes it, the value moves from where it was (never jumps), long ranges move
 * at half speed, double-click/tap goes back to origin, arrow keys nudge.
 */
function tickSlider(o) {
  const { min, max, step } = o;
  const origin = o.origin != null ? o.origin : clamp(0, min, max);
  const resetTo = o.resetTo != null ? o.resetTo : origin;
  const color = o.color || C.amber;
  const stepsTotal = Math.max(1, Math.round((max - min) / step));
  const ticks = stepsTotal <= 24 ? stepsTotal : 20;
  const snap = v => clamp(min + Math.round((v - min) / step) * step, min, max);
  let value = o.value;
  const cv = h('canvas', { tabindex: 0, role: 'slider', 'aria-label': o.description || '', 'aria-valuemin': min, 'aria-valuemax': max });
  const draw = () => {
    const w = cv.clientWidth || 300, H = 40, pad = 14, cy = H / 2, ww = w - 2 * pad;
    const g = dprCanvas(cv, w, H);
    g.clearRect(0, 0, w, H);
    const xOf = v => pad + (v - min) / (max - min) * ww;
    g.strokeStyle = C.line; g.lineWidth = 1.5; g.beginPath(); g.moveTo(pad, cy); g.lineTo(pad + ww, cy); g.stroke();
    g.strokeStyle = 'rgba(163,163,158,.6)'; g.lineWidth = 1;
    for (let i = 0; i <= ticks; i++) { const x = pad + ww * i / ticks, th = (i === 0 || i === ticks) ? 6 : 4; g.beginPath(); g.moveTo(x, cy - th); g.lineTo(x, cy + th); g.stroke(); }
    const ox = xOf(origin);
    g.strokeStyle = 'rgba(241,240,236,.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ox, cy - 9); g.lineTo(ox, cy + 9); g.stroke();
    const vx = xOf(clamp(value, min, max));
    if (Math.abs(vx - ox) > 0.5) { g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath(); g.moveTo(ox, cy); g.lineTo(vx, cy); g.stroke(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(vx, cy, 9, 0, Math.PI * 2); g.fill();
    cv.setAttribute('aria-valuenow', value);
    cv.setAttribute('aria-valuetext', o.valueText ? o.valueText(value) : String(value));
  };
  const set = v => { v = snap(v); if (v !== value) { value = v; draw(); o.onChange(v); } };
  let start = null;
  cv.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, v: value, id: e.pointerId, drag: false }; });
  cv.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.drag) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { start.drag = true; S.dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } }
      else if (Math.abs(dy) > 10) { start = null; return; }
      else return;
    }
    e.preventDefault();
    // 1:1 with the finger: moving the full track width covers the full range.
    const ww = Math.max(1, cv.clientWidth - 28);
    set(start.v + dx / ww * (max - min));
  });
  // Tap the track to jump there; double-tap goes back to the default.
  let tapTimer = 0, lastTap = 0;
  const at = x => { const r = cv.getBoundingClientRect(); return min + clamp((x - r.left - 14) / Math.max(1, r.width - 28), 0, 1) * (max - min); };
  const end = e => {
    if (start && start.drag) { start = null; dragEnded(); o.onEnd && o.onEnd(); return; }
    if (!start || e.type !== 'pointerup') { start = null; return; }
    start = null;
    const now = Date.now(), x = e.clientX;
    clearTimeout(tapTimer);
    if (now - lastTap < 300) { lastTap = 0; set(resetTo); o.onEnd && o.onEnd(); return; }
    lastTap = now;
    tapTimer = setTimeout(() => { set(at(x)); o.onEnd && o.onEnd(); }, 260);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', e => {
    const k = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (k) { e.preventDefault(); set(value + k * step); o.onEnd && o.onEnd(); }
  });
  const wrap = h('div', { class: 'tick' }, cv,
    (o.minLabel != null || o.maxLabel != null || o.midLabel != null) ? h('div', { class: 'ends' }, h('span', null, o.minLabel || ''), h('span', null, o.midLabel || ''), h('span', null, o.maxLabel || '')) : null);
  wrap.update = v => { if (v !== value) { value = v; draw(); } };
  requestAnimationFrame(draw);
  new ResizeObserver(draw).observe(cv);
  return wrap;
}

/** Title + big value ("HIGHLIGHT  −1"); with onNudge, ‹ › move it one step. */
function bigValue(title, valueFn, changedFn, onNudge) {
  const v = h('div', { class: 'v' });
  const upd = () => { v.textContent = valueFn(); v.classList.toggle('changed', !!changedFn()); };
  upd(); live(upd);
  return h('div', { class: 'big' }, title ? h('div', { class: 't' }, title) : null,
    h('div', { class: 'row' },
      onNudge ? iconBtn('keyboard_arrow_left', 'One step less', () => onNudge(-1)) : null, v,
      onNudge ? iconBtn('keyboard_arrow_right', 'One step more', () => onNudge(1)) : null));
}

/** Round Q-menu dial showing the current value; orange when changed. */
function valueDial(value, label, changed, onclick, opts = {}) {
  const words = value.split(' ').filter(Boolean), two = value.length > 6 && words.length === 2;
  const longest = two ? Math.max(...words.map(w => w.length)) : value.length;
  const fs = longest >= 7 ? 7.5 : longest >= 6 ? 8.5 : longest >= 5 ? 9.5 : 11;
  return h('button', { class: 'dial' + (changed && !opts.dimmed ? ' changed' : '') + (opts.dimmed ? ' dimmed' : '') + (opts.selected ? ' selected' : ''), onclick, 'aria-pressed': opts.selected ? 'true' : null, 'aria-label': label + ': ' + value },
    h('div', { class: 'circle', style: { fontSize: fs + 'px' } }, two ? words.join('\n') : value),
    h('div', { class: 'lbl ellipsis' }, label));
}

/** Round Pro tool: icon, orange dot when changed, label and value. */
function toolCircle(iconName, label, value, changed, onclick) {
  return h('button', { class: 'tool' + (changed ? ' changed' : ''), onclick, 'aria-label': label + ': ' + value },
    h('div', { class: 'circle' }, icon(iconName), changed ? h('div', { class: 'dot' }) : null),
    h('div', { class: 'lbl' }, label), h('div', { class: 'val' }, value));
}

/** Picture choice tile. */
function picTile(label, selected, onclick, opts = {}) {
  const cv = h('canvas');
  const el = h('button', { class: 'pictile' + (selected ? ' on' : ''), onclick, role: 'radio', 'aria-checked': String(selected), 'aria-label': label.replace('\n', ' ') },
    h('div', { class: 'box' }, opts.draw ? cv : null, opts.text ? h('span', null, opts.text) : null), h('div', { class: 'lbl' }, label));
  if (opts.draw) requestAnimationFrame(() => { const g = dprCanvas(cv, 54, 54); opts.draw(g, 54, 54); });
  return el;
}

/** Bottom option panel: content, then ✕ · Reset · ✓. */
function optionPanel(content, { onCancel, onReset, onDone, hint }) {
  return h('div', { class: 'opt' },
    h('div', { class: 'opt-body' }, content),
    h('div', { class: 'row opt-bar' },
      iconBtn('close', 'Cancel', onCancel),
      h('div', { class: 'row grow', style: { justifyContent: 'center', gap: '4px', minWidth: 0 } },
        onReset ? h('button', { class: 'text-btn', style: { color: C.text }, onclick: onReset }, 'Reset') : null,
        hint ? h('span', { class: 'hint ellipsis' }, hint) : null),
      iconBtn('check', 'Done', onDone, { color: C.amber })));
}

/** Seeded random, so tile pictures don't change between renders. */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
