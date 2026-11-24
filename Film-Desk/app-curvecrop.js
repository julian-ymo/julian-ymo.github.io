/* Film Desk web — Curve editor (ui/CurvePanel.kt) and Crop tab (ui/CropPanel.kt). */
'use strict';

function dragEnded() {
  S.dragging = false;
  if (lastFast && !inflight) requestRender(false);
}

// ================================================================== Curve
const CH_NAMES = ['Y', 'R', 'G', 'B'], CH_LABELS = ['Luma', 'Red', 'Green', 'Blue'];
const CH_COLORS = ['#F1F0EC', '#FF5A5A', '#4CD07D', '#5B9BFF'], CH_DARK = ['#3A3A3C', '#5A2224', '#1F4A2C', '#223A66'];
let graphEl = null, graphLabel = null, curveActive = -1;

function renderCurveScreen() {
  const app = appEl(), W0 = app.clientWidth, H0 = app.clientHeight, wide = W0 >= 600;
  const photoH = Math.max(150, H0 - 48 - H0 * PANEL_FRACTION - 54);
  const graphH = clamp(H0 - 48 - photoH - 52, 170, 420);
  const top = h('div', { class: 'row topbar', style: { padding: '0 4px' } },
    iconBtn('arrow_back', 'Back to Pro', () => closeCurve()),
    h('div', { class: 'grow', style: { fontSize: '17px', fontWeight: 600 } }, 'Curve'),
    iconBtn('undo', 'Undo', undo, { disabled: !S.undo.length && M.equals(S.params, S.committed) }),
    iconBtn('redo', 'Redo', redo, { disabled: !S.redo.length }),
    h('button', { class: 'btn primary', style: { height: '34px', padding: '0 16px', fontSize: '13px', marginRight: '8px' }, onclick: () => closeCurve() }, 'Done'));
  const scr = h('div', { class: 'screen' }, top);
  const controls = () => [editSection(), h('div', { style: { borderTop: '.5px solid ' + C.line } }), softClipSection()];
  if (wide) {
    scr.append(h('div', { class: 'row grow', style: { alignItems: 'stretch', minHeight: 0 } },
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { flex: '0.45', minHeight: 0, display: 'flex' } }, previewArea()),
        h('div', { style: { flex: '0.55', minHeight: 0, display: 'flex' } }, graph())),
      h('div', { class: 'scroll-y', 'data-keep': 'curvecontrols', style: { width: '340px', background: C.bg } }, controls(),
        h('div', { class: 'muted', style: { fontSize: '11px', padding: '14px' } }, 'Click the graph to add points · drag to move · double-click to delete'))));
  } else {
    scr.append(h('div', { style: { height: photoH + 'px', display: 'flex', flex: 'none' } }, previewArea()),
      h('div', { class: 'grow scroll-y', 'data-keep': 'curvecontrols', style: { background: C.bg } },
        h('div', { style: { height: graphH + 'px', display: 'flex' } }, graph()), controls(), h('div', { style: { height: '16px' } })));
  }
  return scr;
}

