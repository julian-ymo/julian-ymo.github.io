/* Film Desk web — screens: Studio, editor, Film tab, Q menu, Pro (ui/StudioScreen.kt, EditorScreen.kt, QMenuPanel.kt, ProPanel.kt). */
'use strict';

const appEl = () => document.getElementById('app');
const EL = { preview: null, orig: null, cropPhoto: null, cropOverlay: null };

/** Rebuilds the current screen, keeping the scroll position of anything marked data-keep. */
function render() {
  const root = appEl();
  const keep = {};
  root.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = [el.scrollLeft, el.scrollTop]; });
  liveHooks = [];
  const toastEl = root.querySelector('.toast');
  root.innerHTML = '';
  const scr = { studio: renderStudio, editor: renderEditor, recipes: renderRecipes, export: renderExport }[S.screen] || renderStudio;
  root.append(scr());
  if (toastEl) root.append(toastEl);
  root.querySelectorAll('[data-keep]').forEach(el => {
    const k = keep[el.dataset.keep];
    if (k) { el.scrollLeft = k[0]; el.scrollTop = k[1]; }
    else if (el.dataset.scrollto) { const t = el.querySelector(el.dataset.scrollto); if (t) el.scrollLeft = Math.max(0, t.offsetLeft - 80); }
  });
  if (S.screen === 'editor') { drawPreview(); drawCrop(); drawGraph(); }
}
function refreshEditor() { if (S.screen === 'editor') render(); }

// ================================================================== Studio
function renderStudio() {
  const all = S.studio;
  const shown = S.filter === 'Edited' ? all.filter(i => i.params) : S.filter === 'Not edited' ? all.filter(i => !i.params) : all;
  const selecting = S.selectMode || S.selection.size > 0;
  const scr = h('div', { class: 'screen' });
  if (selecting) {
    scr.append(h('div', { class: 'row sel-bar' },
      iconBtn('close', 'Cancel selection', clearSelection),
      h('div', { class: 'title grow' }, S.selection.size + ' selected'),
      iconBtn('select_all', 'Select all', () => { shown.forEach(i => S.selection.add(i.id)); render(); })));
  } else {
    const more = iconBtn('more_horiz', 'More', () => popupMenu(more, [
      { icon: 'filter_vintage', label: 'Recipes', onclick: () => openRecipes(true) },
      { icon: 'select_all', label: 'Select photos', disabled: !all.length, onclick: () => { S.selectMode = true; render(); } },
    ]));
    scr.append(h('div', { class: 'row studio-head' }, h('h1', { class: 'grow' }, 'Studio'), more,
      h('button', { class: 'fab', 'aria-label': 'Import photos', title: 'Import photos', onclick: pickFiles }, icon('add'))));
  }
  if (S.batchProgress) scr.append(h('div', { style: { padding: '6px 16px' } }, h('div', { class: 'amber', style: { fontSize: '13px' } }, S.batchProgress), h('div', { class: 'progress' }, h('div'))));
  if (selecting && S.clipboard) {
    scr.append(h('div', { class: 'row clip-banner' }, icon('content_paste', 20),
      h('div', { class: 'grow' }, h('div', { class: 'amber ellipsis', style: { fontSize: '13px', fontWeight: 600 } }, 'Edits copied from ' + S.clipboard.fromName),
        h('div', { class: 'muted ellipsis', style: { fontSize: '12px' } }, 'Select photos, then tap Paste · ' + M.copySummary(S.clipboard.params))),
      iconBtn('close', 'Clear copied edits', () => { S.clipboard = null; render(); }, { sm: true, color: C.muted })));
  }
  if (!all.length) {
    scr.append(h('div', { class: 'empty' }, icon('photo_library', 48),
      h('h2', null, 'Your Studio is empty'),
      h('p', null, 'Import photos to edit them — JPEG, HEIC or camera RAW (RAF, DNG, CR2/CR3, NEF, ARW…). Each photo keeps its own edits, and you can copy edits from one photo and paste them onto others. You can also drop photos here.'),
      h('button', { class: 'btn primary', onclick: pickFiles }, icon('add'), 'Import photos')),
      h('div', { class: 'footer-note' }, 'Your photos stay on this device — nothing is uploaded.'));
  } else {
    scr.append(h('div', { class: 'row filters' }, ['All', 'Edited', 'Not edited'].map(f =>
      h('button', { class: S.filter === f ? 'on' : '', onclick: () => { if (S.filter !== f) { S.selection.clear(); } S.filter = f; render(); } }, f))));
    const grid = h('div', { class: 'grid' }, shown.map(studioCell));
    const body = h('div', { class: 'grow scroll-y', 'data-keep': 'studio' },
      shown.length ? null : h('div', { class: 'muted', style: { padding: '24px' } }, S.filter === 'Edited' ? 'No edited photos yet.' : 'Every photo here has edits.'),
      grid, h('div', { class: 'footer-note' }, 'Your photos stay on this device — nothing is uploaded. Long-press or right-click a photo to select it.'));
    scr.append(body);
    if (selecting) {
      const one = S.selection.size === 1 ? [...S.selection][0] : null;
      const act = (ic, label, onclick, opts = {}) => h('button', { class: opts.hi ? 'hi' : '', disabled: !!opts.disabled, onclick }, icon(ic, 20), label);
      scr.append(h('div', { class: 'actions' },
        act('content_copy', 'Copy', () => copyEdits(one), { disabled: one == null }),
        act('content_paste', 'Paste', () => {
          const n = S.selection.size;
          if (!n) { toast('Select photos to paste to'); return; }
          pasteSheet(n === 1 ? 'Paste edits to 1 photo' : 'Paste edits to ' + n + ' photos', S.clipboard.fromName, n === 1 ? 'Paste to 1 photo' : 'Paste to ' + n + ' photos', pasteToSelection);
        }, { disabled: !S.clipboard, hi: !!S.clipboard }),
        act('filter_vintage', 'Recipe', () => openRecipes(true)),
        act('download', 'Export', openBatchExport, { disabled: S.exporting || !S.selection.size }),
        act('restart_alt', 'Reset', resetSelection, { disabled: !S.selection.size }),
        act('delete', 'Remove', removeSelection, { disabled: !S.selection.size })));
    }
  }
  scr.append(h('div', { class: 'drop-hint' }, 'Drop photos to import'));
  return scr;
}
let pressTimer = 0, longPressAt = 0;
function studioCell(it) {
  ensureThumb(it.id);
  const selecting = S.selectMode || S.selection.size > 0, sel = S.selection.has(it.id);
  const url = S.thumbs.get(it.id);
  const cell = h('div', {
    class: 'cell' + (sel ? ' sel' : '') + (S.justPasted.has(it.id) ? ' pasted' : ''), 'data-cell': it.id, role: 'button', tabindex: 0,
    'aria-label': (selecting ? 'Select ' : 'Edit ') + it.name,
    onpointerdown: e => {
      clearTimeout(pressTimer);
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      pressTimer = setTimeout(() => { longPressAt = Date.now(); toggleSelect(it.id); if (navigator.vibrate) navigator.vibrate(10); }, 480);
    },
    onpointerup: () => clearTimeout(pressTimer), onpointercancel: () => clearTimeout(pressTimer), onpointermove: e => { if (e.pointerType !== 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) clearTimeout(pressTimer); },
    oncontextmenu: e => { e.preventDefault(); clearTimeout(pressTimer); if (Date.now() - longPressAt > 1200) toggleSelect(it.id); },
    onclick: () => { if (Date.now() - longPressAt < 800) return; selecting ? toggleSelect(it.id) : openItem(it.id); },
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecting ? toggleSelect(it.id) : openItem(it.id); } },
  },
  h('div', { class: 'inner' },
    S.missing.has(it.id) ? h('div', { class: 'empty', style: { padding: '4px', gap: '2px' } }, icon('broken_image'), h('div', { class: 'muted', style: { fontSize: '10px' } }, 'Can’t open'))
      : url ? h('img', { src: url, alt: '' }) : null,
    it.params ? h('div', { class: 'code' }, M.simCode(it.params.sim)) : null,
    it.raw && !selecting ? h('div', { class: 'rawbadge' }, 'RAW') : null),
  selecting && S.clipboard && S.clipboard.fromId === it.id ? h('div', { class: 'copied' }, 'COPIED') : null,
  selecting ? h('div', { class: 'check' }, sel ? icon('check') : null) : null);
  return cell;
}
function updateStudioCell(id) {
  if (S.screen !== 'studio') return;
  const old = document.querySelector('[data-cell="' + id + '"]');
  const it = itemById(id);
  if (old && it) old.replaceWith(studioCell(it));
}
function pickFiles() { const f = document.getElementById('file'); f.value = ''; f.click(); }

