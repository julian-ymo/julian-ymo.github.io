/* Lumora Film web — model (ported from the Android app's model/*.kt). Shared by the page and the render workers. */
'use strict';
(function (G) {
  const M = {};

  // ------------------------------------------------------------------ film simulations
  const BW = [0.30, 0.59, 0.11], BW_YE = [0.38, 0.56, 0.06], BW_R = [0.60, 0.35, 0.05], BW_G = [0.22, 0.70, 0.08];
  const band = (center, width, shift = 0, sat = 1, lum = 0) => ({ center, width, shift, sat, lum });
  const sim = (name, short, description, o) => Object.assign({
    name, short, description, shadowTone: 0, highlightTone: 0, saturation: 1, midSat: 0, bands: [],
    shadowTint: [0, 0], highlightTint: [0, 0], mono: null, sepia: false, swatch: '#7FA9D6',
  }, o);

  // OKLab hue guide: red ≈ 25°, orange/skin ≈ 55°, yellow ≈ 100°, green ≈ 140°, cyan ≈ 200°, blue ≈ 265°, purple ≈ 305°.
  M.FILM_SIMS = [
    sim('Provia / Standard', 'Provia', 'Natural, all-round colour', { shadowTone: 0.10, highlightTone: 0.08, saturation: 1.04, swatch: '#7FA9D6' }),
    sim('Velvia / Vivid', 'Velvia', 'Saturated, punchy landscapes', { shadowTone: 0.28, highlightTone: 0.12, saturation: 1.30,
      bands: [band(25, 40, -6, 1.10, -0.01), band(140, 45, 0, 1.15, -0.01), band(265, 45, -4, 1.18, -0.035), band(305, 40, 0, 1.2)], swatch: '#4C8FE0' }),
    sim('Astia / Soft', 'Astia', 'Soft contrast, gentle skin tones', { shadowTone: 0, highlightTone: -0.06, saturation: 1.10,
      bands: [band(55, 30, 0, 0.88, 0.015), band(265, 45, 0, 1.05, 0.02)], swatch: '#9DBBDD' }),
    sim('Classic Chrome', 'Classic Chrome', 'Muted colour, firm shadows — documentary look', { shadowTone: 0.32, highlightTone: -0.06, saturation: 0.74,
      bands: [band(265, 50, -14, 0.80), band(140, 45, -8, 0.72, -0.01), band(25, 35, 6, 0.85), band(305, 40, -10, 0.6)],
      shadowTint: [-0.006, -0.008], highlightTint: [0.004, 0.008], swatch: '#8AA0AE' }),
    sim('Reala Ace', 'Reala Ace', 'True-to-life colour with crisp tone', { shadowTone: 0.22, highlightTone: 0.18, saturation: 1.02, swatch: '#85ABD0' }),
    sim('Pro Neg. Hi', 'Pro Neg Hi', 'Portrait negative, a little more contrast', { shadowTone: 0.14, highlightTone: 0.04, saturation: 0.92,
      bands: [band(55, 30, 0, 0.95, 0.01)], swatch: '#8EAAC6' }),
    sim('Pro Neg. Std', 'Pro Neg Std', 'Portrait negative, flat and soft', { shadowTone: -0.06, highlightTone: -0.10, saturation: 0.84,
      bands: [band(55, 30, 0, 0.92, 0.012)], swatch: '#9AB0C4' }),
    sim('Classic Neg.', 'Classic Neg', 'Hard tone, teal skies, cyan shadows', { shadowTone: 0.38, highlightTone: 0.30, saturation: 0.86, midSat: 0.30,
      bands: [band(265, 55, -28, 0.85), band(200, 40, -6, 0.9), band(140, 45, 10, 0.78, -0.015), band(100, 30, -10, 0.9), band(25, 35, -4, 1.0, -0.01)],
      shadowTint: [-0.014, -0.012], highlightTint: [0.004, 0.010], swatch: '#7FA2A8' }),
    sim('Nostalgic Neg.', 'Nostalgic Neg', 'Amber highlights, rich shadows', { shadowTone: 0.18, highlightTone: -0.08, saturation: 0.90,
      bands: [band(140, 45, -14, 0.85), band(265, 45, 0, 0.78)], shadowTint: [0.004, 0.006], highlightTint: [0.008, 0.028], swatch: '#A9B6B8' }),
    sim('Eterna / Cinema', 'Eterna', 'Cinematic: low saturation, soft shadows', { shadowTone: -0.16, highlightTone: -0.18, saturation: 0.60,
      bands: [band(55, 30, 0, 1.1)], shadowTint: [-0.010, -0.010], highlightTint: [0.002, 0.006], swatch: '#8FA3A8' }),
    sim('Eterna Bleach Bypass', 'Bleach Bypass', 'Desaturated with high contrast', { shadowTone: 0.42, highlightTone: 0.30, saturation: 0.40, swatch: '#A7B1B4' }),
    sim('Acros', 'Acros', 'Fine-grain B&W with deep tones', { shadowTone: 0.22, highlightTone: 0.14, saturation: 0, mono: BW, swatch: '#B8B8B8' }),
    sim('Acros + Ye Filter', 'Acros+Ye', 'B&W, yellow filter — slightly darker sky', { shadowTone: 0.24, highlightTone: 0.16, saturation: 0, mono: BW_YE, swatch: '#9A9A9A' }),
    sim('Acros + R Filter', 'Acros+R', 'B&W, red filter — dramatic skies', { shadowTone: 0.28, highlightTone: 0.20, saturation: 0, mono: BW_R, swatch: '#6A6A6A' }),
    sim('Acros + G Filter', 'Acros+G', 'B&W, green filter — lighter foliage and skin', { shadowTone: 0.22, highlightTone: 0.14, saturation: 0, mono: BW_G, swatch: '#A8A8A8' }),
    sim('Monochrome', 'Mono', 'Standard B&W', { shadowTone: 0.06, highlightTone: 0.04, saturation: 0, mono: BW, swatch: '#ADADAD' }),
    sim('Monochrome + Ye', 'Mono+Ye', 'Standard B&W, yellow filter', { shadowTone: 0.08, highlightTone: 0.06, saturation: 0, mono: BW_YE, swatch: '#9E9E9E' }),
    sim('Monochrome + R', 'Mono+R', 'Standard B&W, red filter', { shadowTone: 0.12, highlightTone: 0.08, saturation: 0, mono: BW_R, swatch: '#707070' }),
    sim('Monochrome + G', 'Mono+G', 'Standard B&W, green filter', { shadowTone: 0.06, highlightTone: 0.04, saturation: 0, mono: BW_G, swatch: '#ABABAB' }),
    sim('Sepia', 'Sepia', 'Warm brown-toned B&W', { shadowTone: 0.04, highlightTone: 0.02, saturation: 0, mono: BW, sepia: true, swatch: '#C9B08A' }),
  ];
  M.SIM_CODES = ['PRO', 'VEL', 'AST', 'CC', 'RA', 'NH', 'NS', 'CN', 'NN', 'ET', 'BB', 'ACR', 'A+Y', 'A+R', 'A+G', 'MON', 'M+Y', 'M+R', 'M+G', 'SEP'];
  M.simCode = i => M.SIM_CODES[i] || ((M.FILM_SIMS[i] && M.FILM_SIMS[i].short.slice(0, 3).toUpperCase()) || '?');
  M.isMono = i => !!M.FILM_SIMS[i].mono;

  // ------------------------------------------------------------------ options
  M.GRAIN_OPTIONS = ['Off', 'Weak · Small', 'Weak · Large', 'Strong · Small', 'Strong · Large'];
  M.GRAIN_SHORT = ['OFF', 'WEAK·S', 'WEAK·L', 'STRONG·S', 'STRONG·L'];
  M.CHROME_OPTIONS = ['Off', 'Weak', 'Strong'];
  M.DR_OPTIONS = ['DR100', 'DR200', 'DR400'];
  M.DRP_OPTIONS = ['Off', 'Weak', 'Strong', 'Auto'];
  M.SKIN_OPTIONS = ['Off', 'Weak', 'Strong'];
  M.WB_PRESETS = [
    { label: 'As Shot', type: 'AS_SHOT', kelvin: 5500, green: 1 },
    { label: 'Auto', type: 'AUTO', kelvin: 5500, green: 1 },
    { label: 'Daylight', type: 'KELVIN', kelvin: 5500, green: 1 },
    { label: 'Shade', type: 'KELVIN', kelvin: 7200, green: 1 },
    { label: 'Fluorescent 1', type: 'KELVIN', kelvin: 6500, green: 0.97 },
    { label: 'Fluorescent 2', type: 'KELVIN', kelvin: 4500, green: 0.97 },
    { label: 'Fluorescent 3', type: 'KELVIN', kelvin: 4000, green: 0.97 },
    { label: 'Incandescent', type: 'KELVIN', kelvin: 3000, green: 1 },
    { label: 'Underwater', type: 'UNDERWATER', kelvin: 5500, green: 1 },
    { label: 'Kelvin', type: 'CUSTOM', kelvin: 5500, green: 1 },
  ];
  M.ASPECTS = [
    { label: 'Original', ratio: 0 }, { label: '1:1', ratio: 1 }, { label: '4:5', ratio: 4 / 5 }, { label: '3:2', ratio: 3 / 2 },
    { label: '2:3', ratio: 2 / 3 }, { label: '16:9', ratio: 16 / 9 }, { label: '9:16', ratio: 9 / 16 }, { label: '65:24', ratio: 65 / 24 },
    { label: 'Free', ratio: -1 },
  ];
  M.HSL_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
  M.HSL_SWATCHES = ['#E5484D', '#F08C3A', '#E9C43A', '#4CB467', '#3BB8C4', '#3E7BE0', '#8A5BD6', '#D14FA8'];
  M.GLOW_STYLES = ['Glow', 'Halation', 'Mist'];

  // ------------------------------------------------------------------ curves
  M.IDENTITY_CURVE = [0, 0, 1, 1];
  M.MAX_CURVE_POINTS = 12;
  M.isIdentityCurve = c => c.length === 4 && c[0] === 0 && c[1] === 0 && c[2] === 1 && c[3] === 1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  M.clamp = clamp;

  M.sanitizeCurve = function (raw) {
    if (!Array.isArray(raw) || raw.length < 4 || raw.length % 2) return M.IDENTITY_CURVE.slice();
    let pts = [];
    for (let i = 0; i < raw.length; i += 2) {
      const x = Number(raw[i]), y = Number(raw[i + 1]);
      pts.push([isNaN(x) ? 0 : clamp(x, 0, 1), isNaN(y) ? 0 : clamp(y, 0, 1)]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    pts = pts.slice(0, M.MAX_CURVE_POINTS);
    if (pts.length < 2) return M.IDENTITY_CURVE.slice();
    pts[0][0] = 0; pts[pts.length - 1][0] = 1;
    return pts.flat();
  };

  /** Monotone cubic (Fritsch–Carlson) lookup table. */
  M.curveLut = function (c, size = 1024) {
    const n = c.length / 2, xs = [], ys = [], out = new Float32Array(size);
    for (let i = 0; i < n; i++) { xs.push(c[i * 2]); ys.push(c[i * 2 + 1]); }
    if (n < 2) { for (let i = 0; i < size; i++) out[i] = i / (size - 1); return out; }
    const d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) { const dx = xs[i + 1] - xs[i]; d[i] = dx <= 1e-6 ? 0 : (ys[i + 1] - ys[i]) / dx; }
    const m = new Float64Array(n);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; } else {
        const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
      }
    }
    let seg = 0;
    for (let k = 0; k < size; k++) {
      const x = k / (size - 1);
      while (seg < n - 2 && x > xs[seg + 1]) seg++;
      const x0 = xs[seg], x1 = xs[seg + 1], h = x1 - x0;
      let y;
      if (h <= 1e-6) y = ys[seg + 1];
      else if (x <= x0) y = ys[seg];
      else if (x >= x1) y = ys[seg + 1];
      else {
        const t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
        y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
      }
      out[k] = clamp(y, 0, 1);
    }
    return out;
  };

  M.SOFT_LOW = 0; M.SOFT_HIGH = 1; M.SOFT_LS = 2; M.SOFT_HS = 3;
  M.SOFT_RGB_DEFAULT = Array.from({ length: 12 }, (_, i) => i % 4 === 1 ? 100 : 0);
  M.ASPECT_ORIGINAL = 0; M.ASPECT_FREE = 8;
  M.CROP_RATIO_ORDER = [8, 0, 1, 2, 3, 5, 6, 7];

  // ------------------------------------------------------------------ edit params
  const Z8 = () => [0, 0, 0, 0, 0, 0, 0, 0];
  M.defaults = () => ({
    sim: 0, simStrength: 1, exposureThirds: 0, grain: 0, colorChrome: 0, colorChromeBlue: 0,
    wb: 0, kelvin: 5500, wbShiftR: 0, wbShiftB: 0, dynamicRange: 0, dRangePriority: 0,
    highlight: 0, shadow: 0, color: 0, sharpness: 0, noiseReduction: 0, clarity: 0, monoWC: 0, monoMG: 0, smoothSkin: 0,
    contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temp: 0, tint: 0, vibrance: 0, saturation: 0,
    fade: 0, vignette: 0, glow: 0, glowStyle: 0, glowThreshold: 70, glowSize: 40, glowWarmth: 30,
    hslHue: Z8(), hslSat: Z8(), hslLum: Z8(),
    curveY: [0, 0, 1, 1], curveR: [0, 0, 1, 1], curveG: [0, 0, 1, 1], curveB: [0, 0, 1, 1],
    curveLinked: true, curveMix: [100, 100, 100, 100],
    softLow: 0, softHigh: 100, softLS: 0, softHS: 0, softLink: true, softRGB: M.SOFT_RGB_DEFAULT.slice(),
    aspect: M.ASPECT_FREE, aspectFlip: false, rotation: 0, flipH: false, straighten: 0,
    cropL: 0, cropT: 0, cropR: 1, cropB: 1,
  });
  const DEF = M.defaults();
  M.DEF = DEF;

  M.copy = (p, o) => Object.assign(JSON.parse(JSON.stringify(p)), o || {});
  M.equals = function eq(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => eq(v, b[i]));
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
  };
  M.isDefault = p => M.equals(p, DEF);

  const GEO = ['aspect', 'aspectFlip', 'rotation', 'flipH', 'straighten', 'cropL', 'cropT', 'cropR', 'cropB'];
  M.GEO_KEYS = GEO;
  M.withGeometryOf = (p, other) => { const q = M.copy(p); GEO.forEach(k => q[k] = other[k]); return q; };
  M.withoutGeometry = p => M.withGeometryOf(p, DEF);

  const PRO_KEYS = ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'vibrance', 'saturation', 'fade', 'vignette',
    'glow', 'glowStyle', 'glowThreshold', 'glowSize', 'glowWarmth', 'hslHue', 'hslSat', 'hslLum',
    'curveY', 'curveR', 'curveG', 'curveB', 'curveLinked', 'curveMix', 'softLow', 'softHigh', 'softLS', 'softHS', 'softLink', 'softRGB'];
  /** Resets only the Fujifilm Q-menu settings. */
  M.resetCamera = p => { const q = M.defaults(); PRO_KEYS.forEach(k => q[k] = JSON.parse(JSON.stringify(p[k]))); return M.withGeometryOf(q, p); };
  /** Resets only the Pro adjustments. */
  M.resetPro = p => { const q = M.copy(p); PRO_KEYS.forEach(k => q[k] = JSON.parse(JSON.stringify(DEF[k]))); return q; };

  M.toJson = p => Object.assign({ v: 1 }, JSON.parse(JSON.stringify(p)));

  M.fromJson = function (o) {
    o = o || {};
    const has = k => Object.prototype.hasOwnProperty.call(o, k);
    const i = (k, min, max, def = 0) => { const v = Math.trunc(Number(has(k) ? o[k] : def)); return isNaN(v) ? def : clamp(v, min, max); };
    const f = (k, min, max, def = 0) => { const v = Number(has(k) ? o[k] : def); return isNaN(v) ? def : clamp(v, min, max); };
    const b = (k, def) => typeof o[k] === 'boolean' ? o[k] : def;
    const curve = k => Array.isArray(o[k]) ? M.sanitizeCurve(o[k]) : M.IDENTITY_CURVE.slice();
    const list = k => Array.isArray(o[k]) ? Array.from({ length: 8 }, (_, j) => clamp(Math.trunc(Number(o[k][j]) || 0), -100, 100)) : Z8();
    const rot = (((Math.trunc((Number(o.rotation) || 0) / 90) * 90) % 360) + 360) % 360;
    return {
      sim: i('sim', 0, M.FILM_SIMS.length - 1), simStrength: f('simStrength', 0, 1, 1), exposureThirds: i('exposureThirds', -9, 9),
      grain: i('grain', 0, 4), colorChrome: i('colorChrome', 0, 2), colorChromeBlue: i('colorChromeBlue', 0, 2),
      wb: i('wb', 0, M.WB_PRESETS.length - 1), kelvin: i('kelvin', 2500, 10000, 5500), wbShiftR: i('wbShiftR', -9, 9), wbShiftB: i('wbShiftB', -9, 9),
      dynamicRange: i('dynamicRange', 0, 2), dRangePriority: i('dRangePriority', 0, 3),
      highlight: f('highlight', -2, 4), shadow: f('shadow', -2, 4), color: i('color', -4, 4), sharpness: i('sharpness', -4, 4),
      noiseReduction: i('noiseReduction', -4, 4), clarity: i('clarity', -5, 5), monoWC: i('monoWC', -9, 9), monoMG: i('monoMG', -9, 9),
      smoothSkin: i('smoothSkin', 0, 2),
      contrast: i('contrast', -100, 100), highlights: i('highlights', -100, 100), shadows: i('shadows', -100, 100),
      whites: i('whites', -100, 100), blacks: i('blacks', -100, 100), temp: i('temp', -100, 100), tint: i('tint', -100, 100),
      vibrance: i('vibrance', -100, 100), saturation: i('saturation', -100, 100), fade: i('fade', 0, 100), vignette: i('vignette', -100, 100),
      glow: i('glow', 0, 100), glowStyle: i('glowStyle', 0, 2), glowThreshold: i('glowThreshold', 0, 100, 70), glowSize: i('glowSize', 0, 100, 40),
      glowWarmth: i('glowWarmth', 0, 100, 30),
      hslHue: list('hslHue'), hslSat: list('hslSat'), hslLum: list('hslLum'),
      curveY: curve('curveY'), curveR: curve('curveR'), curveG: curve('curveG'), curveB: curve('curveB'),
      curveLinked: b('curveLinked', true),
      curveMix: Array.isArray(o.curveMix) ? [0, 1, 2, 3].map(j => clamp(Math.trunc(Number(o.curveMix[j] ?? 100)), 0, 100)) : [100, 100, 100, 100],
      softLow: i('softLow', 0, 100, 0), softHigh: i('softHigh', 0, 100, 100), softLS: i('softLS', 0, 100, 0), softHS: i('softHS', 0, 100, 0),
      softLink: b('softLink', true),
      softRGB: Array.isArray(o.softRGB) && o.softRGB.length === 12 ? o.softRGB.map((v, j) => clamp(Math.trunc(Number(v ?? M.SOFT_RGB_DEFAULT[j])), 0, 100)) : M.SOFT_RGB_DEFAULT.slice(),
      // Before free crop, aspect 0 ("Original") meant no crop: now that is Free.
      aspect: (!has('cropL') && (Number(o.aspect) || 0) === 0) ? M.ASPECT_FREE : i('aspect', 0, M.ASPECTS.length - 1, M.ASPECT_FREE),
      aspectFlip: b('aspectFlip', false), straighten: f('straighten', -45, 45),
      cropL: f('cropL', 0, 0.99), cropT: f('cropT', 0, 0.99), cropR: f('cropR', 0.01, 1, 1), cropB: f('cropB', 0.01, 1, 1),
      rotation: rot, flipH: b('flipH', false),
    };
  };

  /** Dynamic range / highlight / shadow actually used, after D-Range Priority. */
  M.effectiveTone = p => {
    switch (p.dRangePriority) {
      case 1: case 3: return { dr: Math.max(clamp(p.dynamicRange, 0, 2), 1), highlight: -1, shadow: -1 };
      case 2: return { dr: 2, highlight: -2, shadow: -2 };
      default: return { dr: clamp(p.dynamicRange, 0, 2), highlight: p.highlight, shadow: p.shadow };
    }
  };

  // ------------------------------------------------------------------ curve helpers
  const CK = ['curveY', 'curveR', 'curveG', 'curveB'];
  M.curve = (p, ch) => p[CK[ch]];
  M.withCurve = (p, ch, c) => M.copy(p, { [CK[ch]]: c });
  M.hasCurves = p => CK.some(k => !M.isIdentityCurve(p[k]));
  M.hasSoftClip = p => p.softLink ? (p.softLow !== 0 || p.softHigh !== 100 || p.softLS !== 0 || p.softHS !== 0) : !M.equals(p.softRGB, M.SOFT_RGB_DEFAULT);
  M.softValue = (p, ch, kind) => p.softLink ? [p.softLow, p.softHigh, p.softLS, p.softHS][kind] : (p.softRGB[ch * 4 + kind] ?? (kind === 1 ? 100 : 0));
  M.withSoft = (p, ch, kind, v) => {
    const lo = M.softValue(p, ch, 0), hi = M.softValue(p, ch, 1);
    const x = kind === 0 ? clamp(v, 0, hi - 1) : kind === 1 ? clamp(v, lo + 1, 100) : clamp(v, 0, 100);
    if (p.softLink) return M.copy(p, { [['softLow', 'softHigh', 'softLS', 'softHS'][kind]]: x });
    const rgb = p.softRGB.slice(); rgb[ch * 4 + kind] = x; return M.copy(p, { softRGB: rgb });
  };
  M.withSoftLink = (p, link, from = 0) => {
    if (link === p.softLink) return p;
    if (link) { const b = clamp(from, 0, 2) * 4; return M.copy(p, { softLink: true, softLow: p.softRGB[b], softHigh: p.softRGB[b + 1], softLS: p.softRGB[b + 2], softHS: p.softRGB[b + 3] }); }
    return M.copy(p, { softLink: false, softRGB: Array.from({ length: 12 }, (_, i) => M.softValue(p, 0, i % 4)) });
  };
  M.resetCurves = p => M.copy(p, {
    curveY: [0, 0, 1, 1], curveR: [0, 0, 1, 1], curveG: [0, 0, 1, 1], curveB: [0, 0, 1, 1], curveLinked: true, curveMix: [100, 100, 100, 100],
    softLow: 0, softHigh: 100, softLS: 0, softHS: 0, softLink: true, softRGB: M.SOFT_RGB_DEFAULT.slice(),
  });
  M.withMix = (p, ch, v) => { const m = p.curveMix.slice(); m[ch] = clamp(v, 0, 100); return M.copy(p, { curveMix: m }); };

  // ------------------------------------------------------------------ crop
  M.ratioLabel = (index, flipped) => {
    const label = M.ASPECTS[index].label;
    if (flipped && index === M.ASPECT_ORIGINAL) return label + ' ⟲';
    if (!flipped || index === M.ASPECT_FREE || index === 1) return label;
    const parts = label.split(':');
    return parts.length === 2 ? parts[1] + ':' + parts[0] : label;
  };
  M.lockRatio = (p, w, h) => {
    if (p.aspect === M.ASPECT_FREE) return null;
    const base = p.aspect === M.ASPECT_ORIGINAL ? w / h : M.ASPECTS[clamp(p.aspect, 0, M.ASPECTS.length - 1)].ratio;
    if (base <= 0) return null;
    return p.aspectFlip ? 1 / base : base;
  };
  M.hasCropRect = p => p.cropL > 0 || p.cropT > 0 || p.cropR < 1 || p.cropB < 1;
  M.centeredRect = (rf, cx = 0.5, cy = 0.5) => {
    let fw = Math.min(1, rf), fh = fw / rf;
    if (fh > 1) { fh = 1; fw = rf; }
    const l = clamp(cx - fw / 2, 0, 1 - fw), t = clamp(cy - fh / 2, 0, 1 - fh);
    return [l, t, l + fw, t + fh];
  };
  M.cropRect = (p, w, h) => {
    if (M.hasCropRect(p)) {
      const l = clamp(p.cropL, 0, 0.99), t = clamp(p.cropT, 0, 0.99);
      return [l, t, clamp(p.cropR, l + 0.01, 1), clamp(p.cropB, t + 0.01, 1)];
    }
    const r = M.lockRatio(p, w, h);
    return r == null ? [0, 0, 1, 1] : M.centeredRect(r * h / w);
  };
  M.withCropRect = (p, r) => M.copy(p, { cropL: r[0], cropT: r[1], cropR: r[2], cropB: r[3] });
  M.straightenScale = (deg, w, h) => {
    if (w <= 0 || h <= 0) return 1;
    const a = Math.abs(deg) * Math.PI / 180, long = Math.max(w, h) / Math.min(w, h);
    return Math.cos(a) + long * Math.sin(a);
  };
  M.cropBase = p => M.copy(p, { straighten: 0, cropL: 0, cropT: 0, cropR: 1, cropB: 1, aspect: M.ASPECT_FREE, aspectFlip: false });
  M.CROP_GUIDES = [
    { id: 'Off', turns: 1 }, { id: 'Thirds', turns: 1 }, { id: 'Golden', turns: 1 }, { id: 'Spiral', turns: 4 },
    { id: 'Diagonal', turns: 1 }, { id: 'Triangle', turns: 2 }, { id: 'Grid', turns: 1 }, { id: 'Center', turns: 1 },
  ];
  M.HANDLES = {
    TL: [1, 1, 0, 0], TR: [0, 1, 1, 0], BL: [1, 0, 0, 1], BR: [0, 0, 1, 1], L: [1, 0, 0, 0], T: [0, 1, 0, 0], R: [0, 0, 1, 0], B: [0, 0, 0, 1], Move: [0, 0, 0, 0],
  };
  M.dragCrop = function (r0, handle, dx, dy, rf, minW, minH) {
    const [l0, t0, rr0, b0] = r0;
    const [hl, ht, hr, hb] = M.HANDLES[handle];
    if (handle === 'Move') {
      const w = rr0 - l0, h = b0 - t0, l = clamp(l0 + dx, 0, 1 - w), t = clamp(t0 + dy, 0, 1 - h);
      return [l, t, l + w, t + h];
    }
    if (rf == null) {
      let l = l0, t = t0, r = rr0, b = b0;
      if (hl) l = clamp(l0 + dx, 0, rr0 - minW);
      if (hr) r = clamp(rr0 + dx, l0 + minW, 1);
      if (ht) t = clamp(t0 + dy, 0, b0 - minH);
      if (hb) b = clamp(b0 + dy, t0 + minH, 1);
      return [l, t, r, b];
    }
    const minWl = Math.max(minW, minH * rf);
    if ((hl || hr) && (ht || hb)) {
      const ax = hl ? rr0 : l0, ay = ht ? b0 : t0;
      const px = (hl ? l0 : rr0) + dx, py = (ht ? t0 : b0) + dy;
      const maxW = Math.min(hl ? ax : 1 - ax, (ht ? ay : 1 - ay) * rf);
      if (maxW < minWl) return r0;
      const w = clamp(Math.max(Math.abs(px - ax), Math.abs(py - ay) * rf), minWl, maxW), h = w / rf;
      const l = hl ? ax - w : ax, t = ht ? ay - h : ay;
      return [l, t, l + w, t + h];
    }
    if (hl || hr) {
      const ax = hl ? rr0 : l0, cy = (t0 + b0) / 2, px = (hl ? l0 : rr0) + dx;
      const maxW = Math.min(hl ? ax : 1 - ax, 2 * Math.min(cy, 1 - cy) * rf);
      if (maxW < minWl) return r0;
      const w = clamp(Math.abs(px - ax), minWl, maxW), h = w / rf, l = hl ? ax - w : ax;
      return [l, cy - h / 2, l + w, cy + h / 2];
    }
    const ay = ht ? b0 : t0, cx = (l0 + rr0) / 2, py = (ht ? t0 : b0) + dy;
    const minHl = minWl / rf, maxH = Math.min(ht ? ay : 1 - ay, 2 * Math.min(cx, 1 - cx) / rf);
    if (maxH < minHl) return r0;
    const h = clamp(Math.abs(py - ay), minHl, maxH), w = h * rf, t = ht ? ay - h : ay;
    return [cx - w / 2, t, cx + w / 2, t + h];
  };
  M.rotateRect = (r, cw) => cw ? [1 - r[3], r[0], 1 - r[1], r[2]] : [r[1], 1 - r[2], r[3], 1 - r[0]];

  // ------------------------------------------------------------------ formatting
  M.signed = (v, step = 1) => {
    const txt = (step < 1 && v !== Math.round(v)) ? v.toFixed(1) : String(Math.round(v));
    return v > 0 ? '+' + txt : v < 0 ? txt.replace('-', '−') : '0';
  };
  M.formatThirds = t => {
    if (t === 0) return '±0';
    const a = Math.abs(t), whole = Math.floor(a / 3), frac = a % 3;
    let body = '';
    if (whole > 0) body += whole;
    if (frac > 0) { if (whole > 0) body += ' '; body += frac + '/3'; }
    return (t > 0 ? '+' : '−') + body;
  };
  M.summary = p => {
    let s = 'GRAIN ' + M.GRAIN_SHORT[p.grain];
    if (p.colorChrome > 0) s += '  CC ' + M.CHROME_OPTIONS[p.colorChrome].toUpperCase();
    if (p.colorChromeBlue > 0) s += '  CCB ' + M.CHROME_OPTIONS[p.colorChromeBlue].toUpperCase();
    const wbl = M.WB_PRESETS[p.wb].type === 'CUSTOM' ? p.kelvin + 'K' : M.WB_PRESETS[p.wb].label.toUpperCase();
    s += '  WB ' + wbl;
    if (p.wbShiftR || p.wbShiftB) s += ' R' + M.signed(p.wbShiftR) + ' B' + M.signed(p.wbShiftB);
    const t = M.effectiveTone(p);
    s += '  ' + M.DR_OPTIONS[t.dr];
    if (p.dRangePriority > 0) s += ' DRP-' + M.DRP_OPTIONS[p.dRangePriority].toUpperCase();
    s += '  H' + M.signed(t.highlight, 0.5) + ' S' + M.signed(t.shadow, 0.5);
    if (M.isMono(p.sim) && (p.monoWC || p.monoMG)) s += '  WC' + M.signed(p.monoWC) + ' MG' + M.signed(p.monoMG);
    if (p.color) s += '  COLOR ' + M.signed(p.color);
    if (p.exposureThirds) s += '  EV ' + M.formatThirds(p.exposureThirds);
    return s;
  };

  // ------------------------------------------------------------------ Q menu settings
  const choice = (id, label, hint, options, key) => ({ kind: 'choice', id, label, hint, options, key });
  const stepper = (id, label, hint, min, max, step, format, key, extra) => Object.assign({ kind: 'stepper', id, label, hint, min, max, step, format, key }, extra);
  const intStep = v => M.signed(v);
  M.Q_SETTINGS = [
    choice('sim', 'Film Sim', '20 film simulations', M.FILM_SIMS.map(s => s.short), 'sim'),
    stepper('exp', 'Exposure', '1/3-stop steps, ±3 EV', -9, 9, 1, v => M.formatThirds(Math.round(v)), 'exposureThirds'),
    choice('grain', 'Grain', 'Roughness · size', M.GRAIN_OPTIONS, 'grain'),
    choice('cc', 'Color Chrome', 'Deeper tones in strongly coloured areas', M.CHROME_OPTIONS, 'colorChrome'),
    choice('ccb', 'CC FX Blue', 'Deeper, richer blues', M.CHROME_OPTIONS, 'colorChromeBlue'),
    choice('wb', 'White Bal.', 'Preset, auto or Kelvin', M.WB_PRESETS.map(w => w.label), 'wb'),
    stepper('kelvin', 'Kelvin', 'Used when White Balance = Kelvin', 2500, 10000, 100, v => Math.round(v) + 'K', 'kelvin'),
    stepper('wbr', 'WB Shift R', 'Red (+) ↔ Cyan (−)', -9, 9, 1, intStep, 'wbShiftR'),
    stepper('wbb', 'WB Shift B', 'Blue (+) ↔ Yellow (−)', -9, 9, 1, intStep, 'wbShiftB'),
    choice('dr', 'Dyn. Range', 'Highlight roll-off', M.DR_OPTIONS, 'dynamicRange'),
    choice('drp', 'D-Range Pri.', 'Overrides DR, Highlight and Shadow', M.DRP_OPTIONS, 'dRangePriority'),
    stepper('hl', 'Highlight', 'Tone curve −2 (soft) to +4 (hard)', -2, 4, 0.5, v => M.signed(v, 0.5), 'highlight'),
    stepper('sh', 'Shadow', 'Tone curve −2 (soft) to +4 (hard)', -2, 4, 0.5, v => M.signed(v, 0.5), 'shadow'),
    stepper('color', 'Color', 'Saturation −4 to +4', -4, 4, 1, intStep, 'color'),
    stepper('sharp', 'Sharpness', '−4 to +4', -4, 4, 1, intStep, 'sharpness'),
    stepper('nr', 'High ISO NR', 'Noise reduction −4 to +4', -4, 4, 1, intStep, 'noiseReduction'),
    stepper('clarity', 'Clarity', 'Mid-tone contrast −5 to +5', -5, 5, 1, intStep, 'clarity'),
    stepper('mwc', 'Mono WC', 'B&W tone: warm (+) ↔ cool (−)', -9, 9, 1, intStep, 'monoWC'),
    stepper('mmg', 'Mono MG', 'B&W tone: magenta (+) ↔ green (−)', -9, 9, 1, intStep, 'monoMG'),
    choice('skin', 'Smooth Skin', 'Softens skin texture', M.SKIN_OPTIONS, 'smoothSkin'),
  ];
  M.setting = id => M.Q_SETTINGS.find(s => s.id === id);
  M.settingIsDefault = (s, p) => p[s.key] === DEF[s.key];
  M.settingDisplay = (s, p) => s.kind === 'choice' ? s.options[clamp(p[s.key], 0, s.options.length - 1)] : s.format(p[s.key]);
  M.snap = (s, v) => clamp(Math.round(v / s.step) * s.step, s.min, s.max);
  M.lockReason = (id, p) => {
    if (id === 'dr' || id === 'hl' || id === 'sh') return p.dRangePriority > 0 ? 'Set automatically by D-Range Priority. Turn D-Range Priority off to change it.' : null;
    if (id === 'mwc' || id === 'mmg') return !M.isMono(p.sim) ? 'Only used by black & white film simulations (Acros, Monochrome, Sepia).' : null;
    return null;
  };
  M.effectiveDisplay = (s, p) => {
    if (p.dRangePriority > 0 && (s.id === 'dr' || s.id === 'hl' || s.id === 'sh')) {
      const t = M.effectiveTone(p);
      return s.id === 'dr' ? M.DR_OPTIONS[t.dr] : s.id === 'hl' ? M.signed(t.highlight, 0.5) : M.signed(t.shadow, 0.5);
    }
    return M.settingDisplay(s, p);
  };

  // Pro sliders
  const ps = (label, key, min, max, def = 0) => ({ label, key, min, max, def });
  M.PRO_SLIDERS = [
    ps('Contrast', 'contrast', -100, 100), ps('Highlights', 'highlights', -100, 100), ps('Shadows', 'shadows', -100, 100),
    ps('Whites', 'whites', -100, 100), ps('Blacks', 'blacks', -100, 100), ps('Fade', 'fade', 0, 100),
    ps('Temperature', 'temp', -100, 100), ps('Tint', 'tint', -100, 100), ps('Vibrance', 'vibrance', -100, 100), ps('Saturation', 'saturation', -100, 100),
    ps('Vignette', 'vignette', -100, 100), ps('Glow', 'glow', 0, 100),
  ];
  M.GLOW_SLIDERS = [ps('Threshold', 'glowThreshold', 0, 100, 70), ps('Size', 'glowSize', 0, 100, 40), ps('Warmth', 'glowWarmth', 0, 100, 30)];

  // ------------------------------------------------------------------ paste parts
  M.PASTE_PARTS = [
    { id: 'Film', title: 'Film Simulation', subtitle: 'Simulation and its strength', on: true, keys: ['sim', 'simStrength'] },
    { id: 'QMenu', title: 'Q Menu settings', subtitle: 'WB, Dynamic Range, Highlight/Shadow, Colour, Grain, Chrome FX', on: true,
      keys: ['exposureThirds', 'grain', 'colorChrome', 'colorChromeBlue', 'wb', 'kelvin', 'wbShiftR', 'wbShiftB', 'dynamicRange', 'dRangePriority', 'highlight', 'shadow', 'color', 'monoWC', 'monoMG'] },
    { id: 'Light', title: 'Pro · Light & Effects', subtitle: 'Contrast, Highlights, Shadows, Whites, Blacks, Fade, Vignette, Glow', on: true,
      keys: ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'fade', 'vignette', 'glow', 'glowStyle', 'glowThreshold', 'glowSize', 'glowWarmth'] },
    { id: 'Color', title: 'Pro · Colour & HSL', subtitle: 'Temperature, Tint, Vibrance, Saturation, HSL', on: true,
      keys: ['temp', 'tint', 'vibrance', 'saturation', 'hslHue', 'hslSat', 'hslLum'] },
    { id: 'Curve', title: 'Curve', subtitle: 'YRGB curves, Intensity, Soft Clip', on: true,
      keys: ['curveY', 'curveR', 'curveG', 'curveB', 'curveLinked', 'curveMix', 'softLow', 'softHigh', 'softLS', 'softHS', 'softLink', 'softRGB'] },
    { id: 'Detail', title: 'Detail', subtitle: 'Sharpness, Noise reduction, Clarity, Smooth skin', on: false, keys: ['sharpness', 'noiseReduction', 'clarity', 'smoothSkin'] },
    { id: 'Crop', title: 'Crop & Rotate', subtitle: 'Usually different for each photo', on: false, keys: GEO },
  ];
  M.pasteFrom = (p, src, parts) => {
    const q = M.copy(p);
    M.PASTE_PARTS.filter(pp => parts.has(pp.id)).forEach(pp => pp.keys.forEach(k => q[k] = JSON.parse(JSON.stringify(src[k]))));
    return q;
  };
  M.copySummary = p => {
    const parts = [M.FILM_SIMS[p.sim].name];
    if (p.wb !== DEF.wb) parts.push('WB ' + M.WB_PRESETS[p.wb].label);
    if (p.grain !== DEF.grain) parts.push('Grain ' + M.GRAIN_OPTIONS[p.grain]);
    if (M.hasCurves(p) || M.hasSoftClip(p)) parts.push('Curve');
    return parts.join(' · ');
  };

  // ------------------------------------------------------------------ recipes
  M.starterRecipes = () => {
    const t = Date.now();
    const r = (k, name, o) => ({ id: t + k, name, params: Object.assign(M.defaults(), o) });
    return [
      r(0, 'Street Chrome', { sim: 3, grain: 1, colorChrome: 2, wb: 1, wbShiftR: 2, wbShiftB: -4, dynamicRange: 2, highlight: -1, shadow: 1, color: 2, sharpness: -1, noiseReduction: -4 }),
      r(1, 'Golden Hour Neg', { sim: 8, grain: 4, colorChrome: 1, wb: 2, wbShiftR: 3, wbShiftB: -5, dynamicRange: 1, highlight: -2, shadow: 2 }),
      r(2, 'Teal Night', { sim: 9, colorChromeBlue: 2, wb: 9, kelvin: 4200, wbShiftR: -1, wbShiftB: 3, dynamicRange: 2, clarity: -2 }),
      r(3, 'Snapshot 90s', { sim: 7, grain: 3, colorChrome: 2, wb: 1, wbShiftR: 1, wbShiftB: -2, highlight: 1, shadow: 2, sharpness: 1 }),
      r(4, 'Red Sky B&W', { sim: 13, grain: 2, monoWC: 2, highlight: 1, shadow: 2, sharpness: 2 }),
      r(5, 'Soft Portrait', { sim: 2, smoothSkin: 1, wb: 1, wbShiftR: 1, wbShiftB: -1, highlight: -1, shadow: -1, color: 1 }),
    ];
  };
  M.recipeShareText = r => 'Lumora Film recipe "' + r.name + '"\n' + JSON.stringify({ name: r.name, params: M.toJson(r.params) });
  M.recipeFromText = text => {
    if (!text) return null;
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      const o = JSON.parse(text.slice(s, e + 1));
      if (!o || typeof o.params !== 'object') return null;
      return { id: Date.now(), name: String(o.name || 'Recipe').slice(0, 60), params: M.withoutGeometry(M.fromJson(o.params)) };
    } catch (_) { return null; }
  };

  // ------------------------------------------------------------------ export settings
  M.EXPORT_FORMATS = [
    { id: 'JPEG', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
    { id: 'PNG', label: 'PNG', mime: 'image/png', ext: 'png' },
    { id: 'WEBP', label: 'WebP', mime: 'image/webp', ext: 'webp' },
  ];
  M.SIZE_MODES = [['Full', 'Full'], ['LongEdge', 'Long edge'], ['ShortEdge', 'Short edge'], ['Megapixels', 'Megapixels'], ['Percent', '%']];
  M.SHARPEN = [['Off', 'Off'], ['Screen', 'Screen'], ['Matte', 'Matte'], ['Glossy', 'Glossy']];
  M.METADATA = [['All', 'All'], ['CopyrightOnly', 'Copyright only'], ['None', 'None']];
  M.SHARPEN_LEVELS = ['Low', 'Standard', 'High'];
  M.WATERMARK_COLORS = ['White', 'Black', 'Amber'];
  M.exportDefaults = () => ({
    format: 'JPEG', quality: 92, limitSize: false, limitMb: 2, sizeMode: 'Full', longEdge: 2048, shortEdge: 1080, megapixels: 12, percent: 50,
    sharpen: 'Off', sharpenLevel: 1, metadata: 'All', cameraInfo: true, keepLocation: false, embedRecipe: true, copyright: '', folder: '',
    watermark: false, wmText: '', wmPos: 8, wmSize: 4, wmOpacity: 80, wmColor: 0,
  });
  M.exportFromJson = o => {
    const d = M.exportDefaults(); o = o || {};
    const pick = (k, list) => list.some(x => (x.id || x[0]) === o[k]) ? o[k] : d[k];
    const num = (k, a, b) => { const v = Number(o[k]); return isNaN(v) ? d[k] : clamp(v, a, b); };
    const bool = k => typeof o[k] === 'boolean' ? o[k] : d[k];
    return {
      format: pick('format', M.EXPORT_FORMATS), quality: Math.round(num('quality', 10, 100)), limitSize: bool('limitSize'), limitMb: num('limitMb', 0.1, 100),
      sizeMode: pick('sizeMode', M.SIZE_MODES), longEdge: Math.round(num('longEdge', 64, 16000)), shortEdge: Math.round(num('shortEdge', 64, 16000)),
      megapixels: Math.round(num('megapixels', 1, 200)), percent: Math.round(num('percent', 1, 100)),
      sharpen: pick('sharpen', M.SHARPEN), sharpenLevel: Math.round(num('sharpenLevel', 0, 2)), metadata: pick('metadata', M.METADATA),
      cameraInfo: bool('cameraInfo'), keepLocation: bool('keepLocation'), embedRecipe: bool('embedRecipe'),
      copyright: String(o.copyright || '').slice(0, 120), folder: M.cleanFolder(String(o.folder || '')),
      watermark: bool('watermark'), wmText: String(o.wmText || '').slice(0, 80), wmPos: Math.round(num('wmPos', 0, 8)),
      wmSize: Math.round(num('wmSize', 1, 15)), wmOpacity: Math.round(num('wmOpacity', 5, 100)), wmColor: Math.round(num('wmColor', 0, 2)),
    };
  };
  M.cleanFolder = s => s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40);
  M.isLossy = s => s.format === 'JPEG' || s.format === 'WEBP';
  M.canLimitSize = s => s.format === 'JPEG' || s.format === 'WEBP';
  M.canWriteMetadata = s => s.format === 'JPEG';
  M.filePrefix = s => 'LumoraFilm' + (M.cleanFolder(s.folder) ? '_' + M.cleanFolder(s.folder).replace(/ /g, '_') : '');
  M.BUILT_IN_PRESETS = [
    { name: 'JPG Small', builtIn: true, detail: '2048 px · 85', settings: Object.assign(M.exportDefaults(), { quality: 85, sizeMode: 'LongEdge', longEdge: 2048 }) },
    { name: 'JPG Full', builtIn: true, detail: 'Full · 92', settings: Object.assign(M.exportDefaults(), { quality: 92, sizeMode: 'Full' }) },
    { name: 'Instagram', builtIn: true, detail: '1080 px · 90', settings: Object.assign(M.exportDefaults(), { quality: 90, sizeMode: 'ShortEdge', shortEdge: 1080, sharpen: 'Screen' }) },
    { name: 'PNG Full', builtIn: true, detail: 'Lossless', settings: Object.assign(M.exportDefaults(), { format: 'PNG', sizeMode: 'Full' }) },
  ];
  M.presetApply = (pr, s) => !pr.builtIn ? Object.assign({}, pr.settings) : Object.assign({}, s, {
    format: pr.settings.format, quality: pr.settings.quality, limitSize: false, sizeMode: pr.settings.sizeMode,
    longEdge: pr.settings.longEdge, shortEdge: pr.settings.shortEdge, sharpen: pr.settings.sharpen, sharpenLevel: pr.settings.sharpenLevel,
  });
  M.presetMatches = (pr, s) => {
    if (!pr.builtIn) return M.equals(pr.settings, s);
    const p = pr.settings;
    if (s.format !== p.format || s.limitSize || s.sizeMode !== p.sizeMode) return false;
    if (M.isLossy(p) && s.quality !== p.quality) return false;
    if (p.sizeMode === 'LongEdge' && s.longEdge !== p.longEdge) return false;
    if (p.sizeMode === 'ShortEdge' && s.shortEdge !== p.shortEdge) return false;
    if (s.sharpen !== p.sharpen || (p.sharpen !== 'Off' && s.sharpenLevel !== p.sharpenLevel)) return false;
    return true;
  };
  M.targetSize = (w, h, s, limit) => {
    if (w <= 0 || h <= 0) return [w, h];
    const long = Math.max(w, h), short = Math.min(w, h);
    let k = 1;
    switch (s.sizeMode) {
      case 'LongEdge': k = s.longEdge / long; break;
      case 'ShortEdge': k = s.shortEdge / short; break;
      case 'Megapixels': k = Math.sqrt(s.megapixels * 1e6 / (w * h)); break;
      case 'Percent': k = s.percent / 100; break;
    }
    k = Math.min(k, 1, limit / long);
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  };
  M.formatBytes = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1000)) + ' KB';

  G.FDM = M;
})(typeof self !== 'undefined' ? self : this);