function graph() {
  graphEl = h('canvas', { 'aria-label': 'Tone curve', role: 'application' });
  graphLabel = h('div', { class: 'glabel' });
  const box = h('div', { class: 'graph grow' }, graphEl, graphLabel);
  // Tap adds a point, drag moves (or adds then moves), double-tap deletes — like CurveCanvas.
  let down = null, tapTimer = 0, lastTap = null, working = null;
  const pos = e => { const r = graphEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  graphEl.addEventListener('pointerdown', e => { down = Object.assign(pos(e), { id: e.pointerId, moved: false }); graphEl.setPointerCapture(e.pointerId); });
  graphEl.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== down.id) return;
    const p = pos(e);
    if (!down.moved) {
      if (Math.hypot(p.x - down.x, p.y - down.y) < 5) return;
      down.moved = true; S.dragging = true;
      working = M.curve(S.params, S.curveCh).slice();
      let i = nearestPt(working, down, down.w, down.h, 34);
      if (i < 0) { const ins = insertPt(working, down, down.w, down.h); if (ins) { working = ins[0]; i = ins[1]; } }
      curveActive = i;
    }
    const i = curveActive;
    if (i < 0) return;
    const n = working.length / 2, y = clamp(1 - p.y / p.h, 0, 1);
    const x = i === 0 ? 0 : i === n - 1 ? 1 : clamp(p.x / p.w, working[(i - 1) * 2] + 0.01, working[(i + 1) * 2] - 0.01);
    working[i * 2] = x; working[i * 2 + 1] = y;
    updateParams(M.withCurve(S.params, S.curveCh, working.slice()));
  });
  const up = e => {
    if (!down) return;
    const d = down; down = null;
    if (d.moved) { curveActive = -1; dragEnded(); commit(); refreshEditor(); return; }
    const now = Date.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(d.x - lastTap.x, d.y - lastTap.y) < 30) {
      clearTimeout(tapTimer); lastTap = null;
      const pts = M.curve(S.params, S.curveCh), i = nearestPt(pts, d, d.w, d.h, 30);
      if (i > 0 && i < pts.length / 2 - 1) { const l = pts.slice(); l.splice(i * 2, 2); change(M.withCurve(S.params, S.curveCh, l)); }
      return;
    }
    lastTap = { t: now, x: d.x, y: d.y };
    tapTimer = setTimeout(() => {
      const pts = M.curve(S.params, S.curveCh);
      if (nearestPt(pts, d, d.w, d.h, 30) < 0) { const ins = insertPt(pts, d, d.w, d.h); if (ins) change(M.withCurve(S.params, S.curveCh, ins[0])); }
    }, 300);
  };
  graphEl.addEventListener('pointerup', up);
  graphEl.addEventListener('pointercancel', () => { if (down && down.moved) { dragEnded(); commit(); refreshEditor(); } down = null; curveActive = -1; });
  new ResizeObserver(() => drawGraph()).observe(box);
  return box;
}
function nearestPt(pts, p, w, hh, radius) {
  let best = -1, bestD = radius;
  for (let i = 0; i < pts.length / 2; i++) { const d = Math.hypot(pts[i * 2] * w - p.x, (1 - pts[i * 2 + 1]) * hh - p.y); if (d <= bestD) { bestD = d; best = i; } }
  return best;
}
function insertPt(pts, p, w, hh) {
  const n = pts.length / 2;
  if (n >= M.MAX_CURVE_POINTS) return null;
  const x = clamp(p.x / w, 0.01, 0.99), y = clamp(1 - p.y / hh, 0, 1);
  let idx = n - 1;
  for (let i = 1; i < n; i++) if (x < pts[i * 2]) { idx = i; break; }
  if (x - pts[(idx - 1) * 2] < 0.02 || pts[idx * 2] - x < 0.02) return null;
  const l = pts.slice(); l.splice(idx * 2, 0, x, y);
  return [l, idx];
}
function drawGraph() {
  if (!S.curveMode || !graphEl || !graphEl.isConnected) return;
  const p = S.params, ch = S.curveCh;
  graphLabel.textContent = S.picker ? 'Tap the photo to see that colour on the curves' : ch === 0 && p.curveLinked ? 'Y · linked' : ch === 0 ? 'Y · brightness only' : CH_LABELS[ch];
  graphLabel.classList.toggle('amber', S.picker);
  const w = graphEl.clientWidth, hh = graphEl.clientHeight;
  if (!w || !hh) return;
  const g = dprCanvas(graphEl, w, hh);
  g.clearRect(0, 0, w, hh);
  for (let k = 1; k <= 7; k++) {
    g.strokeStyle = k % 2 === 0 ? '#2C2D31' : 'rgba(44,45,49,.5)'; g.lineWidth = 1; g.beginPath();
    g.moveTo(w * k / 8, 0); g.lineTo(w * k / 8, hh); g.moveTo(0, hh * k / 8); g.lineTo(w, hh * k / 8); g.stroke();
  }
  const hg = S.histogram;
  if (hg) [[hg.y, 'rgba(201,195,174,.40)'], [hg.r, 'rgba(224,57,60,.34)'], [hg.g, 'rgba(63,191,106,.26)'], [hg.b, 'rgba(63,111,224,.34)']].forEach(([bins, col]) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, hh);
    bins.forEach((v, i) => g.lineTo(w * (i + 0.5) / bins.length, hh - v * hh * 0.92));
    g.lineTo(w, hh); g.closePath(); g.fill();
  });
  g.setLineDash([8, 8]); g.strokeStyle = '#4A4C52'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, hh); g.lineTo(w, 0); g.stroke(); g.setLineDash([]);
  const luts = [0, 1, 2, 3].map(c => M.curveLut(M.curve(p, c), 160));
  [0, 1, 2, 3].filter(c => c !== ch).concat([ch]).forEach(c => {
    if (c !== ch && M.isIdentityCurve(M.curve(p, c))) return;
    const lut = luts[c];
    g.strokeStyle = CH_COLORS[c]; g.globalAlpha = c === ch ? 1 : 0.45; g.lineWidth = c === ch ? 2.5 : 1.5; g.beginPath();
    for (let k = 0; k < lut.length; k++) { const x = w * k / (lut.length - 1), y = hh * (1 - lut[k]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.globalAlpha = 1;
  });
  if (S.sample) {
    const s = S.sample, vals = [0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2], s[0], s[1], s[2]];
    for (let c = 0; c < 4; c++) {
      const v = clamp(vals[c], 0, 1), x = v * w, lut = luts[c], y = hh * (1 - lut[Math.round(v * (lut.length - 1))]);
      g.setLineDash([4, 4]); g.strokeStyle = CH_COLORS[c]; g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1; g.fillStyle = CH_COLORS[c]; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  }
  const pts = M.curve(p, ch);
  for (let i = 0; i < pts.length / 2; i++) {
    const x = pts[i * 2] * w, y = (1 - pts[i * 2 + 1]) * hh, r = i === curveActive ? 8 : 6;
    g.fillStyle = '#18191B'; g.beginPath(); g.arc(x, y, r + 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = i === curveActive ? C.amber : '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (i !== curveActive) { g.fillStyle = '#18191B'; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill(); }
  }
}
function chButton(i, selected, edited, label, onclick) {
  return h('button', { class: 'chbtn' + (edited ? ' edited' : ''), 'aria-label': label, 'aria-pressed': String(selected), onclick,
    style: { background: selected ? (i === 0 ? C.text : CH_COLORS[i]) : CH_DARK[i], color: selected ? C.bg : CH_COLORS[i], opacity: selected && i ? 0.92 : 1 } }, CH_NAMES[i]);
}
function linkButton(on, label, onToggle) {
  return h('button', { class: 'icon-btn sm', role: 'switch', 'aria-checked': String(on), 'aria-label': label, title: label, onclick: () => onToggle(!on), style: { color: on ? C.text : C.muted } }, icon(on ? 'link' : 'link_off', 20));
}
function editSection() {
  const p = S.params, ch = S.curveCh, pts = M.curve(p, ch);
  const more = iconBtn('more_vert', 'Curve options', () => popupMenu(more, [
    ...[0, 1, 2, 3].filter(t => t !== ch).map(t => ({ label: 'Copy ' + CH_LABELS[ch] + ' to ' + CH_LABELS[t], onclick: () => change(M.withCurve(S.params, t, pts.slice())) })),
    { label: 'Copy ' + CH_LABELS[ch] + ' to all', onclick: () => { let np = S.params; for (let t = 0; t < 4; t++) np = M.withCurve(np, t, pts.slice()); change(np); } },
    { label: 'Reset ' + CH_LABELS[ch] + ' curve', onclick: () => change(M.withCurve(S.params, ch, [0, 0, 1, 1])) },
    { label: 'Reset all curves & soft clip', onclick: () => change(M.resetCurves(S.params)) },
  ]), { sm: true, color: C.muted });
  return h('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px' } },
    h('div', { class: 'row' }, h('div', { class: 'grow', style: { fontSize: '14px', fontWeight: 600 } }, 'Edit'),
      iconBtn('colorize', 'Pick a colour from the photo', togglePicker, { sm: true, color: S.picker ? C.amber : C.muted }),
      more,
      linkButton(p.curveLinked, p.curveLinked ? 'Curves linked' : 'Curves unlinked', on => change(M.copy(S.params, { curveLinked: on }))),
      CH_NAMES.map((_, i) => chButton(i, ch === i, !M.isIdentityCurve(M.curve(p, i)) || p.curveMix[i] !== 100, CH_LABELS[i] + ' curve', () => {
        S.curveCh = i;
        if (i !== 0 && S.params.curveLinked) change(M.copy(S.params, { curveLinked: false })); else refreshEditor();
      }))),
    [0, 1, 2, 3].map(i => valueSliderRow(null, CH_COLORS[i], () => S.params.curveMix[i], 0, 100, 100, CH_LABELS[i] + ' intensity',
      v => updateParams(M.withMix(S.params, i, v)), v => change(M.withMix(S.params, i, v)))));
}
function softClipSection() {
  const p = S.params, sc = S.softCh, ch = p.softLink ? 0 : sc;
  return h('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '2px' } },
    h('div', { class: 'row' }, h('div', { class: 'grow', style: { fontSize: '14px', fontWeight: 600 } }, 'Soft Clip'),
      linkButton(p.softLink, p.softLink ? 'Soft clip linked' : 'Soft clip per channel', on => change(M.withSoftLink(S.params, on, sc))),
      [1, 2, 3].map(i => {
        const c = i - 1, edited = !p.softLink && [0, 1, 2, 3].some(k => M.softValue(p, c, k) !== (k === 1 ? 100 : 0));
        return chButton(i, p.softLink || sc === c, edited, CH_LABELS[i] + ' soft clip', () => {
          S.softCh = c;
          if (S.params.softLink) change(M.withSoftLink(S.params, false)); else refreshEditor();
        });
      })),
    [[0, 'Low'], [2, 'Low Soft'], [1, 'High'], [3, 'High Soft']].map(([kind, label]) =>
      valueSliderRow(label, '#BDBDBA', () => M.softValue(S.params, ch, kind), 0, 100, kind === 1 ? 100 : 0, 'Soft clip ' + label,
        v => updateParams(M.withSoft(S.params, ch, kind, v)), v => change(M.withSoft(S.params, ch, kind, v)))),
    h('div', { class: 'muted', style: { fontSize: '11px', lineHeight: '15px', paddingTop: '4px' } },
      p.softLink ? 'Low / High set the darkest black and brightest white; the Soft controls roll off crushed shadows and blown highlights.'
        : 'Editing ' + CH_LABELS[sc + 1] + ' only. Tap the link to set all channels together.'));
}
/** Resolve-style row: optional label, thin coloured slider, and a number box you can type in. */
function valueSliderRow(label, color, getV, min, max, def, desc, onChange, onSet) {
  const cv = h('canvas', { tabindex: 0, role: 'slider', 'aria-label': desc, 'aria-valuemin': min, 'aria-valuemax': max });
  const box = h('input', { class: 'numbox', inputmode: 'numeric', 'aria-label': desc + ' value' });
  const draw = () => {
    const v = getV(), w = cv.clientWidth || 200, hh = 32, pad = 9, cy = hh / 2, x = pad + (v - min) / (max - min) * (w - 2 * pad);
    const g = dprCanvas(cv, w, hh); g.clearRect(0, 0, w, hh);
    g.lineWidth = 1.5; g.strokeStyle = color; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(pad, cy); g.lineTo(w - pad, cy); g.stroke();
    g.globalAlpha = 1; g.beginPath(); g.moveTo(pad, cy); g.lineTo(x, cy); g.stroke();
    g.fillStyle = color; g.beginPath(); g.arc(x, cy, 7, 0, Math.PI * 2); g.fill();
    cv.setAttribute('aria-valuenow', v);
    if (document.activeElement !== box) box.value = v;
    box.classList.toggle('changed', v !== def);
  };
  let st = null;
  cv.addEventListener('pointerdown', e => { st = { x: e.clientX, y: e.clientY, v: getV(), id: e.pointerId, drag: false }; });
  cv.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.drag) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { st.drag = true; S.dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } }
      else if (Math.abs(dy) > 10) { st = null; return; } else return;
    }
    const v = clamp(Math.round(st.v + dx / Math.max(1, cv.clientWidth - 18) * (max - min)), min, max);
    if (v !== getV()) { onChange(v); draw(); }
  });
  let tapTimer = 0, lastTap = 0;
  const end = e => {
    if (st && st.drag) { st = null; dragEnded(); commit(); refreshEditor(); return; }
    if (!st || e.type !== 'pointerup') { st = null; return; }
    st = null;
    const now = Date.now(), r = cv.getBoundingClientRect(), x = e.clientX;
    clearTimeout(tapTimer);
    if (now - lastTap < 300) { lastTap = 0; onSet(def); return; }
    lastTap = now;
    tapTimer = setTimeout(() => onSet(clamp(Math.round(min + clamp((x - r.left - 9) / Math.max(1, r.width - 18), 0, 1) * (max - min)), min, max)), 260);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('keydown', e => { const k = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0; if (k) { e.preventDefault(); onSet(clamp(getV() + k, min, max)); } });
  const apply = () => { const v = parseInt(box.value, 10); if (isNaN(v)) box.value = getV(); else if (clamp(v, min, max) !== getV()) onSet(clamp(v, min, max)); else box.value = getV(); };
  box.addEventListener('input', () => { box.value = box.value.replace(/\D/g, '').slice(0, 3); });
  box.addEventListener('keydown', e => { if (e.key === 'Enter') { apply(); box.blur(); } });
  box.addEventListener('blur', apply);
  live(draw); requestAnimationFrame(draw); new ResizeObserver(draw).observe(cv);
  return h('div', { class: 'thin' }, label ? h('div', { class: 'lbl' }, label) : null, cv, box);
}

