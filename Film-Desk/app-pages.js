/* Film Desk web — Recipes and Export screens (ui/RecipesScreen.kt, ui/ExportScreen.kt), and start-up. */
'use strict';

// ================================================================== Recipes
function renderRecipes() {
  const n = S.recipeTargets.size;
  const sub = !S.recipesFromStudio ? 'Tap a recipe to apply it to your photo.'
    : n === 1 ? 'Tap a recipe to apply it to the selected photo.'
      : n > 1 ? 'Tap a recipe to apply it to the ' + n + ' selected photos.'
        : 'To use a recipe, long-press photos in the Studio to select them, then tap Recipe.';
  return h('div', { class: 'screen', style: { background: C.bg } },
    h('div', { class: 'row page-head' }, iconBtn('arrow_back', 'Back', back),
      h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Saved looks'), h('h1', null, 'Recipes')),
      h('button', { class: 'text-btn row', style: { color: C.amber, gap: '6px', fontSize: '14px' }, onclick: pasteRecipe }, icon('content_paste', 18), 'Paste')),
    h('div', { class: 'muted', style: { fontSize: '13px', padding: '8px 20px' } }, sub),
    h('div', { class: 'grow scroll-y', 'data-keep': 'recipes' }, h('div', { class: 'list' }, S.recipes.map(recipeCard)),
      !S.recipes.length ? h('div', { class: 'muted', style: { textAlign: 'center', padding: '24px' } }, 'No recipes yet. Save one from the editor’s ⋯ menu, or paste one shared with you.') : null));
}
function recipeCard(r) {
  const sim = M.FILM_SIMS[r.params.sim], cv = h('canvas', { 'data-recipethumb': r.id });
  if (S.recipeThumbs.get(r.id)) paintThumb(cv, S.recipeThumbs.get(r.id));
  return h('div', { class: 'card row recipe', role: 'button', tabindex: 0, 'aria-label': 'Apply ' + r.name, onclick: () => applyRecipe(r), onkeydown: e => { if (e.key === 'Enter') applyRecipe(r); } },
    h('div', { class: 'thumb', style: { background: sim.swatch } }, cv),
    h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
      h('div', { class: 'name ellipsis' }, r.name), h('div', { class: 'amber', style: { fontSize: '12px' } }, sim.name), h('div', { class: 'sum' }, M.summary(r.params))),
    h('div', { style: { display: 'flex', flexDirection: 'column' }, onclick: e => e.stopPropagation() },
      iconBtn('share', 'Share ' + r.name, () => shareRecipe(r), { color: C.muted }),
      iconBtn('delete', 'Delete ' + r.name, () => confirmDialog('Delete “' + r.name + '”?', 'Delete', () => deleteRecipe(r)), { color: C.muted })));
}
async function shareRecipe(r) {
  const text = M.recipeShareText(r);
  if (navigator.share) { try { await navigator.share({ text, title: 'Film Desk recipe' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Recipe copied — paste it in a chat; Film Desk (app or web) can import it'); }
  catch (_) { dialog('Share recipe', h('textarea', { class: 'field', readonly: true }, text), [{ label: 'Close', onclick: () => {} }]); }
}
async function pasteRecipe() {
  try {
    const t = await navigator.clipboard.readText();
    if (t && M.recipeFromText(t)) { importRecipe(t); return; }
  } catch (_) { /* clipboard read blocked: ask instead */ }
  const ta = h('textarea', { class: 'field', placeholder: 'Paste the recipe text here', 'aria-label': 'Recipe text' });
  dialog('Paste a recipe', ta, [{ label: 'Cancel', color: C.muted, onclick: () => {} }, { label: 'Import', onclick: () => importRecipe(ta.value) !== false }]);
}

// ================================================================== Export
const POSITIONS = ['Top left', 'Top centre', 'Top right', 'Middle left', 'Centre', 'Middle right', 'Bottom left', 'Bottom centre', 'Bottom right'];
let WEBP_OK = null;
function webpSupported() {
  if (WEBP_OK == null) { const c = document.createElement('canvas'); c.width = c.height = 1; WEBP_OK = c.toDataURL('image/webp').startsWith('data:image/webp'); }
  return WEBP_OK;
}
const fileTypeSummary = s => s.format === 'PNG' ? 'PNG' : formatOf(s).label + ' · ' + s.quality;
const sizeSummary = s => ({ Full: 'Full size', LongEdge: 'Long edge · ' + s.longEdge + ' px', ShortEdge: 'Short edge · ' + s.shortEdge + ' px', Megapixels: s.megapixels + ' MP', Percent: s.percent + '%' })[s.sizeMode];
const trimMb = v => String(Math.round(v * 10) / 10);
function renderExport() {
  const s = S.exportSettings, batch = S.exportTargets.length > 0;
  const set = f => { setExport(f(Object.assign({}, S.exportSettings))); render(); scheduleEstimate(); };
  const row = (title, value, id, enabled = true) => h('div', { class: 'row setrow' + (enabled ? '' : ' disabled'), role: 'button', tabindex: enabled ? 0 : -1,
    onclick: () => enabled && exportSheet(id), onkeydown: e => { if (enabled && e.key === 'Enter') exportSheet(id); } },
    h('span', { class: 'grow', style: { fontSize: '15px' } }, title), h('span', { class: 'v ellipsis' }, value), icon('keyboard_arrow_right', 18));
  const summary = batch ? batchSummary() : singleSummary(s);
  const presets = h('div', { class: 'export-wrap', style: { display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: 0 } },
    h('div', { class: 'scroll-x', 'data-keep': 'presets' }, h('div', { class: 'row', style: { gap: '8px' } },
      M.BUILT_IN_PRESETS.concat(S.exportPresets).map(p => {
        let t = 0;
        const on = M.presetMatches(p, s);
        return h('button', { class: 'pill outline' + (on ? ' on' : ''), style: { fontSize: '13px', padding: '8px 14px' }, title: p.builtIn ? p.detail : 'Right-click or long-press to delete',
          onclick: () => { setExport(M.presetApply(p, S.exportSettings)); render(); scheduleEstimate(); },
          oncontextmenu: e => { e.preventDefault(); if (!p.builtIn) confirmDialog('Delete preset “' + p.name + '”?', 'Delete', () => { deleteExportPreset(p); render(); }); },
          onpointerdown: () => { if (!p.builtIn) t = setTimeout(() => confirmDialog('Delete preset “' + p.name + '”?', 'Delete', () => { deleteExportPreset(p); render(); }), 600); },
          onpointerup: () => clearTimeout(t), onpointerleave: () => clearTimeout(t) }, p.name);
      }),
      h('button', { class: 'pill', style: { fontSize: '13px', padding: '8px 14px', color: C.amber, border: '1px solid rgba(242,163,58,.6)' }, onclick: () => {
        const inp = h('input', { class: 'field', maxlength: 40, placeholder: 'e.g. Client', 'aria-label': 'Preset name' });
        dialog('Save preset', inp, [{ label: 'Cancel', color: C.muted, onclick: () => {} }, { label: 'Save preset', onclick: () => { saveExportPreset(inp.value); render(); } }]);
      } }, '+ Save'))),
    S.exportPresets.length ? h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Long-press or right-click your own preset to delete it.') : null);
  const list = h('div', { class: 'grow scroll-y', 'data-keep': 'export', style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
    h('div', { class: 'export-wrap' }, summary), presets, h('div', { style: { height: '10px' } }),
    row('File type', fileTypeSummary(s), 'File type'),
    row('Size', sizeSummary(s), 'Size'),
    row('Limit file size', !M.canLimitSize(s) ? '—' : s.limitSize ? trimMb(s.limitMb) + ' MB' : 'Off', 'Limit file size', M.canLimitSize(s)),
    row('Output sharpening', s.sharpen === 'Off' ? 'Off' : s.sharpen + ' · ' + M.SHARPEN_LEVELS[s.sharpenLevel], 'Output sharpening'),
    row('Metadata', !M.canWriteMetadata(s) ? 'None (' + formatOf(s).label + ')' : M.METADATA.find(m => m[0] === s.metadata)[1] + (s.metadata !== 'None' && s.copyright.trim() ? ' · ' + s.copyright : ''), 'Metadata'),
    row('File name', M.filePrefix(s) + '_…', 'File name'),
    row('Watermark', s.watermark ? (s.wmText.trim() || '© Your Name') : 'Off', 'Watermark'),
    h('div', { class: 'footer-note' }, 'Files are made on this device and saved to your Downloads.'));
  const shareOk = !!(navigator.canShare && window.File);
  const saveBar = h('div', { class: 'row save-bar' },
    !batch && shareOk ? h('button', { class: 'btn outline grow', disabled: S.exporting, onclick: () => doExport(true) }, icon('share', 18), 'Share') : null,
    h('button', { class: 'btn primary', style: { flex: 2 }, disabled: S.exporting, onclick: () => doExport(false) },
      S.exporting ? [h('div', { class: 'spinner sm', style: { borderColor: 'rgba(26,18,6,.3)', borderTopColor: C.onAmber } }), S.batchProgress || 'Exporting…']
        : [icon('download', 18), batch ? 'Save ' + S.exportTargets.length + ' photos' + (S.exportTargets.length > 1 ? ' (ZIP)' : '') : 'Save to device']));
  return h('div', { class: 'screen' },
    h('div', { class: 'row', style: { padding: '8px 16px 0 4px' } }, iconBtn('arrow_back', 'Back', back),
      h('div', { class: 'grow', style: { fontSize: '20px', fontWeight: 700 } }, 'Export'),
      h('span', { class: 'mono', style: { fontSize: '12px', color: batch ? C.amber : C.muted } }, batch ? S.exportTargets.length + ' photos' : '1 photo')),
    list, saveBar);
}
function singleSummary(s) {
  const out = exportSize(s), th = h('div', { class: 'summary-thumb' });
  if (S.previewImg && !S.previewCrop) th.append(imgToCanvas({ w: S.previewImg.w, h: S.previewImg.h, buf: S.previewImg.buf.slice(0) }));
  else { const url = S.thumbs.get(S.currentId); if (url) th.append(h('img', { src: url, alt: 'Edited photo' })); }
  return h('div', { class: 'row', style: { gap: '12px' } }, th,
    h('div', null, h('div', { style: { fontSize: '16px', fontWeight: 600 } }, M.FILM_SIMS[S.params.sim].name),
      h('div', { class: 'mono muted', style: { fontSize: '11px' } }, (out ? out[0] + ' × ' + out[1] + ' · ' : '') + formatOf(s).label + (M.isLossy(s) ? ' ' + s.quality : '')),
      h('div', { id: 'estimate', class: 'amber', style: { fontSize: '12px' } }, S.exportEstimate ? '≈ ' + M.formatBytes(S.exportEstimate) : 'Estimating size…')));
}
function batchSummary() {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
    h('div', { class: 'row', style: { gap: '6px' } }, S.exportTargets.slice(0, 5).map(id => {
      ensureThumb(id);
      const url = S.thumbs.get(id);
      return h('div', { style: { width: '58px', height: '58px', borderRadius: '8px', overflow: 'hidden', background: C.surface } }, url ? h('img', { src: url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : null);
    }), S.exportTargets.length > 5 ? h('span', { class: 'mono muted', style: { fontSize: '12px' } }, '+' + (S.exportTargets.length - 5)) : null),
    h('div', { class: 'mono muted', style: { fontSize: '11px' } }, 'Each photo keeps its own edits'));
}
const segmented = (opts, sel, onSel) => h('div', { class: 'seg', role: 'radiogroup' }, opts.map((o, i) => h('button', { class: i === sel ? 'on' : '', role: 'radio', 'aria-checked': String(i === sel), onclick: () => onSel(i) }, o)));
const chipRow = (opts, sel, onSel) => h('div', { class: 'scroll-x' }, h('div', { class: 'row', style: { gap: '8px' } }, opts.map((o, i) => h('button', { class: 'pill outline' + (i === sel ? ' on' : ''), style: { fontSize: '13px', padding: '8px 14px' }, onclick: () => onSel(i) }, o))));
const switchLine = (title, sub, on, onChange) => h('div', { class: 'row', style: { gap: '12px', padding: '4px 0', cursor: 'pointer' }, onclick: () => onChange(!on) },
  h('div', { class: 'grow' }, h('div', { style: { fontSize: '14px' } }, title), h('div', { class: 'muted', style: { fontSize: '12px' } }, sub)),
  h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': title }));
const note = t => h('div', { class: 'note' }, t);
function numberField(value, suffix, width, onSet, opts = {}) {
  const inp = h('input', { value: String(value), inputmode: opts.decimal ? 'decimal' : 'numeric', disabled: !!opts.disabled, 'aria-label': suffix });
  const apply = () => { const v = opts.decimal ? parseFloat(inp.value.replace(',', '.')) : parseInt(inp.value, 10); if (!isNaN(v)) onSet(v); else inp.value = String(value); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } });
  inp.addEventListener('change', apply);
  return h('div', { class: 'numfield', style: { width: width + 'px', opacity: opts.disabled ? 0.5 : 1 } }, inp, h('span', { class: 'muted', style: { marginLeft: '6px' } }, suffix));
}
function exportSheet(id) {
  const before = Object.assign({}, S.exportSettings), d = M.exportDefaults();
  const scrim = h('div', { class: 'scrim sheet-scrim' });
  const close = () => { scrim.remove(); render(); scheduleEstimate(); };
  scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  const set = f => { setExport(f(Object.assign({}, S.exportSettings))); draw(); };
  const draw = () => {
    const s = S.exportSettings, batch = S.exportTargets.length > 0;
    const keepScroll = scrim.querySelector('.scroll-y'), st = keepScroll ? keepScroll.scrollTop : 0;
    const focusedId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
    let body = [];
    switch (id) {
      case 'File type': {
        const formats = M.EXPORT_FORMATS.filter(f => f.id !== 'WEBP' || webpSupported());
        body.push(segmented(formats.map(f => f.label), Math.max(0, formats.findIndex(f => f.id === s.format)), i => set(x => Object.assign(x, { format: formats[i].id }))));
        if (s.format === 'PNG') body.push(note('PNG is always lossless.'));
        if (!M.canWriteMetadata(s)) body.push(note('Metadata (camera info, copyright, recipe) is saved in JPEG files only.'));
        if (M.isLossy(s)) {
          liveHooks = [];
          body.push(bigValue('Quality', () => String(S.exportSettings.quality), () => true, k => set(x => Object.assign(x, { quality: clamp(x.quality + k, 10, 100) }))));
          body.push(tickSlider({ value: s.quality, min: 10, max: 100, step: 1, origin: 10, resetTo: d.quality, minLabel: '10', maxLabel: '100', description: 'Quality',
            onChange: v => { setExport(Object.assign({}, S.exportSettings, { quality: Math.round(v) })); runLive(); }, onEnd: () => { S.dragging = false; draw(); } }));
        }
        if (M.canLimitSize(s)) body.push(limitRow(s, set));
        break;
      }
      case 'Size': {
        body.push(chipRow(M.SIZE_MODES.map(m => m[1]), M.SIZE_MODES.findIndex(m => m[0] === s.sizeMode), i => set(x => Object.assign(x, { sizeMode: M.SIZE_MODES[i][0] }))));
        if (s.sizeMode !== 'Full') {
          const [value, suffix, quick, key, min, max] = {
            LongEdge: [s.longEdge, 'px', [1080, 2048, 4096], 'longEdge', 64, 16000], ShortEdge: [s.shortEdge, 'px', [1080, 2048, 4096], 'shortEdge', 64, 16000],
            Megapixels: [s.megapixels, 'MP', [8, 12, 24], 'megapixels', 1, 200], Percent: [s.percent, '%', [25, 50, 75], 'percent', 1, 100],
          }[s.sizeMode];
          const setV = v => set(x => Object.assign(x, { [key]: clamp(Math.round(v), min, max) }));
          body.push(h('div', { class: 'row', style: { gap: '8px' } }, numberField(value, suffix, 120, setV),
            h('div', { class: 'scroll-x' }, h('div', { class: 'row', style: { gap: '8px' } }, quick.map(q => h('button', { class: 'pill outline' + (value === q ? ' on' : ''), style: { fontSize: '13px', padding: '8px 14px' }, onclick: () => setV(q) }, String(q)))))));
        }
        if (!batch) { const fs = fullSizes(), out = exportSize(s); if (fs && out) body.push(h('div', { class: 'mono muted', style: { fontSize: '11px' } }, 'Output ' + out[0] + ' × ' + out[1] + ' · from ' + fs.crop[0] + ' × ' + fs.crop[1])); }
        else body.push(note('Each photo is sized from its own crop. Photos are never made larger.'));
        break;
      }
      case 'Limit file size':
        if (!M.canLimitSize(s)) body.push(note('Only JPEG and WebP can be limited to a file size.')); else body.push(limitRow(s, set));
        break;
      case 'Output sharpening':
        body.push(segmented(M.SHARPEN.map(x => x[1]), M.SHARPEN.findIndex(x => x[0] === s.sharpen), i => set(x => Object.assign(x, { sharpen: M.SHARPEN[i][0] }))));
        if (s.sharpen !== 'Off') {
          body.push(segmented(M.SHARPEN_LEVELS, s.sharpenLevel, i => set(x => Object.assign(x, { sharpenLevel: i }))));
          body.push(note({ Screen: 'For phones, computers and social media.', Matte: 'For prints on matte paper.', Glossy: 'For prints on glossy paper.' }[s.sharpen]));
        }
        break;
      case 'Metadata':
        if (!M.canWriteMetadata(s)) { body.push(note(formatOf(s).label + ' files are saved without metadata. Choose JPEG to keep camera info, copyright and the recipe.')); break; }
        body.push(segmented(M.METADATA.map(m => m[1]), M.METADATA.findIndex(m => m[0] === s.metadata), i => set(x => Object.assign(x, { metadata: M.METADATA[i][0] }))));
        if (s.metadata === 'All') {
          body.push(switchLine('Camera info', 'Camera, lens, ISO, shutter, date', s.cameraInfo, on => set(x => Object.assign(x, { cameraInfo: on }))));
          body.push(switchLine('Location', 'GPS from the original', s.keepLocation, on => {
            if (on) confirmDialog('Keep location?', 'Keep location', () => set(x => Object.assign(x, { keepLocation: true })));
            else set(x => Object.assign(x, { keepLocation: false }));
          }));
          body.push(switchLine('Embed recipe', 'Re-import the look later', s.embedRecipe, on => set(x => Object.assign(x, { embedRecipe: on }))));
        }
        if (s.metadata !== 'None') body.push(textLine('Copyright / author', s.copyright, '© Your Name', 'cr', t => setExport(Object.assign({}, S.exportSettings, { copyright: t.slice(0, 120) }))));
        else body.push(note('No camera details, location or copyright are saved in the file.'));
        break;
      case 'File name':
        body.push(h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'muted', style: { fontSize: '14px' } }, 'FilmDesk_'),
          h('div', { class: 'grow' }, textLine(null, s.folder, '(optional name)', 'fn', t => setExport(Object.assign({}, S.exportSettings, { folder: t.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40) }))))));
        body.push(note('Files are named ' + M.filePrefix(s) + '_date_time. Your browser saves them to Downloads (or asks where).'));
        break;
      default:
        body.push(switchLine('Watermark', 'Your name or © on the photo', s.watermark, on => set(x => Object.assign(x, { watermark: on }))));
        if (s.watermark) {
          body.push(watermarkPreview(s));
          body.push(textLine('Text', s.wmText, '© Your Name', 'wm', t => { setExport(Object.assign({}, S.exportSettings, { wmText: t.slice(0, 80) })); const pv = scrim.querySelector('.wm-preview'); if (pv) pv.replaceWith(watermarkPreview(S.exportSettings)); }));
          body.push(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { style: { fontSize: '14px' } }, 'Position'), h('div', { class: 'muted', style: { fontSize: '12px' } }, POSITIONS[s.wmPos])),
            h('div', { class: 'posgrid' }, POSITIONS.map((pname, i) => h('button', { class: i === s.wmPos ? 'on' : '', 'aria-label': pname, onclick: () => set(x => Object.assign(x, { wmPos: i })) })))));
          body.push(labeledSlider('Size', s.wmSize, 2, 12, d.wmSize, v => ({ wmSize: v })));
          body.push(labeledSlider('Opacity', s.wmOpacity, 10, 100, d.wmOpacity, v => ({ wmOpacity: v })));
          body.push(chipRow(M.WATERMARK_COLORS, s.wmColor, i => set(x => Object.assign(x, { wmColor: i }))));
        }
    }
    const reset = () => set(x => {
      const pick = keys => Object.assign(x, Object.fromEntries(keys.map(k => [k, d[k]])));
      switch (id) {
        case 'File type': return pick(['format', 'quality', 'limitSize', 'limitMb']);
        case 'Size': return pick(['sizeMode', 'longEdge', 'shortEdge', 'megapixels', 'percent']);
        case 'Limit file size': return pick(['limitSize', 'limitMb']);
        case 'Output sharpening': return pick(['sharpen', 'sharpenLevel']);
        case 'Metadata': return pick(['metadata', 'cameraInfo', 'keepLocation', 'embedRecipe', 'copyright']);
        case 'File name': return pick(['folder']);
        default: return pick(['watermark', 'wmText', 'wmPos', 'wmSize', 'wmOpacity', 'wmColor']);
      }
    });
    scrim.innerHTML = '';
    scrim.append(h('div', { class: 'sheet', role: 'dialog', 'aria-label': id }, h('div', { class: 'grip' }),
      h('div', { class: 'label', style: { fontSize: '12px', letterSpacing: '2px', padding: '4px 20px 8px' } }, id),
      h('div', { class: 'scroll-y', style: { padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: '12px' } }, body),
      h('div', { class: 'row opt-bar', style: { padding: '0 8px' } },
        iconBtn('close', 'Cancel', () => { setExport(before); close(); }),
        h('div', { class: 'grow', style: { textAlign: 'center' } }, h('button', { class: 'text-btn', onclick: reset }, 'Reset')),
        iconBtn('check', 'Done', close, { color: C.amber }))));
    const sc = scrim.querySelector('.scroll-y'); if (sc) sc.scrollTop = st;
    if (focusedId) { const f = scrim.querySelector('[data-fid="' + focusedId + '"]'); if (f) { f.focus(); f.setSelectionRange && f.setSelectionRange(f.value.length, f.value.length); } }
  };
  draw();
  document.body.append(scrim);
}
function limitRow(s, set) {
  return h('div', { class: 'row', style: { gap: '8px' } },
    h('div', { class: 'grow' }, h('div', { style: { fontSize: '14px' } }, 'Limit file size'), h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Highest quality that fits')),
    numberField(trimMb(s.limitMb), 'MB', 96, v => set(x => Object.assign(x, { limitMb: clamp(v, 0.1, 100) })), { decimal: true, disabled: !s.limitSize }),
    h('button', { class: 'switch' + (s.limitSize ? ' on' : ''), role: 'switch', 'aria-checked': String(s.limitSize), 'aria-label': 'Limit file size', onclick: () => set(x => Object.assign(x, { limitSize: !x.limitSize })) }));
}
function textLine(label, value, placeholder, fid, onInput) {
  const inp = h('input', { class: 'field', value, placeholder, 'data-fid': fid, 'aria-label': label || placeholder });
  inp.addEventListener('input', () => onInput(inp.value));
  return label ? h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, h('span', { class: 'muted', style: { fontSize: '12px' } }, label), inp) : inp;
}
/** Watermark size / opacity slider in the same style as the rest of the app. */
function labeledSlider(label, value, min, max, def, toPatch) {
  const val = h('span', { class: 'mono', style: { fontSize: '13px' } });
  const show = v => { val.textContent = v + '%'; val.style.color = v !== def ? C.amber : C.muted; };
  show(value);
  const sl = tickSlider({ value, min, max, step: 1, origin: min, resetTo: def, description: 'Watermark ' + label, valueText: v => v + '%',
    onChange: v => { v = Math.round(v); setExport(Object.assign({}, S.exportSettings, toPatch(v))); show(v); const pv = document.querySelector('.wm-preview'); if (pv) pv.replaceWith(watermarkPreview(S.exportSettings)); },
    onEnd: () => { S.dragging = false; } });
  return h('div', null, h('div', { class: 'row', style: { padding: '0 4px' } }, h('span', { class: 'grow', style: { fontSize: '14px' } }, label), val), sl);
}
function watermarkPreview(s) {
  const pv = S.previewImg, cv = h('canvas');
  if (pv && !S.previewCrop) {
    const src = imgToCanvas({ w: pv.w, h: pv.h, buf: pv.buf.slice(0) });
    const k = Math.min(1, 720 / Math.max(src.width, src.height));
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  } else { cv.width = 480; cv.height = 320; const g = cv.getContext('2d'); g.fillStyle = '#5A6470'; g.fillRect(0, 0, 480, 320); }
  drawWatermark(cv, Object.assign({}, s, { wmText: s.wmText.trim() || '© Your Name' }));
  return h('div', { class: 'wm-preview' }, cv);
}