// ================================================================== Editor
function renderEditor() {
  if (S.curveMode) return renderCurveScreen();
  const wide = appEl().clientWidth >= 600;
  const scr = h('div', { class: 'screen ed' });
  const main = h('div', { class: 'ed-main' }, editorTopBar(),
    S.tab === 'Crop' ? cropView() : previewArea());
  if (wide) {
    main.append(editorTabs());
    const pw = appEl().clientWidth >= 840 ? 380 : 330;
    scr.append(main, h('div', { class: 'ed-side', style: { width: pw + 'px' } }, h('div', { style: { height: '48px', flex: 'none' } }),
      h('div', { class: 'bottom', style: { flex: '1 1 auto', minHeight: 0, justifyContent: 'flex-start' } }, bottomArea())));
  } else {
    const panelH = Math.round(appEl().clientHeight * PANEL_FRACTION);
    // Crop's tools are short: give the rest of the space to the photo being cropped.
    const bstyle = S.tab === 'Crop' ? { maxHeight: panelH + 'px' } : { height: panelH + 'px' };
    main.append(h('div', { class: 'bottom', style: bstyle }, bottomArea()), editorTabs());
    scr.append(main);
  }
  return scr;
}
const PANEL_FRACTION = 0.44;

function bottomArea() {
  const sh = S.sheet;
  if (sh == null) {
    if (S.tab === 'Film') return filmTab();
    if (S.tab === 'QMenu') return qMenuPanel();
    if (S.tab === 'Pro') return proPanel();
    return h('div', { class: 'panel-scroll', 'data-keep': 'croptools' }, cropTools());
  }
  if (sh === 'film') return filmStrengthSheet();
  if (sh.startsWith('q:')) return qMenuPanel(); // the box opens inside the grid
  if (sh.startsWith('pro:')) return proSheet(sh.slice(4));
  return filmTab();
}

function editorTopBar() {
  const more = iconBtn('more_horiz', 'More', () => popupMenu(more, [
    { icon: 'content_copy', label: 'Copy edits', disabled: !hasImage(), onclick: copyCurrent },
    { icon: 'content_paste', label: 'Paste edits', disabled: !(S.clipboard && hasImage()), onclick: () => pasteSheet('Paste edits to this photo', S.clipboard.fromName, 'Paste', pasteCurrent) },
    '-',
    { icon: 'filter_vintage', label: 'Apply a recipe', onclick: () => openRecipes(false) },
    { icon: 'bookmark_add', label: 'Save as recipe', onclick: saveRecipeDialog },
  ]));
  return h('div', { class: 'row topbar' },
    iconBtn('arrow_back', 'Back', leaveEditor),
    h('div', { class: 'grow' }),
    iconBtn('undo', 'Undo', undo, { disabled: !S.undo.length && M.equals(S.params, S.committed) }),
    iconBtn('redo', 'Redo', redo, { disabled: !S.redo.length }),
    more,
    h('button', { class: 'export', disabled: !hasImage(), onclick: openExport }, 'Export'));
}
function saveRecipeDialog() {
  const inp = h('input', { class: 'field', maxlength: 60, placeholder: 'e.g. Street Chrome', 'aria-label': 'Recipe name' });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { saveRecipe(inp.value); closeOverlays(); } });
  dialog('Save as recipe', inp, [{ label: 'Cancel', color: C.muted, onclick: () => {} }, { label: 'Save', onclick: () => saveRecipe(inp.value) }]);
}

