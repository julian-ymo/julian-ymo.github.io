/* Film Desk web — view model: navigation, Studio, editing, history, recipes, export (ui/EditorViewModel.kt). */
'use strict';

// ------------------------------------------------------------------ navigation (browser Back works too)
function go(screen) {
  S.backStack.push(S.screen);
  S.screen = screen;
  history.pushState({ fd: S.backStack.length }, '');
  render();
}
function back() { history.back(); }
let skipPop = 0;
window.addEventListener('popstate', () => {
  if (skipPop) { skipPop--; return; }
  if (document.querySelector('.scrim')) { closeOverlays(); history.pushState({ fd: S.backStack.length }, ''); return; }
  if (S.screen === 'editor' && S.curveMode) { closeCurve(true); return; }
  if (S.screen === 'editor' && S.sheet) {
    history.pushState({ fd: S.backStack.length }, '');
    doneSheet(); // Back closes the open panel and keeps its changes (✕ cancels).
    return;
  }
  if (S.screen === 'studio') { if (S.selectMode || S.selection.size) { clearSelection(); } return; }
  doBack();
});
function doBack() {
  const from = S.screen;
  if (from === 'editor') {
    if (S.sheet) doneSheet(true);
    flushSave();
    const id = S.currentId;
    if (id != null) refreshThumb(id);
  }
  if (from === 'recipes') { S.recipesFromStudio = false; }
  if (from === 'export' && S.exportTargets.length && !S.exporting) S.exportTargets = [];
  S.screen = S.backStack.pop() || 'studio';
  render();
}

// ------------------------------------------------------------------ Studio
async function loadStudio() {
  try { await DB.open(); } catch (e) { toast('Storage is blocked in this browser, so photos are kept only until you close the tab.'); }
  const all = (await DB.all().catch(() => null)) || [];
  all.sort((a, b) => b.added - a.added);
  S.studio = all.map(it => ({ id: it.id, name: it.name, added: it.added, params: it.params ? M.fromJson(it.params) : null, blob: it.blob, thumb: it.thumb || null, raw: !!it.raw }));
}
function storeItem(it) {
  return DB.put({ id: it.id, name: it.name, added: it.added, params: it.params ? M.toJson(it.params) : null, blob: it.blob, thumb: it.thumb || null, raw: !!it.raw })
    .catch(() => toast('Could not save to this browser’s storage — it may be full'));
}
const itemById = id => S.studio.find(it => it.id === id);

async function importFiles(files) {
  const all = Array.from(files || []);
  // Keep photos and camera RAW only (the file picker can also offer documents, videos…).
  const list = [];
  for (const f of all) if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(f.name) || await isRawBlob(f)) list.push(f);
  const skipped = all.length - list.length;
  const skippedText = skipped === 1 ? 'skipped 1 file that isn’t a photo' : 'skipped ' + skipped + ' files that aren’t photos';
  if (!list.length) { toast(skipped ? skippedText.replace(/^s/, 'S') : 'No photos found'); return []; }
  const now = Date.now();
  const items = [];
  for (let i = 0; i < list.length; i++) items.push({ id: now + i, name: list[i].name || 'Photo', added: now + list.length - i, params: null, blob: list[i], thumb: null, raw: await isRawBlob(list[i]) });
  S.studio = items.concat(S.studio);
  for (const it of items) await storeItem(it);
  toast((items.length === 1 ? 'Imported 1 photo' : 'Imported ' + items.length + ' photos') + (skipped ? ', ' + skippedText : ''));
  render();
  return items;
}