// ================================================================== Crop
let cropZoom = { z: 1, x: 0, y: 0, key: null }, cropStage = null, cropBadgeEl = null;
function cropReady() {
  const f = S.previewFor, p = S.params;
  return !!(S.previewImg && S.previewCrop && f && f.rotation === p.rotation && f.flipH === p.flipH);
}
function cropView() {
  if (!EL.cropPhoto) { EL.cropPhoto = h('canvas', { class: 'photo', 'aria-label': 'Photo', role: 'img' }); EL.cropOverlay = h('canvas', { class: 'overlay', 'aria-label': 'Crop frame', role: 'application' }); bindCropOverlay(EL.cropOverlay); }
  const key = S.currentId + '|' + S.params.rotation + '|' + S.params.flipH + '|' + S.cropResets;
  if (cropZoom.key !== key) cropZoom = { z: 1, x: 0, y: 0, key };
  cropStage = h('div', { class: 'stage' }, h('div', { class: 'clip' }, EL.cropPhoto), EL.cropOverlay);
  cropBadgeEl = h('div', { class: 'top-badge badge' });
  const g = M.CROP_GUIDES.find(x => x.id === S.cropGuide);
  const view = h('div', { class: 'cropview' }, cropStage, cropBadgeEl,
    !cropReady() ? h('div', { class: 'spinner', style: { position: 'absolute' } }) : null,
    g.turns > 1 ? h('div', { class: 'bl-badge badge' }, S.cropGuide.toUpperCase() + ' · TAP AGAIN TO TURN') : null);
  // Pinch / wheel zoom (1×–4×) and moving a zoomed view.
  const pts = new Map(); let pinch = null;
  view.addEventListener('wheel', e => { e.preventDefault(); applyZoom(Math.exp(-e.deltaY * 0.0015), 0, 0, view); }, { passive: false });
  view.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; cropDrag = null; } });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      applyZoom(d / pinch.d, cx - pinch.cx, cy - pinch.cy, view); pinch = { d, cx, cy };
    } else if (pts.size === 1 && !cropDrag && cropZoom.z > 1.001) applyZoom(1, e.clientX - prev.x, e.clientY - prev.y, view);
  });
  const lift = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  view.addEventListener('pointerup', lift); view.addEventListener('pointercancel', lift);
  new ResizeObserver(() => layoutCrop(view)).observe(view);
  return view;
}
function applyZoom(dz, dx, dy, view) {
  const z = clamp(cropZoom.z * dz, 1, 4), mx = view.clientWidth * (z - 1) / 2, my = view.clientHeight * (z - 1) / 2;
  cropZoom.z = z;
  cropZoom.x = z <= 1.001 ? 0 : clamp(cropZoom.x + dx, -mx, mx); cropZoom.y = z <= 1.001 ? 0 : clamp(cropZoom.y + dy, -my, my);
  if (cropStage) cropStage.style.transform = 'translate(' + cropZoom.x + 'px,' + cropZoom.y + 'px) scale(' + cropZoom.z + ')';
}
function layoutCrop(view) {
  if (!cropStage || !S.previewImg || !S.previewCrop) return;
  const iw = S.previewImg.w, ih = S.previewImg.h, aw = view.clientWidth - 44, ah = view.clientHeight - 44;
  if (aw <= 0 || ah <= 0) return;
  const fit = Math.min(aw / iw, ah / ih);
  cropStage.style.width = iw * fit + 'px'; cropStage.style.height = ih * fit + 'px';
  cropStage.style.transform = 'translate(' + cropZoom.x + 'px,' + cropZoom.y + 'px) scale(' + cropZoom.z + ')';
  drawCrop();
}
function drawCropPhoto() {
  if (!EL.cropPhoto || !S.previewImg) return;
  imgToCanvas({ w: S.previewImg.w, h: S.previewImg.h, buf: S.previewImg.buf }, EL.cropPhoto);
  const sp = document.querySelector('.cropview > .spinner');
  if (sp && cropReady()) sp.remove();
  const v = document.querySelector('.cropview'); if (v) layoutCrop(v);
  updateBusy();
}
function cropDims() { return S.previewImg && S.previewCrop ? [S.previewImg.w, S.previewImg.h] : null; }
function signedDeg(v) { const t = Math.abs(v).toFixed(1) + '°'; return v > 0.05 ? '+' + t : v < -0.05 ? '−' + t : '0.0°'; }
function cropBadgeText() {
  const p = S.params, d = cropDims();
  if (S.straightening) return signedDeg(p.straighten) + ' · STRAIGHTEN';
  if (!d) return '';
  const r = M.cropRect(p, d[0], d[1]), k = S.fullW ? Math.max(S.fullW, S.fullH) / Math.max(d[0], d[1]) : 1;
  const name = p.aspect === M.ASPECT_FREE ? 'FREE' : M.ratioLabel(p.aspect, p.aspectFlip).toUpperCase().replace(':', ' : ');
  return name + ' · ' + Math.round((r[2] - r[0]) * d[0] * k) + ' × ' + Math.round((r[3] - r[1]) * d[1] * k);
}
function drawCrop() {
  if (S.screen !== 'editor' || S.tab !== 'Crop' || S.curveMode || !EL.cropOverlay || !EL.cropOverlay.isConnected) return;
  const d = cropDims(), p = S.params;
  if (cropBadgeEl) cropBadgeEl.textContent = cropBadgeText();
  if (!d || !cropReady()) return;
  const s = M.straightenScale(p.straighten, d[0], d[1]);
  EL.cropPhoto.style.transform = 'rotate(' + p.straighten + 'deg) scale(' + s + ')';
  const cv = EL.cropOverlay, w = cv.clientWidth, hh = cv.clientHeight;
  if (!w || !hh) return;
  const g = dprCanvas(cv, w, hh);
  g.clearRect(0, 0, w, hh);
  const r = M.cropRect(p, d[0], d[1]), box = { l: r[0] * w, t: r[1] * hh, r: r[2] * w, b: r[3] * hh };
  box.w = box.r - box.l; box.h = box.b - box.t;
  g.fillStyle = 'rgba(0,0,0,.65)'; g.beginPath(); g.rect(0, 0, w, hh); g.rect(box.l, box.t, box.w, box.h); g.fill('evenodd');
  if (S.straightening || (S.cropHandle && S.cropGuide === 'Off')) drawGuide(g, 'Grid', 0, box, 'rgba(255,255,255,.7)', 0.8);
  drawGuide(g, S.cropGuide, S.guideTurn, box, 'rgba(255,255,255,.75)', 1);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1; g.strokeRect(box.l, box.t, box.w, box.h);
  drawHandles(g, box, S.cropHandle);
}
function drawHandles(g, b, active) {
  const len = 18, sw = 3.5, col = id => active === id ? C.amber : '#fff';
  g.lineWidth = sw; g.lineCap = 'square';
  const corner = (x, y, sx, sy, id) => { g.strokeStyle = col(id); g.beginPath(); g.moveTo(x + sx * len, y); g.lineTo(x, y); g.lineTo(x, y + sy * len); g.stroke(); };
  corner(b.l, b.t, 1, 1, 'TL'); corner(b.r, b.t, -1, 1, 'TR'); corner(b.l, b.b, 1, -1, 'BL'); corner(b.r, b.b, -1, -1, 'BR');
  g.lineCap = 'round';
  const e = 12, cx = b.l + b.w / 2, cy = b.t + b.h / 2, line = (x1, y1, x2, y2, id) => { g.strokeStyle = col(id); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  if (b.w > 4 * len) { line(cx - e, b.t, cx + e, b.t, 'T'); line(cx - e, b.b, cx + e, b.b, 'B'); }
  if (b.h > 4 * len) { line(b.l, cy - e, b.l, cy + e, 'L'); line(b.r, cy - e, b.r, cy + e, 'R'); }
}
/** Composition guides (never saved into the photo). turn mirrors the spiral (4 ways) or triangle (2 ways). */
function drawGuide(g, id, turn, b, c, sw) {
  if (id === 'Off' || b.w < 2 || b.h < 2) return;
  g.save(); g.beginPath(); g.rect(b.l, b.t, b.w, b.h); g.clip();
  g.strokeStyle = c; g.lineWidth = sw; g.lineCap = 'butt';
  const line = (x1, y1, x2, y2, alpha) => { g.globalAlpha = alpha || 1; g.beginPath(); g.moveTo(b.l + x1 * b.w, b.t + y1 * b.h); g.lineTo(b.l + x2 * b.w, b.t + y2 * b.h); g.stroke(); g.globalAlpha = 1; };
  const mirror = (mx, my) => { if (mx || my) { const cx = b.l + b.w / 2, cy = b.t + b.h / 2; g.translate(cx, cy); g.scale(mx ? -1 : 1, my ? -1 : 1); g.translate(-cx, -cy); } };
  switch (id) {
    case 'Thirds': { const t = 1 / 3; line(t, 0, t, 1); line(2 * t, 0, 2 * t, 1); line(0, t, 1, t); line(0, 2 * t, 1, 2 * t); break; }
    case 'Golden': { const q = 0.382; line(q, 0, q, 1); line(1 - q, 0, 1 - q, 1); line(0, q, 1, q); line(0, 1 - q, 1, 1 - q); break; }
    case 'Grid': g.lineWidth = sw * 0.8; for (let i = 1; i <= 5; i++) { const f = i / 6; line(f, 0, f, 1, 0.6); line(0, f, 1, f, 0.6); } break;
    case 'Diagonal': line(0, 0, 1, 1); line(1, 0, 0, 1); if (b.w > b.h) { const k = b.h / b.w; line(0, 0, k, 1, 0.5); line(1, 0, 1 - k, 1, 0.5); } break;
    case 'Center': line(0.5, 0, 0.5, 1, 0.55); line(0, 0.5, 1, 0.5, 0.55); g.beginPath(); g.arc(b.l + b.w / 2, b.t + b.h / 2, Math.min(b.w, b.h) * 0.08, 0, Math.PI * 2); g.stroke(); break;
    case 'Triangle': {
      mirror(turn % 2 === 1, false);
      const a = [b.l, b.b], dd = [b.r, b.t], dir = [dd[0] - a[0], dd[1] - a[1]], len2 = dir[0] * dir[0] + dir[1] * dir[1];
      const foot = p => { const t = ((p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1]) / len2; return [a[0] + t * dir[0], a[1] + t * dir[1]]; };
      const seg = (p1, p2) => { g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke(); };
      seg(a, dd); seg([b.l, b.t], foot([b.l, b.t])); seg([b.r, b.b], foot([b.r, b.b]));
      break;
    }
    case 'Spiral': mirror(turn === 1 || turn === 2, turn >= 2); goldenSpiral(g, b, sw); break;
  }
  g.restore();
}
function goldenSpiral(g, b, sw) {
  let x = b.l, y = b.t, w = b.w, hh = b.h;
  const gr = 0.618, start = hh > w ? 1 : 0;
  for (let i = 0; i < 9; i++) {
    let pX, pY, pW, pH, cx, cy, angle;
    switch ((i + start) % 4) {
      case 0: pW = w * gr; pH = hh; pX = x; pY = y; cx = pX + pW; cy = pY + pH; angle = 180; x += pW; w -= pW; break;
      case 1: pW = w; pH = hh * gr; pX = x; pY = y; cx = pX; cy = pY + pH; angle = 270; y += pH; hh -= pH; break;
      case 2: pW = w * gr; pH = hh; pX = x + w - pW; pY = y; cx = pX; cy = pY; angle = 0; w -= pW; break;
      default: pW = w; pH = hh * gr; pX = x; pY = y + hh - pH; cx = pX + pW; cy = pY; angle = 90; hh -= pH;
    }
    if (pW < 1 || pH < 1) break;
    g.globalAlpha = 0.35; g.lineWidth = sw * 0.7; g.strokeRect(pX, pY, pW, pH);
    g.globalAlpha = 1; g.lineWidth = sw * 1.3; g.beginPath();
    g.ellipse(cx, cy, pW, pH, 0, angle * Math.PI / 180, (angle + 90) * Math.PI / 180); g.stroke();
  }
}
let cropDrag = null;
function hitHandle(r, pos, w, hh, hit) {
  const l = r[0] * w, t = r[1] * hh, rr = r[2] * w, b = r[3] * hh, near = (x, y) => Math.hypot(pos.x - x, pos.y - y) <= hit;
  if (near(l, t)) return 'TL'; if (near(rr, t)) return 'TR'; if (near(l, b)) return 'BL'; if (near(rr, b)) return 'BR';
  const inX = pos.x >= l && pos.x <= rr, inY = pos.y >= t && pos.y <= b;
  if (inY && Math.abs(pos.x - l) <= hit) return 'L'; if (inY && Math.abs(pos.x - rr) <= hit) return 'R';
  if (inX && Math.abs(pos.y - t) <= hit) return 'T'; if (inX && Math.abs(pos.y - b) <= hit) return 'B';
  return inX && inY ? 'Move' : null;
}
function bindCropOverlay(cv) {
  // Coordinates are in the stage's own (unzoomed) pixels.
  const local = e => { const r = cv.getBoundingClientRect(), k = r.width / cv.clientWidth; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
  cv.addEventListener('pointerdown', e => {
    const d = cropDims(); if (!d || !cropReady()) return;
    const w = cv.clientWidth, hh = cv.clientHeight, pos = local(e), r0 = M.cropRect(S.params, d[0], d[1]);
    const zoomK = cv.getBoundingClientRect().width / w;
    const handle = hitHandle(r0, pos, w, hh, 30 / zoomK);
    if (!handle) return;
    const lock = M.lockRatio(S.params, d[0], d[1]);
    cropDrag = { id: e.pointerId, pos, r0, handle, rf: lock == null ? null : lock * d[1] / d[0], minW: 48 / w, minH: 48 / hh, w, hh, dragging: false };
  });
  cv.addEventListener('pointermove', e => {
    const cd = cropDrag;
    if (!cd || e.pointerId !== cd.id) return;
    const p = local(e), dx = p.x - cd.pos.x, dy = p.y - cd.pos.y;
    if (!cd.dragging) {
      if (Math.hypot(dx, dy) < 6) return;
      cd.dragging = true; S.dragging = true; S.cropHandle = cd.handle;
      try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    }
    e.stopPropagation();
    updateParams(M.withCropRect(S.params, M.dragCrop(cd.r0, cd.handle, dx / cd.w, dy / cd.hh, cd.rf, cd.minW, cd.minH)));
    drawCrop();
  });
  const end = () => {
    const cd = cropDrag; cropDrag = null;
    S.cropHandle = null;
    if (cd && cd.dragging) { dragEnded(); commit(); refreshEditor(); } else drawCrop();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function cropTools() {
  const p = S.params;
  const deg = h('button', { class: 'mono', style: { fontSize: '12px', padding: '2px 6px', borderRadius: '6px', color: Math.abs(p.straighten) > 0.05 ? C.amber : C.muted }, 'aria-label': 'Reset straighten', onclick: () => change(M.copy(S.params, { straighten: 0 })) }, signedDeg(p.straighten));
  live(() => { deg.textContent = signedDeg(S.params.straighten); deg.style.color = Math.abs(S.params.straighten) > 0.05 ? C.amber : C.muted; });
  const tool = (ic, label, onclick, on) => h('button', { class: on ? 'on' : '', onclick, 'aria-label': label }, icon(ic), label);
  return h('div', { style: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('div', null, h('div', { class: 'row', style: { padding: '0 4px' } }, h('span', { class: 'muted grow', style: { fontSize: '12px' } }, 'Straighten'), deg), straightenRuler()),
    h('div', { class: 'scroll-x', 'data-keep': 'ratios' }, h('div', { class: 'row', style: { gap: '4px' } }, M.CROP_RATIO_ORDER.map(i => {
      const sel = p.aspect === i;
      return h('button', { class: 'pill' + (sel ? ' on' : ''), onclick: () => setCropRatio(i), 'aria-pressed': String(sel) }, M.ratioLabel(i, sel && p.aspectFlip));
    }))),
    h('div', { class: 'scroll-x', 'data-keep': 'guides' }, h('div', { class: 'guides' }, M.CROP_GUIDES.map(gd => {
      const on = S.cropGuide === gd.id, cv = h('canvas');
      requestAnimationFrame(() => {
        const g = dprCanvas(cv, 38, 28);
        g.fillStyle = on ? '#2A2B2F' : C.surface; g.fillRect(0, 0, 38, 28);
        g.strokeStyle = on ? C.text : C.line; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 37, 27);
        drawGuide(g, gd.id, on ? S.guideTurn : 0, { l: 1, t: 1, w: 36, h: 26, r: 37, b: 27 }, on ? C.text : C.muted, 1);
        if (gd.id === 'Off') { g.strokeStyle = C.muted; g.beginPath(); g.moveTo(10, 20); g.lineTo(28, 8); g.stroke(); }
      });
      return h('button', { class: 'guide' + (on ? ' on' : ''), onclick: () => pickGuide(gd.id), 'aria-pressed': String(on), 'aria-label': gd.id + ' guide' }, cv, h('span', null, gd.id));
    }))),
    h('div', { class: 'tools5' },
      tool('rotate_left', 'Left', () => rotateCrop(false)), tool('rotate_right', 'Right', () => rotateCrop(true)),
      tool('flip', 'Flip', flipCrop, p.flipH), tool('swap_horiz', 'W/H', swapCropRatio), tool('restart_alt', 'Reset', resetCrop)));
}
/** Ruler from −45° to +45°: drag sideways; double-click to level. */
function straightenRuler() {
  const cv = h('canvas', { class: 'ruler', tabindex: 0, role: 'slider', 'aria-label': 'Straighten', 'aria-valuemin': -45, 'aria-valuemax': 45 });
  const PX = 7;
  const draw = () => {
    const w = cv.clientWidth || 300, g = dprCanvas(cv, w, 40), v = S.params.straighten, mid = w / 2;
    g.clearRect(0, 0, w, 40);
    for (let i = -45; i <= 45; i++) {
      const x = mid + (i - v) * PX;
      if (x < 0 || x > w) continue;
      const big = i % 5 === 0;
      g.strokeStyle = i === 0 ? C.text : '#6B6B67'; g.lineWidth = big ? 1.5 : 1;
      g.beginPath(); g.moveTo(x, big ? 6 : 12); g.lineTo(x, 24); g.stroke();
    }
    g.strokeStyle = C.amber; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(mid, 0); g.lineTo(mid, 28); g.stroke(); g.lineCap = 'butt';
    cv.setAttribute('aria-valuenow', v);
  };
  let st = null;
  cv.addEventListener('pointerdown', e => { st = { x: e.clientX, y: e.clientY, raw: S.params.straighten, drag: false, id: e.pointerId }; });
  cv.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    if (!st.drag) {
      if (Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(e.clientY - st.y)) { st.drag = true; S.dragging = true; S.straightening = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } }
      else return;
    }
    const raw = clamp(st.raw - dx / PX, -45, 45);
    const v = Math.abs(raw) < 0.4 ? 0 : Math.round(raw * 10) / 10;
    updateParams(M.copy(S.params, { straighten: v }));
    draw(); drawCrop();
  });
  const end = () => { if (st && st.drag) { S.straightening = false; dragEnded(); commit(); refreshEditor(); } st = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('dblclick', () => change(M.copy(S.params, { straighten: 0 })));
  cv.addEventListener('keydown', e => { const k = e.key === 'ArrowLeft' ? 0.1 : e.key === 'ArrowRight' ? -0.1 : 0; if (k) { e.preventDefault(); change(M.copy(S.params, { straighten: clamp(Math.round((S.params.straighten + k) * 10) / 10, -45, 45) })); } });
  live(draw); requestAnimationFrame(draw); new ResizeObserver(draw).observe(cv);
  return cv;
}