function previewArea() {
  if (!EL.preview) { EL.preview = h('canvas', { 'aria-label': 'Photo preview', role: 'img' }); EL.orig = h('canvas', { class: 'orig', 'aria-hidden': 'true' }); }
  const sim = M.FILM_SIMS[S.params.sim];
  const tagText = orig => (S.currentIsRaw ? 'RAW · ' : '') + (orig ? 'ORIGINAL' : M.FILM_SIMS[S.params.sim].short.toUpperCase() + (S.params.simStrength < 1 ? ' · ' + Math.round(S.params.simStrength * 100) + '%' : ''));
  const tag = h('div', { class: 'simtag' }, tagText(false));
  live(() => { tag.textContent = tagText(false); });
  const area = h('div', { class: 'preview' + (S.picker ? ' picking' : '') }, EL.preview, EL.orig, tag,
    h('div', { class: 'busy', id: 'busy' }, S.rendering && !S.loading ? h('div', { class: 'spinner sm' }) : null),
    S.loading || !S.previewImg ? h('div', { class: 'center', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } }, h('div', { class: 'spinner' }),
      S.loading && S.currentIsRaw ? h('div', { class: 'mono muted', style: { fontSize: '11px' } }, 'DEVELOPING RAW…') : null) : null,
    S.picker && !S.loading ? h('div', { class: 'bottom-badge badge' }, 'TAP TO SAMPLE A COLOUR') : null);
  const showOrig = on => {
    area.classList.toggle('showing-orig', on && !!S.origImg);
    tag.textContent = tagText(on && !!S.origImg);
  };
  area.addEventListener('pointerdown', e => {
    if (S.picker) {
      const cv = EL.preview, r = cv.getBoundingClientRect(), iw = cv.width, ih = cv.height;
      const sc = Math.min(r.width / iw, r.height / ih), dw = iw * sc, dh = ih * sc;
      const fx = (e.clientX - r.left - (r.width - dw) / 2) / dw, fy = (e.clientY - r.top - (r.height - dh) / 2) / dh;
      if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) sampleAt(fx, fy);
      return;
    }
    showOrig(true);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => area.addEventListener(ev, () => showOrig(false)));
  area.addEventListener('contextmenu', e => e.preventDefault());
  return area;
}
function drawPreview() {
  if (!S.previewImg) return;
  if (S.previewCrop) { drawCropPhoto(); return; }
  if (EL.preview) imgToCanvas({ w: S.previewImg.w, h: S.previewImg.h, buf: S.previewImg.buf }, EL.preview);
  if (S.origImg && EL.orig && EL.orig._key !== S.origKey) { imgToCanvas(S.origImg, EL.orig); EL.orig._key = S.origKey; }
  const c = document.querySelector('.preview .center'); if (c) c.remove();
  updateBusy();
}
function updateBusy() {
  const b = document.getElementById('busy');
  if (b) b.innerHTML = S.rendering && !S.loading ? '<div class="spinner sm"></div>' : '';
}

function editorTabs() {
  const tabs = [['Film', 'movie', 'Film'], ['QMenu', 'grid_view', 'Q Menu'], ['Pro', 'tune', 'Pro'], ['Crop', 'crop', 'Crop']];
  return h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, ic, label]) =>
    h('button', { class: S.tab === id ? 'on' : '', role: 'tab', 'aria-selected': String(S.tab === id), onclick: () => setTab(id) }, icon(ic), label)));
}

// ------------------------------------------------------------------ Film tab
function filmTab() {
  const p = S.params, sim = M.FILM_SIMS[p.sim];
  return h('div', { class: 'panel-scroll', style: { padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('div', { style: { padding: '0 16px' } },
      h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'label' }, 'Film simulation'),
        h('span', { class: 'grow ellipsis', style: { fontSize: '14px', fontWeight: 600 } }, sim.name),
        h('span', { class: 'mono muted', style: { fontSize: '10px' } }, (p.sim + 1) + '/' + M.FILM_SIMS.length)),
      h('div', { class: 'muted ellipsis', style: { fontSize: '11px' } }, sim.description + ' · strength ' + Math.round(p.simStrength * 100) + '%')),
    simStrip(i => { if (i === S.params.sim) openSheet('film'); else change(M.copy(S.params, { sim: i })); }),
    h('div', { style: { padding: '0 16px', fontSize: '10px', color: 'rgba(163,163,158,.7)' } }, 'Tap the selected film again for strength · hold the photo to compare'));
}
function simStrip(onPick) {
  return h('div', { class: 'scroll-x', 'data-keep': 'simstrip', 'data-scrollto': '.sim-tile.on' },
    h('div', { class: 'sim-strip', role: 'radiogroup', 'aria-label': 'Film simulations' }, M.FILM_SIMS.map((s, i) => {
      const cv = h('canvas', { 'data-simthumb': i });
      if (S.simThumbs[i]) paintThumb(cv, S.simThumbs[i]);
      const on = i === S.params.sim;
      return h('button', { class: 'sim-tile' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), 'aria-label': s.name, onclick: () => onPick(i) },
        h('div', { class: 'img', style: { background: s.swatch } }, cv),
        h('div', { class: 'bar', style: { background: s.swatch } }),
        h('div', { class: 'code' }, M.simCode(i)));
    })));
}
function filmStrengthSheet() {
  const pct = () => Math.round(S.params.simStrength * 100);
  const setPct = n => updateParams(M.copy(S.params, { simStrength: clamp(n, 0, 100) / 100 }));
  const sl = tickSlider({ value: pct(), min: 0, max: 100, step: 1, origin: 100, minLabel: '0%', maxLabel: '100%', description: 'Film strength',
    valueText: v => v + '%', onChange: setPct, onEnd: refreshEditor });
  live(() => sl.update(pct()));
  return optionPanel([
    bigValue(M.FILM_SIMS[S.params.sim].name + ' · strength', () => pct() + '%', () => pct() !== 100, k => setPct(pct() + k)),
    sl,
  ], { onCancel: cancelSheet, onReset: () => updateParams(M.copy(S.params, { simStrength: 1 })), onDone: () => doneSheet(), hint: 'Hold photo to compare' });
}