// Studio thumbnails: the edited look, rendered one at a time in the background.
const thumbQueue = []; let thumbBusy = false;
function ensureThumb(id) {
  if (S.thumbs.has(id) || S.missing.has(id)) return;
  const it = itemById(id);
  if (!it) return;
  if (it.thumb) { S.thumbs.set(id, URL.createObjectURL(it.thumb)); return; }
  if (!thumbQueue.includes(id)) thumbQueue.push(id);
  pumpThumbs();
}
function refreshThumb(id) {
  const it = itemById(id);
  if (!it) return;
  it.thumb = null;
  const old = S.thumbs.get(id);
  S.thumbs.delete(id);
  if (!thumbQueue.includes(id)) thumbQueue.unshift(id);
  pumpThumbs(old);
}
async function pumpThumbs(oldUrl) {
  if (thumbBusy) return;
  thumbBusy = true;
  while (thumbQueue.length) {
    const id = thumbQueue.shift(), it = itemById(id);
    if (!it) continue;
    try {
      const { img } = await decodeBlob(it.blob, STUDIO_THUMB_EDGE * 1.5);
      const p = it.params || M.defaults();
      const res = await W.run('thumbs', { type: 'thumbs', img: packImg(img), list: [p], detail: true }, [img.data.buffer], m => {
        const cv = imgToCanvas(m.img);
        const k = Math.min(1, STUDIO_THUMB_EDGE / Math.max(cv.width, cv.height));
        const out = document.createElement('canvas'); out.width = Math.round(cv.width * k); out.height = Math.round(cv.height * k);
        const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, out.width, out.height);
        it._cv = out;
      });
      void res;
      const blob = await new Promise(r => it._cv.toBlob(r, 'image/jpeg', 0.85));
      delete it._cv;
      it.thumb = blob;
      storeItem(it);
      const prev = S.thumbs.get(id);
      S.thumbs.set(id, URL.createObjectURL(blob));
      if (prev) URL.revokeObjectURL(prev);
    } catch (e) {
      S.missing.add(id);
    }
    updateStudioCell(id);
  }
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  thumbBusy = false;
}

function toggleSelect(id) { S.selection.has(id) ? S.selection.delete(id) : S.selection.add(id); render(); }
function clearSelection() { S.selection.clear(); S.selectMode = false; render(); }
function copyEdits(id) {
  const it = itemById(id);
  if (!it) return;
  S.clipboard = { params: it.params || M.defaults(), fromName: it.name, fromId: id };
  toast('Copied edits from ' + it.name);
  render();
}
function offerUndo(text, before) {
  toast(text, () => {
    const map = new Map(before.map(b => [b.id, b]));
    const removed = before.filter(b => !S.studio.some(s => s.id === b.id));
    S.studio = before.map(b => Object.assign(itemById(b.id) || b, { params: b.params }));
    S.studio.forEach(it => { storeItem(it); });
    removed.forEach(it => storeItem(it));
    before.forEach(b => { if (map.has(b.id)) refreshThumb(b.id); });
    render();
  });
}
const snapshot = () => S.studio.map(it => Object.assign({}, it));
function pasteToSelection(parts) {
  const clip = S.clipboard;
  if (!clip) return;
  const before = snapshot(), targets = new Set(S.selection);
  S.studio.forEach(it => {
    if (!targets.has(it.id)) return;
    const p = M.pasteFrom(it.params || M.defaults(), clip.params, parts);
    it.params = M.isDefault(p) ? null : p;
    storeItem(it); refreshThumb(it.id);
  });
  S.justPasted = targets;
  setTimeout(() => { S.justPasted = new Set(); render(); }, 2500);
  clearSelection();
  offerUndo(targets.size === 1 ? 'Pasted edits to 1 photo' : 'Pasted edits to ' + targets.size + ' photos', before);
}
function resetSelection() {
  const before = snapshot(), n = S.selection.size;
  S.studio.forEach(it => { if (S.selection.has(it.id) && it.params) { it.params = null; storeItem(it); refreshThumb(it.id); } });
  clearSelection();
  offerUndo(n === 1 ? 'Reset 1 photo' : 'Reset ' + n + ' photos', before);
}
function removeSelection() {
  const before = snapshot(), ids = new Set(S.selection);
  S.studio = S.studio.filter(it => !ids.has(it.id));
  ids.forEach(id => DB.del(id));
  if (S.clipboard && ids.has(S.clipboard.fromId)) S.clipboard = Object.assign({}, S.clipboard, { fromId: null });
  clearSelection();
  offerUndo(ids.size === 1 ? 'Removed 1 photo from the Studio' : 'Removed ' + ids.size + ' photos from the Studio', before);
}