// ================================================================== start-up
async function boot() {
  W.init();
  loadRecipes();
  loadExport();
  history.replaceState({ fd: 0 }, '');
  render();
  await loadStudio();
  render();
  const file = document.getElementById('file');
  file.accept = 'image/*,' + RAW_ACCEPT; // camera RAW too (RAF, DNG, CR2/CR3, NEF, ARW…)
  file.addEventListener('change', () => { if (file.files && file.files.length) importFiles(file.files); });
  // Drag and drop photos anywhere on the Studio.
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; appEl().classList.add('dragging-files'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) appEl().classList.remove('dragging-files'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; appEl().classList.remove('dragging-files');
    if (e.dataTransfer && e.dataTransfer.files.length) { if (S.screen !== 'studio') { S.backStack = []; S.screen = 'studio'; } importFiles(e.dataTransfer.files); }
  });
  // Paste an image (Ctrl/Cmd+V) into the Studio.
  window.addEventListener('paste', e => {
    if (S.screen !== 'studio' || !e.clipboardData) return;
    const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'));
    if (files.length) importFiles(files);
  });
  // Keyboard shortcuts in the editor.
  window.addEventListener('keydown', e => {
    if (S.screen !== 'editor' || /INPUT|TEXTAREA/.test((e.target.tagName || ''))) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  });
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.screen === 'editor' && !S.dragging) render(); }, 120); });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // Offline support: keep a copy of the app on this device.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