// ------------------------------------------------------------------ Q menu
const Q_DIALS = [
  ['sim', 'Film Sim', ['sim']], ['exp', 'Exposure', ['exp']], ['grain', 'Grain', ['grain']], ['cc', 'Color Chr.', ['cc']],
  ['ccb', 'CC FX Blue', ['ccb']], ['wb', 'White Bal.', ['wb']], ['wbs', 'WB Shift', ['wbr', 'wbb']], ['dr', 'Dyn. Range', ['dr']],
  ['drp', 'D-Range Pri.', ['drp']], ['hl', 'Highlight', ['hl']], ['sh', 'Shadow', ['sh']], ['color', 'Color', ['color']],
  ['sharp', 'Sharpness', ['sharp']], ['nr', 'High ISO NR', ['nr']], ['clarity', 'Clarity', ['clarity']], ['mono', 'Mono WC/MG', ['mwc', 'mmg']],
  ['skin', 'Smooth Skin', ['skin']],
].map(([id, label, settings]) => ({ id, label, settings }));
const dialChanged = (d, p) => d.settings.some(id => !M.settingIsDefault(M.setting(id), p)) || (d.id === 'sim' && p.simStrength !== 1);
const dialLock = (d, p) => M.lockReason(d.settings[0], p);
const GRAIN_CODES = ['OFF', 'W·S', 'W·L', 'S·S', 'S·L'];
function expShort(t) {
  if (t === 0) return '±0';
  const a = Math.abs(t), frac = ['', '⅓', '⅔'][a % 3], whole = Math.floor(a / 3) > 0 ? String(Math.floor(a / 3)) : '';
  return (t > 0 ? '+' : '−') + whole + frac;
}
function wbShort(p) {
  const w = M.WB_PRESETS[clamp(p.wb, 0, M.WB_PRESETS.length - 1)];
  switch (w.type) {
    case 'AS_SHOT': return 'SHOT'; case 'AUTO': return 'AUTO'; case 'CUSTOM': return p.kelvin + 'K'; case 'UNDERWATER': return 'UW';
    default: return { Daylight: 'DAY', Shade: 'SHADE', 'Fluorescent 1': 'F1', 'Fluorescent 2': 'F2', 'Fluorescent 3': 'F3', Incandescent: 'INC' }[w.label] || w.label.slice(0, 4).toUpperCase();
  }
}
function dialValue(d, p) {
  switch (d.id) {
    case 'sim': return M.simCode(p.sim);
    case 'exp': return expShort(p.exposureThirds);
    case 'grain': return GRAIN_CODES[clamp(p.grain, 0, 4)];
    case 'cc': return M.CHROME_OPTIONS[p.colorChrome].toUpperCase();
    case 'ccb': return M.CHROME_OPTIONS[p.colorChromeBlue].toUpperCase();
    case 'wb': return wbShort(p);
    case 'wbs': return p.wbShiftR === 0 && p.wbShiftB === 0 ? '0' : 'R' + M.signed(p.wbShiftR) + ' B' + M.signed(p.wbShiftB);
    case 'drp': return M.DRP_OPTIONS[p.dRangePriority].toUpperCase();
    case 'mono': return !M.isMono(p.sim) ? '–' : (p.monoWC === 0 && p.monoMG === 0) ? '0' : M.signed(p.monoWC) + ' ' + M.signed(p.monoMG);
    case 'skin': return M.SKIN_OPTIONS[p.smoothSkin].toUpperCase();
    default: return M.effectiveDisplay(M.setting(d.settings[0]), p);
  }
}
const DIAL_HINTS = {
  exp: '−3 … +3 EV, ⅓ steps', hl: '−2 soft … +4 hard', sh: '−2 soft … +4 hard', color: '−4 … +4', sharp: '−4 … +4', nr: '−4 … +4',
  clarity: '−5 … +5', wb: 'preset · Kelvin · shift', wbs: 'preset · Kelvin · shift', mono: 'B&W films only', grain: 'roughness · size',
  cc: 'deeper strong colours', ccb: 'richer blues', dr: 'highlight roll-off', drp: 'overrides DR, H, S', skin: 'softens skin texture',
};
/** Width of the panel the Q menu sits in, so the box can open under the right row. */
function qCols() {
  const aw = appEl().clientWidth, w = aw >= 600 ? (aw >= 840 ? 380 : 330) : aw;
  return clamp(Math.floor((w - 16) / 68), 4, 8);
}
/**
 * Fujifilm-style Q menu: a grid of round dials showing every setting. Tapping a dial opens its box
 * right under that row (pointing at the dial); Done or tapping the dial again closes it.
 */