// ------------------------------------------------------------------ editor
async function openItem(id) {
  const it = itemById(id);
  if (!it) return;
  S.currentId = id;
  S.params = it.params ? M.copy(it.params) : M.defaults();
  S.committed = S.params;
  S.undo = []; S.redo = [];
  S.tab = 'Film'; S.sheet = null; S.sheetBefore = null; S.curveMode = false; S.picker = false; S.sample = null; S.samplePos = null;
  S.loading = true; S.source = null; S.currentIsRaw = false; S.previewFor = null; S.simThumbs = []; S.stats = null; S.histogram = null; S.origImg = null; S.origKey = null;
  go('editor');
  try {
    S.currentIsRaw = await isRawBlob(it.blob);
    if (S.currentIsRaw) render(); // shows "RAW" while it develops
    const { img, fullW, fullH } = await decodeBlob(it.blob, PREVIEW_EDGE);
    if (S.currentId !== id) return;
    S.fullW = fullW; S.fullH = fullH;
    S.source = { w: img.w, h: img.h };
    S.thumbSource = downscale(img, THUMB_EDGE);
    W.main.postMessage({ type: 'source', id, img: packImg(img) }, [img.data.buffer]);
    S.loading = false;
    requestRender();
    render();
  } catch (e) {
    S.loading = false;
    S.missing.add(id);
    toast(S.currentIsRaw ? (e.message || 'This RAW file could not be read') : 'This photo can’t be opened in this browser');
    back();
  }
}
const hasImage = () => !!S.source;

// Rendering: newest settings win; small renders while a slider is dragged, full size when it stops.
let renderSeq = 0, inflight = false, pendingRender = null, lastFast = false;
function requestRender(fast) {
  if (!S.source) return;
  pendingRender = { fast: !!(fast || S.dragging) };
  S.rendering = true;
  pumpRender();
}
function pumpRender() {
  if (inflight || !pendingRender) return;
  const job = pendingRender; pendingRender = null; inflight = true;
  const crop = S.tab === 'Crop' && !S.curveMode;
  const p = crop ? M.cropBase(S.params) : S.params;
  const geoKey = JSON.stringify(M.GEO_KEYS.map(k => p[k]));
  const orig = !job.fast && geoKey !== S.origKey;
  W.main.postMessage({ type: 'render', seq: ++renderSeq, params: S.params, crop, fast: job.fast, hist: S.curveMode && !job.fast, orig });
  lastFast = job.fast;
  if (orig) S.origPendingKey = geoKey;
}
function onMainWorker(m) {
  if (m.type === 'stats') { S.stats = m.stats; renderSimThumbs(); return; }
  if (m.type === 'sampled') { S.sample = m.rgb; drawGraph(); return; }
  if (m.type === 'error') { inflight = false; S.rendering = false; console.error(m.message); toast('Rendering failed: ' + m.message); pumpRender(); return; }
  if (m.type !== 'rendered') return;
  inflight = false;
  S.previewImg = m.img;
  S.previewFor = m.params; S.previewCrop = m.crop;
  if (m.hist) S.histogram = m.hist;
  if (m.orig) { S.origImg = m.orig; S.origKey = S.origPendingKey; }
  drawPreview();
  if (pendingRender) pumpRender();
  else if (m.fast && !S.dragging) { pendingRender = { fast: false }; pumpRender(); }
  else { S.rendering = false; updateBusy(); }
  if (m.hist) drawGraph();
  if (S.screen === 'export') scheduleEstimate();
}

function updateParams(p) {
  if (M.equals(p, S.params)) return;
  const sameImage = S.tab === 'Crop' && !S.curveMode && M.equals(M.cropBase(p), M.cropBase(S.params));
  S.params = p;
  if (!sameImage) requestRender();
  if (S.dragging) { runLive(); drawCrop(); drawGraph(); }
  else refreshEditor();
}
function commit() {
  if (M.equals(S.params, S.committed)) return;
  S.undo.push(S.committed);
  if (S.undo.length > 100) S.undo.shift();
  S.redo = [];
  S.committed = S.params;
  renderSimThumbs();
  scheduleSave();
  if (S.samplePos) resample();
  if (lastFast && !inflight) requestRender(false);
}
function change(p) { updateParams(p); commit(); refreshEditor(); }
function undo() {
  if (S.sheet) { S.sheet = null; S.sheetBefore = null; }
  commit();
  if (!S.undo.length) return;
  S.redo.push(S.params);
  S.params = S.undo.pop(); S.committed = S.params;
  requestRender(); renderSimThumbs(); scheduleSave(); refreshEditor();
}
function redo() {
  if (S.sheet) { S.sheet = null; S.sheetBefore = null; }
  if (!S.redo.length) return;
  S.undo.push(S.params);
  S.params = S.redo.pop(); S.committed = S.params;
  requestRender(); renderSimThumbs(); scheduleSave(); refreshEditor();
}
let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 600); }
function flushSave() {
  clearTimeout(saveTimer);
  const it = itemById(S.currentId);
  if (!it) return;
  const p = M.isDefault(S.committed) ? null : S.committed;
  if (M.equals(p, it.params)) return;
  it.params = p ? M.copy(p) : null;
  storeItem(it);
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

function setTab(t) {
  if (S.sheet) doneSheet(true);
  const was = S.tab;
  S.tab = t;
  if (S.picker) S.picker = false;
  if ((was === 'Crop') !== (t === 'Crop')) requestRender();
  render();
}
function openSheet(id) {
  if (S.sheet === id) return;
  if (S.sheet) commit();
  S.sheetBefore = S.params; S.sheet = id;
  refreshEditor();
}
function cancelSheet() {
  if (S.sheetBefore) updateParams(S.sheetBefore);
  S.sheetBefore = null; S.sheet = null;
  refreshEditor();
}
function doneSheet(quiet) {
  commit(); S.sheetBefore = null; S.sheet = null;
  if (!quiet) refreshEditor();
}
function leaveEditor() { if (S.sheet) doneSheet(true); back(); }

// Crop helpers (EditorViewModel.kt)
function cropBaseSize() {
  if (!S.source) return null;
  return S.params.rotation % 180 === 0 ? [S.source.w, S.source.h] : [S.source.h, S.source.w];
}
function pickGuide(id) {
  const g = M.CROP_GUIDES.find(x => x.id === id);
  if (S.cropGuide === id) S.guideTurn = (S.guideTurn + 1) % g.turns; else { S.cropGuide = id; S.guideTurn = 0; }
  refreshEditor();
}
function setCropRatio(index) {
  const sz = cropBaseSize(); if (!sz) return;
  const [w, hh] = sz, p = S.params;
  // Tapping the ratio already in use keeps your frame as it is.
  if (index === p.aspect) return;
  const cur = M.cropRect(p, w, hh);
  let next = M.copy(p, { aspect: index, aspectFlip: false });
  const ratio = M.lockRatio(next, w, hh);
  if (ratio != null) next = M.withCropRect(next, M.centeredRect(ratio * hh / w, (cur[0] + cur[2]) / 2, (cur[1] + cur[3]) / 2));
  change(next);
}
function swapCropRatio() {
  const sz = cropBaseSize(); if (!sz) return;
  const [w, hh] = sz, p = S.params, cur = M.cropRect(p, w, hh), cx = (cur[0] + cur[2]) / 2, cy = (cur[1] + cur[3]) / 2;
  if (p.aspect === M.ASPECT_FREE) {
    const pxW = (cur[2] - cur[0]) * w, pxH = (cur[3] - cur[1]) * hh;
    let fw = pxH / w, fh = pxW / hh;
    const k = Math.min(1, 1 / fw, 1 / fh); fw *= k; fh *= k;
    const l = clamp(cx - fw / 2, 0, 1 - fw), t = clamp(cy - fh / 2, 0, 1 - fh);
    change(M.withCropRect(p, [l, t, l + fw, t + fh]));
    return;
  }
  const next = M.copy(p, { aspectFlip: !p.aspectFlip }), ratio = M.lockRatio(next, w, hh);
  if (ratio == null) return;
  change(M.withCropRect(next, M.centeredRect(ratio * hh / w, cx, cy)));
}
function rotateCrop(cw) {
  const sz = cropBaseSize(); if (!sz) return;
  const p = S.params, r = M.rotateRect(M.cropRect(p, sz[0], sz[1]), cw);
  const turnsRatio = p.aspect !== M.ASPECT_FREE && p.aspect !== M.ASPECT_ORIGINAL && p.aspect !== 1;
  S.cropResets++;
  change(M.withCropRect(M.copy(p, { rotation: (p.rotation + (cw ? 90 : 270)) % 360, aspectFlip: turnsRatio ? !p.aspectFlip : p.aspectFlip }), r));
}
function flipCrop() {
  const sz = cropBaseSize(); if (!sz) return;
  const p = S.params, r = M.cropRect(p, sz[0], sz[1]);
  // Always a left-right mirror as you see it. flipH is applied before the 90° turn, so on
  // a turned photo the turn also reverses (90° ↔ 270°); 0° and 180° stay as they are.
  const m = [1 - r[2], r[1], 1 - r[0], r[3]];
  S.cropResets++;
  change(M.withCropRect(M.copy(p, { flipH: !p.flipH, rotation: (360 - p.rotation) % 360, straighten: -p.straighten }), m));
}
function resetCrop() { S.cropResets++; change(M.withGeometryOf(S.params, M.DEF)); }

// Curve screen
function openCurve() {
  if (S.sheet) doneSheet(true);
  S.curveMode = true;
  history.pushState({ fd: S.backStack.length, curve: true }, '');
  requestRender();
  render();
}
function closeCurve(fromPop) {
  commit();
  S.curveMode = false; S.picker = false;
  if (!fromPop) { skipPop++; history.back(); }
  requestRender();
  render();
}
function togglePicker() { S.picker = !S.picker; if (!S.picker) { S.sample = null; S.samplePos = null; } render(); }
let sampleSeq = 0;
function sampleAt(fx, fy) { S.samplePos = [fx, fy]; resample(); }
function resample() {
  if (!S.samplePos) return;
  W.main.postMessage({ type: 'sample', seq: ++sampleSeq, params: S.params, fx: S.samplePos[0], fy: S.samplePos[1] });
}

// Film strip thumbnails (all 20 sims on this photo, with its other settings).
let simThumbTimer = 0, simJob = 0;
function renderSimThumbs() {
  clearTimeout(simThumbTimer);
  simThumbTimer = setTimeout(async () => {
    if (!S.thumbSource || !S.stats) return;
    const base = M.copy(M.withoutGeometry(S.params), { simStrength: 1 });
    const job = ++simJob, src = cloneImg(S.thumbSource);
    const list = M.FILM_SIMS.map((_, i) => M.copy(base, { sim: i }));
    try {
      await W.run('thumbs', { type: 'thumbs', img: packImg(src), list, stats: S.stats }, [src.data.buffer], m => {
        if (job !== simJob) return;
        S.simThumbs[m.index] = imgToCanvas(m.img);
        document.querySelectorAll('[data-simthumb="' + m.index + '"]').forEach(cv => paintThumb(cv, S.simThumbs[m.index]));
      });
    } catch (_) { /* thumbnails are optional; swatches stay */ }
  }, 150);
}
function paintThumb(cv, src) {
  if (!src) return;
  cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
}

// ------------------------------------------------------------------ copy / paste / recipes
function copyCurrent() {
  commit();
  const it = itemById(S.currentId);
  S.clipboard = { params: S.params, fromName: it ? it.name : 'this photo', fromId: S.currentId };
  toast('Copied ' + M.copySummary(S.params));
}
function pasteCurrent(parts) {
  if (!S.clipboard) return;
  change(M.pasteFrom(S.params, S.clipboard.params, parts));
  toast('Pasted edits');
}
function saveRecipe(name) {
  if (S.sheet) doneSheet(true);
  const r = { id: Date.now(), name: (name.trim() || 'My recipe').slice(0, 60), params: M.withoutGeometry(S.params) };
  S.recipes = [r].concat(S.recipes);
  saveRecipes();
  toast('Saved recipe “' + r.name + '”');
}
function openRecipes(fromStudio) {
  if (S.sheet) doneSheet(true);
  S.recipesFromStudio = !!fromStudio;
  S.recipeTargets = fromStudio ? new Set(S.selection) : new Set();
  go('recipes');
  renderRecipeThumbs();
}
let recipeJob = 0;
async function renderRecipeThumbs() {
  const job = ++recipeJob;
  S.recipeThumbs = new Map();
  let src = null, stats = null;
  if (!S.recipesFromStudio && S.thumbSource) { src = cloneImg(S.thumbSource); stats = S.stats; }
  else {
    const first = S.studio.find(it => S.recipeTargets.has(it.id)) || S.studio[0];
    if (first) { try { src = (await decodeBlob(first.blob, THUMB_EDGE)).img; } catch (_) { } }
  }
  if (!src || job !== recipeJob) return;
  const list = S.recipes.map(r => M.withoutGeometry(r.params)), keys = S.recipes.map(r => r.id);
  try {
    await W.run('thumbs', { type: 'thumbs', img: packImg(src), list, keys, stats }, [src.data.buffer], m => {
      if (job !== recipeJob) return;
      const cv = imgToCanvas(m.img);
      S.recipeThumbs.set(m.key, cv);
      document.querySelectorAll('[data-recipethumb="' + m.key + '"]').forEach(el => paintThumb(el, cv));
    });
  } catch (_) { }
}
function applyRecipe(r) {
  if (!S.recipesFromStudio) {
    change(M.withGeometryOf(r.params, S.params));
    back();
    return;
  }
  const targets = new Set([...S.recipeTargets].filter(id => itemById(id)));
  if (!targets.size) { toast('Select photos in the Studio first (long-press a photo), then tap Recipe'); return; }
  const before = snapshot();
  S.studio.forEach(it => {
    if (!targets.has(it.id)) return;
    const p = M.withGeometryOf(r.params, it.params || M.defaults());
    it.params = M.isDefault(p) ? null : p;
    storeItem(it); refreshThumb(it.id);
  });
  S.selection.clear(); S.selectMode = false; S.recipeTargets = new Set();
  back();
  offerUndo(targets.size === 1 ? 'Applied “' + r.name + '” to 1 photo' : 'Applied “' + r.name + '” to ' + targets.size + ' photos', before);
}
function deleteRecipe(r) { S.recipes = S.recipes.filter(x => x.id !== r.id); saveRecipes(); S.recipeThumbs.delete(r.id); render(); }
function importRecipe(text) {
  const r = M.recipeFromText(text);
  if (!r) { toast('No recipe found in that text'); return false; }
  S.recipes = [r].concat(S.recipes);
  saveRecipes(); renderRecipeThumbs(); render();
  toast('Imported “' + r.name + '”');
  return true;
}

// ------------------------------------------------------------------ export
function loadExport() {
  S.exportSettings = M.exportFromJson(LS.get('export', null));
  S.exportPresets = (LS.get('presets', []) || []).map(p => ({ name: String(p.name || 'Preset').slice(0, 40), settings: M.exportFromJson(p.settings) }));
}
function setExport(s) { S.exportSettings = s; LS.set('export', s); }
function saveExportPreset(name) {
  const n = (name.trim() || 'My preset').slice(0, 40);
  S.exportPresets = S.exportPresets.filter(p => p.name !== n).concat([{ name: n, settings: Object.assign({}, S.exportSettings) }]);
  LS.set('presets', S.exportPresets);
}
function deleteExportPreset(p) { S.exportPresets = S.exportPresets.filter(x => x !== p); LS.set('presets', S.exportPresets); }
function openExport() { if (S.sheet) doneSheet(true); commit(); flushSave(); S.exportTargets = []; S.exportEstimate = null; go('export'); scheduleEstimate(); }
function openBatchExport() { S.exportTargets = S.studio.filter(it => S.selection.has(it.id)).map(it => it.id); if (!S.exportTargets.length) return; go('export'); }

/** Crop size and whole size of the current photo at full resolution. */
function fullSizes(p = S.params) {
  if (!S.fullW) return null;
  const [bw, bh] = p.rotation % 180 === 0 ? [S.fullW, S.fullH] : [S.fullH, S.fullW];
  const r = M.cropRect(p, bw, bh);
  return { crop: [Math.round((r[2] - r[0]) * bw), Math.round((r[3] - r[1]) * bh)], whole: [bw, bh] };
}
const exportLimit = (fullW, fullH, cw, ch) => Math.max(cw, ch) * Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (fullW * fullH)));
function exportSize(s = S.exportSettings) {
  const fs = fullSizes(); if (!fs) return null;
  return M.targetSize(fs.crop[0], fs.crop[1], s, exportLimit(S.fullW, S.fullH, fs.crop[0], fs.crop[1]));
}
let estTimer = 0;
function scheduleEstimate() {
  clearTimeout(estTimer);
  estTimer = setTimeout(async () => {
    if (S.screen !== 'export' || S.exportTargets.length) return;
    const s = S.exportSettings, out = exportSize(s), pv = S.previewImg;
    if (!out || !pv || S.previewCrop) { S.exportEstimate = null; return; }
    const src = imgToCanvas({ w: pv.w, h: pv.h, buf: pv.buf.slice(0) });
    const k = Math.min(1, Math.max(out[0], out[1]) / Math.max(src.width, src.height));
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(src.width * k)); c.height = Math.max(2, Math.round(src.height * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    const blob = await encodeCanvas(c, s, s.quality);
    const scale = out[0] * out[1] / (c.width * c.height);
    let bytes = blob.size * scale * (scale > 1.5 ? 0.85 : 1);
    if (s.limitSize && M.canLimitSize(s)) bytes = Math.min(bytes, s.limitMb * 1e6);
    S.exportEstimate = bytes;
    const el = document.getElementById('estimate');
    if (el) el.textContent = '≈ ' + M.formatBytes(bytes);
  }, 250);
}
const formatOf = s => M.EXPORT_FORMATS.find(f => f.id === s.format);
function encodeCanvas(cv, s, q) {
  const f = formatOf(s);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('This browser can’t save ' + f.label)), f.mime, M.isLossy(s) ? q / 100 : undefined));
}
async function encodeFitting(cv, s) {
  const first = await encodeCanvas(cv, s, s.quality);
  if (!s.limitSize || !M.canLimitSize(s)) return { blob: first, quality: s.quality, fits: true };
  const limit = s.limitMb * 1e6;
  if (first.size <= limit) return { blob: first, quality: s.quality, fits: true };
  let lo = 10, hi = s.quality - 1, best = null, bestQ = lo;
  for (let i = 0; i < 7 && lo <= hi; i++) {
    const mid = (lo + hi) >> 1, b = await encodeCanvas(cv, s, mid);
    if (b.size <= limit) { best = b; bestQ = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (best) return { blob: best, quality: bestQ, fits: true };
  return { blob: await encodeCanvas(cv, s, 10), quality: 10, fits: false };
}
function drawWatermark(cv, s) {
  const text = s.wmText.trim();
  if (!s.watermark || !text) return;
  const g = cv.getContext('2d'), short = Math.min(cv.width, cv.height), size = short * clamp(s.wmSize, 1, 15) / 100;
  g.save();
  g.font = size + 'px ' + getComputedStyle(document.body).fontFamily;
  g.globalAlpha = clamp(s.wmOpacity, 5, 100) / 100;
  g.fillStyle = ['#FFFFFF', '#000000', C.amber][s.wmColor] || '#fff';
  if ('letterSpacing' in g) g.letterSpacing = (size * 0.03) + 'px';
  if (s.wmColor !== 1) { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = size * 0.08; g.shadowOffsetY = size * 0.04; }
  const m = g.measureText(text), tw = m.width, margin = short * 0.035;
  const asc = m.actualBoundingBoxAscent || size * 0.75, desc = m.actualBoundingBoxDescent || size * 0.2;
  const col = s.wmPos % 3, row = Math.floor(s.wmPos / 3);
  const x = col === 0 ? margin : col === 1 ? (cv.width - tw) / 2 : cv.width - tw - margin;
  const y = row === 0 ? margin + asc : row === 1 ? cv.height / 2 + (asc - desc) / 2 : cv.height - margin - desc;
  g.fillText(text, x, y);
  g.restore();
}
async function exifFor(item, s, p, w, hh) {
  if (s.metadata === 'None' || !M.canWriteMetadata(s)) return null;
  const tags = { ifd0: {}, exif: {}, gps: {} };
  if (s.metadata === 'All') {
    if ((s.cameraInfo || s.keepLocation) && item.blob) {
      try {
        const orig = F.readExif(await item.blob.arrayBuffer());
        if (orig) {
          if (s.cameraInfo) { Object.assign(tags.ifd0, orig.ifd0); Object.assign(tags.exif, orig.exif); }
          if (s.keepLocation) Object.assign(tags.gps, orig.gps);
        }
      } catch (_) { }
    }
    tags.ifd0[0x0131] = F.ascii('Film Desk');
    if (s.embedRecipe) tags.exif[0x9286] = F.userComment('FilmDeskRecipe:' + JSON.stringify(M.toJson(p)));
  }
  const c = s.copyright.trim();
  if (c) { tags.ifd0[0x8298] = F.ascii(c); tags.ifd0[0x013B] = F.ascii(c.replace(/^©/, '').trim()); }
  tags.ifd0[0x0112] = { type: 3, val: 1 };
  tags.exif[0xA002] = { type: 4, val: w }; tags.exif[0xA003] = { type: 4, val: hh };
  return tags;
}
const itemRawSize = new Map();
/** Renders one photo with its edits at the export size and returns the finished file. */
async function exportOne(item, p, knownStats, s, name) {
  // RAW: develop at the size the export needs (full sensor resolution unless smaller is enough).
  let bmp, rawDims = null;
  if (await isRawBlob(item.blob)) {
    let size = itemRawSize.get(item.id);
    if (!size && item.id === S.currentId && S.fullW) size = { fullW: S.fullW, fullH: S.fullH };
    if (!size) { const probe = await developRaw(item.blob, THUMB_EDGE, THUMB_EDGE); size = { fullW: probe.fullW, fullH: probe.fullH }; }
    itemRawSize.set(item.id, size);
    rawDims = [size.fullW, size.fullH];
  } else bmp = await bitmapOf(item.blob);
  const fullW = rawDims ? rawDims[0] : bmpW(bmp), fullH = rawDims ? rawDims[1] : bmpH(bmp);
  const [bw, bh] = p.rotation % 180 === 0 ? [fullW, fullH] : [fullH, fullW];
  const r = M.cropRect(p, bw, bh);
  const cw = Math.max(1, Math.round((r[2] - r[0]) * bw)), ch = Math.max(1, Math.round((r[3] - r[1]) * bh));
  const [tw, th] = M.targetSize(cw, ch, s, exportLimit(fullW, fullH, cw, ch));
  // Decode only as many pixels as the output needs (the crop is rendered at about the export size).
  const k = Math.min(1, tw / cw);
  const sw = Math.max(1, Math.round(fullW * k)), sh = Math.max(1, Math.round(fullH * k));
  let src;
  if (rawDims) {
    const dev = await developRaw(item.blob, Math.max(sw, sh), 0);
    src = dev.img.w === sw && dev.img.h === sh ? dev.img : pixelsOf(imgToCanvas(packImg(dev.img)), sw, sh);
  } else {
    src = pixelsOf(bmp, sw, sh);
    if (bmp.close) bmp.close();
  }
  const res = await W.run('export', { type: 'export', img: packImg(src), params: p, stats: knownStats, tw, th, sharpen: s.sharpen, sharpenLevel: s.sharpenLevel }, [src.data.buffer]);
  const cv = imgToCanvas(res.img);
  drawWatermark(cv, s);
  const enc = await encodeFitting(cv, s);
  let blob = enc.blob;
  const tags = await exifFor(item, s, p, cv.width, cv.height);
  if (tags && formatOf(s).id === 'JPEG') {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      blob = new Blob([F.insertApp1(bytes, F.buildExif(tags))], { type: 'image/jpeg' });
    } catch (_) { /* keep the file without metadata */ }
  }
  cv.width = cv.height = 0;
  return { blob, w: res.img.w, h: res.img.h, fits: enc.fits, name: name + '.' + formatOf(s).ext };
}
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); };
async function doExport(share) {
  if (S.exporting) return;
  if (S.exportTargets.length) return exportBatch();
  const it = itemById(S.currentId);
  if (!it) return;
  commit(); flushSave();
  const s = Object.assign({}, S.exportSettings), p = S.params;
  S.exporting = true; render();
  try {
    const res = await exportOne(it, p, S.stats, s, M.filePrefix(s) + '_' + stamp());
    const file = new File([res.blob], res.name, { type: res.blob.type });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Film Desk' }); } catch (e) { if (e.name !== 'AbortError') download(res.blob, res.name); }
    } else {
      download(res.blob, res.name);
      toast('Saved ' + res.name + ' (' + res.w + ' × ' + res.h + ' · ' + M.formatBytes(res.blob.size) + ')');
    }
    if (!res.fits) toast('Over ' + s.limitMb + ' MB even at the lowest quality — choose a smaller size');
  } catch (e) {
    toast(/memory|allocation|Array buffer/i.test(String(e)) ? 'Not enough memory for this size — choose a smaller export size' : (e.message || 'Export failed'));
  } finally { S.exporting = false; render(); }
}
async function exportBatch() {
  const items = S.studio.filter(it => S.exportTargets.includes(it.id));
  if (!items.length) return;
  const s = Object.assign({}, S.exportSettings), st = stamp(), files = [];
  let lastError = null, total = 0;
  S.exporting = true;
  try {
    for (let i = 0; i < items.length; i++) {
      S.batchProgress = 'Exporting ' + (i + 1) + ' of ' + items.length + '…'; render();
      try {
        const res = await exportOne(items[i], items[i].params || M.defaults(), null, s, M.filePrefix(s) + '_' + st + '_' + (i + 1));
        files.push({ name: res.name, data: new Uint8Array(await res.blob.arrayBuffer()) });
        total += res.blob.size;
      } catch (e) { lastError = e.message; }
    }
    if (files.length === 1) download(new Blob([files[0].data], { type: formatOf(s).mime }), files[0].name);
    else if (files.length > 1) download(F.zip(files), M.filePrefix(s) + '_' + st + '.zip');
  } finally { S.batchProgress = null; S.exporting = false; }
  S.selection.clear(); S.selectMode = false;
  S.exportTargets = [];
  if (S.screen === 'export') back(); else render();
  toast(files.length === items.length ? 'Saved ' + files.length + ' photos (' + M.formatBytes(total) + ')' + (files.length > 1 ? ' as a ZIP' : '')
    : 'Saved ' + files.length + ' of ' + items.length + (lastError ? ' — ' + lastError : ''));
}