function qMenuPanel() {
  const p = S.params, cols = qCols();
  const openId = S.sheet && S.sheet.startsWith('q:') ? S.sheet.slice(2) : null;
  const rows = [];
  for (let i = 0; i < Q_DIALS.length; i += cols) {
    const row = Q_DIALS.slice(i, i + cols);
    rows.push(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)' } }, row.map(d =>
      valueDial(dialValue(d, p), d.label, dialChanged(d, p), () => d.id === openId ? doneSheet() : openSheet('q:' + d.id),
        { dimmed: dialLock(d, p) != null, selected: d.id === openId }))));
    const idx = row.findIndex(d => d.id === openId);
    if (idx >= 0) rows.push(qBox(row[idx], idx, cols));
  }
  return h('div', { class: 'panel-scroll', 'data-keep': 'qmenu', style: { padding: '8px 0' } },
    h('div', { class: 'row sec-head' }, h('div', { class: 'label grow' }, 'Q Menu'),
      h('button', { class: 'text-btn', style: { fontSize: '11px' }, onclick: () => { if (S.sheet) doneSheet(true); change(M.resetCamera(S.params)); } }, 'Reset all')),
    h('div', { style: { padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: '10px' } }, rows));
}
/** The option box under a row of dials, with a little pointer up to the open dial. */
function qBox(d, col, cols) {
  const p = S.params, lock = dialLock(d, p);
  const title = d.id === 'sim' ? 'Film Simulation' : d.id === 'wbs' ? 'White Balance' : d.id === 'mono' ? 'Monochromatic Color' : d.label;
  const pointer = h('canvas', { class: 'qbox-pointer', 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    const w = pointer.clientWidth, hh = 9, g = dprCanvas(pointer, w, hh + 2), cx = w * (col + 0.5) / cols;
    g.fillStyle = '#17140E'; g.beginPath(); g.moveTo(cx - hh, hh + 2); g.lineTo(cx, 0); g.lineTo(cx + hh, hh + 2); g.closePath(); g.fill();
    g.strokeStyle = C.amber; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - hh, hh); g.lineTo(cx, 0.75); g.lineTo(cx + hh, hh); g.stroke();
  });
  const box = h('div', { class: 'qbox-wrap' }, pointer,
    h('div', { class: 'qbox', role: 'group', 'aria-label': title },
      h('div', { class: 'row', style: { gap: '8px' } },
        d.id === 'sim' ? [h('span', { class: 'label', style: { letterSpacing: '1px', flex: 'none' } }, 'Film Simulation'),
          h('div', { class: 'grow ellipsis', style: { fontSize: '16px', fontWeight: 700 } }, M.FILM_SIMS[p.sim].name)]
          : h('div', { class: 'grow', style: { fontSize: '15px', fontWeight: 700 } }, title),
        h('div', { class: 'muted ellipsis' + (d.id === 'sim' ? ' mono' : ''), style: { fontSize: '11px' } }, d.id === 'sim' ? (p.sim + 1) + '/' + M.FILM_SIMS.length : (DIAL_HINTS[d.id] || ''))),
      lock ? [h('div', { class: 'mono muted', style: { fontSize: '20px', fontWeight: 600 } }, dialValue(d, p)), h('div', { class: 'row lock' }, icon('lock'), h('span', null, lock))]
        : qBoxContent(d),
      h('div', { class: 'row', style: { height: '44px' } },
        lock ? null : h('button', { class: 'text-btn', onclick: () => updateParams(resetDial(d, S.params)) }, 'Reset'),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn primary', style: { height: '36px', padding: '0 20px' }, onclick: () => doneSheet() }, 'Done'))));
  // Bring the box into view once it is on screen (only when it was just opened).
  if (qBox.lastOpened !== d.id) { qBox.lastOpened = d.id; setTimeout(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80); }
  return box;
}
function qBoxContent(d) {
  const p = S.params, up = o => updateParams(M.copy(S.params, o));
  switch (d.id) {
    case 'sim': {
      const sim = M.FILM_SIMS[p.sim], pct = () => Math.round(S.params.simStrength * 100);
      const val = h('span', { class: 'mono', style: { width: '44px', textAlign: 'right', fontSize: '13px', flex: 'none' } });
      const upd = () => { val.textContent = pct() + '%'; val.style.color = pct() !== 100 ? C.amber : C.muted; };
      upd(); live(upd);
      const sl = tickSlider({ value: pct(), min: 0, max: 100, step: 1, origin: 100, description: 'Film strength', valueText: v => v + '%',
        onChange: v => up({ simStrength: clamp(v, 0, 100) / 100 }), onEnd: refreshEditor });
      live(() => sl.update(pct()));
      return [h('div', { class: 'muted ellipsis', style: { fontSize: '12px' } }, sim.description),
        h('div', { style: { margin: '0 -14px' } }, simStrip(i => up({ sim: i }))),
        h('div', { class: 'row' }, h('span', { style: { width: '62px', fontSize: '12px', flex: 'none' } }, 'Strength'), h('div', { class: 'grow' }, sl), val)];
    }
    case 'grain': return choiceTiles(M.GRAIN_OPTIONS.map(s => s.replace(' · ', '\n')), p.grain, i => up({ grain: i }), { draw: grainTile });
    case 'cc': return choiceTiles(M.CHROME_OPTIONS, p.colorChrome, i => up({ colorChrome: i }), { draw: (g, w, hh, i) => chromeTile(g, w, hh, i, '#FF7A2E', '#D9301F') });
    case 'ccb': return choiceTiles(M.CHROME_OPTIONS, p.colorChromeBlue, i => up({ colorChromeBlue: i }), { draw: (g, w, hh, i) => chromeTile(g, w, hh, i, '#5AA8FF', '#1E5FD0') });
    case 'dr': return choiceTiles(M.DR_OPTIONS, p.dynamicRange, i => up({ dynamicRange: i }), { draw: drTile });
    case 'drp': return choiceTiles(M.DRP_OPTIONS, p.dRangePriority, i => up({ dRangePriority: i }), { text: i => ['OFF', 'W', 'S', 'AUTO'][i] });
    case 'skin': return choiceTiles(M.SKIN_OPTIONS, p.smoothSkin, i => up({ smoothSkin: i }), { draw: skinTile });
    case 'wb': case 'wbs': return whiteBalancePanel();
    case 'mono': {
      const wc = h('div', { class: 'mono', style: { fontSize: '14px' } }), mg = h('div', { class: 'mono', style: { fontSize: '14px' } });
      const upd = () => {
        wc.textContent = 'WC ' + M.signed(S.params.monoWC); wc.style.color = S.params.monoWC ? C.amber : C.text;
        mg.textContent = 'MG ' + M.signed(S.params.monoMG); mg.style.color = S.params.monoMG ? C.amber : C.text;
      };
      upd(); live(upd);
      return h('div', { class: 'row' },
        h('div', { class: 'grow' }, shiftPad(() => [S.params.monoWC, S.params.monoMG], (x, y) => up({ monoWC: x, monoMG: y }),
          { left: 'Cool', right: 'Warm', top: 'M', bottom: 'G', lc: '#6FA8FF', rc: '#FFA24D', tc: '#E05BD1', bc: '#5BD17A' }, 120)),
        h('div', { style: { paddingLeft: '12px' } }, h('div', { class: 'label' }, 'B&W tone'), wc, mg));
    }
    default: {
      const s = M.setting(d.settings[0]);
      const shown = () => d.id === 'exp' ? expShort(S.params.exposureThirds) : s.format(S.params[s.key]);
      const sl = tickSlider({ value: p[s.key], min: s.min, max: s.max, step: s.step, description: d.label, valueText: () => shown(),
        minLabel: d.id === 'exp' ? '−3' : s.format(s.min), midLabel: '0', maxLabel: d.id === 'exp' ? '+3' : s.format(s.max),
        onChange: v => up({ [s.key]: M.snap(s, v) }), onEnd: refreshEditor });
      live(() => sl.update(S.params[s.key]));
      return [bigValue('', shown, () => !M.settingIsDefault(s, S.params), k => up({ [s.key]: M.snap(s, S.params[s.key] + k * s.step) })), sl];
    }
  }
}
function resetDial(d, p) {
  const z = M.DEF;
  if (d.id === 'wb') return M.copy(p, { wb: z.wb, kelvin: z.kelvin, wbShiftR: 0, wbShiftB: 0 });
  if (d.id === 'wbs') return M.copy(p, { wbShiftR: 0, wbShiftB: 0 });
  if (d.id === 'mono') return M.copy(p, { monoWC: 0, monoMG: 0 });
  if (d.id === 'sim') return M.copy(p, { sim: z.sim, simStrength: z.simStrength });
  const q = M.copy(p);
  d.settings.forEach(id => { const s = M.setting(id); q[s.key] = z[s.key]; });
  return q;
}
function choiceTiles(labels, selected, onPick, opts) {
  return h('div', { class: 'scroll-x' }, h('div', { class: 'tiles' }, labels.map((l, i) => picTile(l, i === selected, () => onPick(i),
    { text: opts.text ? opts.text(i) : null, draw: opts.draw ? (g, w, hh) => opts.draw(g, w, hh, i) : null }))));
}
function grainTile(g, w, hh, i) {
  g.fillStyle = '#7A7A78'; g.fillRect(0, 0, w, hh);
  if (i === 0) return;
  const strong = i >= 3, large = i === 2 || i === 4, rnd = rng(7 + i), n = strong ? 260 : 130, r = large ? 1.6 : 0.9;
  for (let k = 0; k < n; k++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(46,46,44,' + (strong ? 0.9 : 0.6) + ')' : 'rgba(201,201,196,' + (strong ? 0.9 : 0.6) + ')';
    g.beginPath(); g.arc(rnd() * w, rnd() * hh, r, 0, Math.PI * 2); g.fill();
  }
}
function chromeTile(g, w, hh, i, light, deep) {
  const dark = i === 1 ? 0.25 : i === 2 ? 0.45 : 0;
  let gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, light); gr.addColorStop(1, deep);
  g.fillStyle = gr; g.fillRect(0, 0, w, hh);
  if (dark > 0) {
    const n = parseInt(deep.slice(1), 16), sh = 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - dark))).join(',') + ')';
    gr = g.createLinearGradient(0, hh * 0.5, 0, hh); gr.addColorStop(0, light); gr.addColorStop(1, sh);
    g.fillStyle = gr; g.fillRect(0, hh * 0.5, w, hh * 0.5);
  }
}
function drTile(g, w, hh, i) {
  g.fillStyle = '#141416'; g.fillRect(0, 0, w, hh);
  const pad = w * 0.18, knee = i === 1 ? 0.7 : i === 2 ? 0.5 : 1;
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath();
  for (let k = 0; k <= 30; k++) {
    const x = k / 30; let y = x;
    if (x > knee) { const t = (x - knee) / (1 - knee); y = knee + (1 - knee) * (1 - (1 - t) * (1 - t)) * 0.75 + (1 - knee) * 0.25 * t; }
    const px = pad + x * (w - 2 * pad), py = hh - pad - y * (hh - 2 * pad);
    k ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.stroke();
}
function skinTile(g, w, hh, i) {
  g.fillStyle = '#D7A688'; g.fillRect(0, 0, w, hh);
  const rnd = rng(3), n = i === 0 ? 70 : i === 1 ? 30 : 0;
  g.fillStyle = 'rgba(156,98,72,.6)';
  for (let k = 0; k < n; k++) { g.beginPath(); g.arc(rnd() * w, rnd() * hh, 1.2, 0, Math.PI * 2); g.fill(); }
}
const WB_SHORT = { Daylight: '☀', Shade: 'SHD', 'Fluorescent 1': 'F1', 'Fluorescent 2': 'F2', 'Fluorescent 3': 'F3', Incandescent: 'INC' };
const WB_LABEL = { 'Fluorescent 1': 'Fluor. 1', 'Fluorescent 2': 'Fluor. 2', 'Fluorescent 3': 'Fluor. 3', Incandescent: 'Incand.' };
function whiteBalancePanel() {
  const p = S.params, preset = M.WB_PRESETS[p.wb];
  const up = o => updateParams(M.copy(S.params, o));
  const out = [
    preset.type === 'CUSTOM' ? bigValue('', () => S.params.kelvin + 'K', () => true, k => up({ kelvin: clamp(S.params.kelvin + k * 100, 2500, 10000) })) : null,
    h('div', { class: 'scroll-x', 'data-keep': 'wbpresets' }, h('div', { class: 'row', style: { gap: '2px' } }, M.WB_PRESETS.map((w, i) => {
      const short = { AS_SHOT: 'SHOT', AUTO: 'AUTO', CUSTOM: 'K', UNDERWATER: 'UW' }[w.type] || WB_SHORT[w.label] || w.label.slice(0, 3);
      return valueDial(short, WB_LABEL[w.label] || w.label, false, () => up({ wb: i }), { selected: p.wb === i });
    }))),
  ];
  if (preset.type === 'CUSTOM') {
    const sl = tickSlider({ value: p.kelvin, min: 2500, max: 10000, step: 100, origin: 5500, minLabel: '2500K', midLabel: '5500K', maxLabel: '10000K',
      description: 'Kelvin', valueText: v => v + 'K', onChange: v => up({ kelvin: Math.round(v) }), onEnd: refreshEditor });
    live(() => sl.update(S.params.kelvin));
    out.push(sl);
  }
  const rR = h('div', { class: 'mono', style: { fontSize: '14px' } }), rB = h('div', { class: 'mono', style: { fontSize: '14px' } });
  const upd = () => {
    rR.textContent = 'R ' + M.signed(S.params.wbShiftR); rR.style.color = S.params.wbShiftR ? C.amber : C.text;
    rB.textContent = 'B ' + M.signed(S.params.wbShiftB); rB.style.color = S.params.wbShiftB ? C.amber : C.text;
  };
  upd(); live(upd);
  out.push(h('div', { class: 'row' },
    h('div', { class: 'grow' }, shiftPad(() => [S.params.wbShiftR, S.params.wbShiftB], (x, y) => up({ wbShiftR: x, wbShiftB: y }),
      { left: 'C', right: 'R', top: 'B', bottom: 'Y', lc: '#4FD1D9', rc: '#FF5A5A', tc: '#5A8CFF', bc: '#FFD24D' }, 120)),
    h('div', { style: { paddingLeft: '12px' } }, h('div', { class: 'label' }, 'WB shift'), rR, rB,
      h('button', { class: 'text-btn', style: { fontSize: '11px', paddingLeft: 0 }, onclick: () => up({ wbShiftR: 0, wbShiftB: 0 }) }, 'Centre'))));
  return out;
}
/** 2D pad from −9 to +9 on both axes (like the camera's WB shift grid). x grows right, y grows up. */
function shiftPad(get, onChange, lab, size) {
  const cv = h('canvas', { class: 'shiftpad', role: 'application', 'aria-label': lab.left + ' ' + lab.right + ' ' + lab.top + ' ' + lab.bottom + ' shift', tabindex: 0, style: { width: size + 'px', height: size + 'px' } });
  const draw = () => {
    const [x, y] = get(), g = dprCanvas(cv, size, size), pad = 16, inner = size - 2 * pad, cell = inner / 18;
    g.fillStyle = '#0E0E10'; g.fillRect(0, 0, size, size);
    g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(0.5, 0.5, size - 1, size - 1);
    g.fillStyle = 'rgba(163,163,158,.35)';
    for (let i = 0; i <= 18; i++) for (let j = 0; j <= 18; j++) { g.fillRect(pad + i * cell - 0.5, pad + j * cell - 0.5, 1, 1); }
    g.strokeStyle = 'rgba(163,163,158,.5)'; g.beginPath(); g.moveTo(pad + inner / 2, pad); g.lineTo(pad + inner / 2, pad + inner); g.moveTo(pad, pad + inner / 2); g.lineTo(pad + inner, pad + inner / 2); g.stroke();
    g.font = '700 10px ' + getComputedStyle(document.body).fontFamily; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lab.lc; g.fillText(lab.left.length > 1 ? lab.left[0] : lab.left, 8, size / 2);
    g.fillStyle = lab.rc; g.fillText(lab.right.length > 1 ? lab.right[0] : lab.right, size - 8, size / 2);
    g.fillStyle = lab.tc; g.fillText(lab.top, size / 2, 8);
    g.fillStyle = lab.bc; g.fillText(lab.bottom, size / 2, size - 8);
    const px = pad + (x + 9) * cell, py = pad + (9 - y) * cell;
    g.fillStyle = (x || y) ? C.amber : '#fff'; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
  };
  const at = e => {
    const r = cv.getBoundingClientRect(), pad = 16, cell = (size - 2 * pad) / 18;
    return [clamp(Math.round((e.clientX - r.left - pad) / cell - 9), -9, 9), clamp(Math.round(9 - (e.clientY - r.top - pad) / cell), -9, 9)];
  };
  let down = false;
  cv.addEventListener('pointerdown', e => { down = true; S.dragging = true; cv.setPointerCapture(e.pointerId); const [x, y] = at(e); onChange(x, y); draw(); });
  cv.addEventListener('pointermove', e => { if (!down) return; const [x, y] = at(e), [ox, oy] = get(); if (x !== ox || y !== oy) { onChange(x, y); draw(); } });
  const end = () => { if (down) { down = false; dragEnded(); refreshEditor(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', e => {
    const [x, y] = get(), m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (m) { e.preventDefault(); onChange(clamp(x + m[0], -9, 9), clamp(y + m[1], -9, 9)); }
  });
  live(draw);
  requestAnimationFrame(draw);
  return h('div', { class: 'row', style: { justifyContent: 'center' } }, cv);
}

// ------------------------------------------------------------------ Pro
const PRO_SECTIONS = [
  ['Light', [['Contrast', 'Contrast', 'contrast'], ['Highlights', 'Highlights', 'wb_sunny'], ['Shadows', 'Shadows', 'brightness_4'],
    ['Whites', 'Whites', 'brightness_high'], ['Blacks', 'Blacks', 'brightness_low'], ['Fade', 'Fade', 'gradient']]],
  ['Colour', [['Temperature', 'Temp', 'thermostat', 'cool', 'warm'], ['Tint', 'Tint', 'palette', 'green', 'magenta'], ['Vibrance', 'Vibrance', 'invert_colors'],
    ['Saturation', 'Saturation', 'color_lens'], ['HSL', 'HSL', 'tonality']]],
  ['Advanced & effects', [['Curve', 'Curve', 'show_chart'], ['Vignette', 'Vignette', 'vignette', 'dark', 'light'], ['Glow', 'Glow', 'auto_awesome']]],
].map(([title, tools]) => ({ title, tools: tools.map(([id, label, ic, minLabel, maxLabel]) => ({ id, label, icon: ic, minLabel, maxLabel })) }));
const proSlider = label => M.PRO_SLIDERS.find(s => s.label === label);
const fmtPro = (v, signedRange) => signedRange ? signedInt(v) : String(v);
const hslChanged = p => p.hslHue.some(v => v) || p.hslSat.some(v => v) || p.hslLum.some(v => v);
function toolState(t, p) {
  if (t.id === 'HSL') return hslChanged(p) ? ['edited', true] : ['–', false];
  if (t.id === 'Curve') return (M.hasCurves(p) || M.hasSoftClip(p)) ? ['edited', true] : ['–', false];
  const s = proSlider(t.id);
  if (!s) return ['–', false];
  const v = p[s.key];
  return [fmtPro(v, s.min < 0), v !== s.def];
}
function proPanel() {
  const p = S.params;
  return h('div', { class: 'panel-scroll', 'data-keep': 'pro', style: { padding: '8px 0' } }, PRO_SECTIONS.map((sec, si) => [
    h('div', { class: 'row sec-head' }, h('div', { class: 'label grow' }, sec.title),
      si === 0 ? h('button', { class: 'text-btn', style: { fontSize: '11px' }, onclick: () => change(M.resetPro(S.params)) }, 'Reset all') : null),
    h('div', { class: 'dial-grid', style: { rowGap: '8px', paddingTop: '4px' } }, sec.tools.map(t => {
      const [v, ch] = toolState(t, p);
      return toolCircle(t.icon, t.label, v, ch, () => t.id === 'Curve' ? openCurve() : openSheet('pro:' + t.id));
    })),
  ]));
}
function proSheet(id) {
  const tool = PRO_SECTIONS.flatMap(s => s.tools).find(t => t.id === id);
  if (!tool) return proPanel();
  if (id === 'HSL') return hslSheet();
  if (id === 'Glow') return glowSheet();
  const s = proSlider(id), sg = s.min < 0;
  const set = v => updateParams(M.copy(S.params, { [s.key]: clamp(Math.round(v), s.min, s.max) }));
  const sl = tickSlider({ value: S.params[s.key], min: s.min, max: s.max, step: 1, origin: s.def, description: s.label, valueText: v => fmtPro(v, sg),
    minLabel: tool.minLabel || fmtPro(s.min, sg), midLabel: sg ? '0' : null, maxLabel: tool.maxLabel || fmtPro(s.max, sg), onChange: set, onEnd: refreshEditor });
  live(() => sl.update(S.params[s.key]));
  return optionPanel([bigValue(s.label, () => fmtPro(S.params[s.key], sg), () => S.params[s.key] !== s.def, k => set(S.params[s.key] + k)), sl],
    { onCancel: cancelSheet, onReset: () => set(s.def), onDone: () => doneSheet(), hint: 'Hold photo to compare' });
}
function sliderRow(label, getV, def, min, max, onChange) {
  const val = h('span', { class: 'mono' });
  const upd = () => { const v = getV(); val.textContent = fmtPro(v, min < 0); val.style.color = v !== def ? C.amber : C.muted; };
  upd(); live(upd);
  const sl = tickSlider({ value: getV(), min, max, step: 1, origin: def, description: label, valueText: v => fmtPro(v, min < 0), onChange: v => onChange(Math.round(v)), onEnd: refreshEditor });
  live(() => sl.update(getV()));
  return h('div', { class: 'slider-row' }, h('div', { class: 'row' }, h('span', { class: 'grow' }, label), val), sl);
}
let hslBand = 0;
function hslSheet() {
  const p = S.params;
  const setList = (key, v) => { const l = S.params[key].slice(); l[hslBand] = v; updateParams(M.copy(S.params, { [key]: l })); };
  return optionPanel([
    h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour band' }, M.HSL_SWATCHES.map((c, i) => {
      const edited = p.hslHue[i] || p.hslSat[i] || p.hslLum[i];
      return h('button', { class: 'swatch' + (hslBand === i ? ' on' : edited ? ' edited' : ''), role: 'radio', 'aria-checked': String(hslBand === i), 'aria-label': M.HSL_NAMES[i], onclick: () => { hslBand = i; refreshEditor(); } }, h('div', { style: { background: c } }));
    })),
    h('div', { class: 'label' }, M.HSL_NAMES[hslBand]),
    sliderRow('Hue', () => S.params.hslHue[hslBand], 0, -100, 100, v => setList('hslHue', v)),
    sliderRow('Saturation', () => S.params.hslSat[hslBand], 0, -100, 100, v => setList('hslSat', v)),
    sliderRow('Luminance', () => S.params.hslLum[hslBand], 0, -100, 100, v => setList('hslLum', v)),
  ], { onCancel: cancelSheet, onReset: () => updateParams(M.copy(S.params, { hslHue: [0, 0, 0, 0, 0, 0, 0, 0], hslSat: [0, 0, 0, 0, 0, 0, 0, 0], hslLum: [0, 0, 0, 0, 0, 0, 0, 0] })), onDone: () => doneSheet() });
}
function glowSheet() {
  const p = S.params, up = o => updateParams(M.copy(S.params, o));
  return optionPanel([
    h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } }, M.GLOW_STYLES.map((l, i) =>
      h('button', { class: 'pill outline' + (p.glowStyle === i ? ' on' : ''), style: { fontSize: '12px', padding: '6px 14px' }, onclick: () => up({ glowStyle: i }) }, l))),
    h('div', { class: 'muted', style: { fontSize: '11px' } }, ['Soft bloom around bright areas.', 'Red-orange glow around highlights, like CineStill film.', 'Soft haze over the whole photo, like a mist filter.'][p.glowStyle]),
    sliderRow('Amount', () => S.params.glow, 0, 0, 100, v => up({ glow: v })),
    M.GLOW_SLIDERS.map(s => sliderRow(s.label, () => S.params[s.key], s.def, s.min, s.max, v => up({ [s.key]: v }))),
  ], { onCancel: cancelSheet, onReset: () => up({ glow: 0, glowStyle: 0, glowThreshold: 70, glowSize: 40, glowWarmth: 30 }), onDone: () => doneSheet() });
}
