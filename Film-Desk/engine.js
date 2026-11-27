/* Lumora Film web — image engine, ported line by line from the Android app's engine/ImageEngine.kt.
 * Images are { w, h, data: Uint8ClampedArray (RGBA) }. Pure JS, so it behaves the same in every browser. */
'use strict';
(function (G) {
  const M = G.FDM;
  const E = {};
  const ENC = 4096, CURVE_LUT = 1024;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const srgbToLinear = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const linearToSrgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const toLinear = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));
  const toGamma = new Float32Array(ENC + 1).map((_, i) => linearToSrgb(i / ENC));
  const toLinearF = new Float32Array(ENC + 1).map((_, i) => srgbToLinear(i / ENC));
  const HUE_CENTERS = [0, 30, 60, 120, 180, 225, 275, 320];
  const RAD = 180 / Math.PI;

  const enc = v => toGamma[((v < 0 ? 0 : v > 1 ? 1 : v) * ENC) | 0];
  const lin = v => toLinearF[((v < 0 ? 0 : v > 1 ? 1 : v) * ENC) | 0];
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const sCurve = (x, k) => { const c = clamp(x, 0, 1); return c + k * (c - 0.5) * 4 * c * (1 - c); };
  const ci = v => (clamp(v, 0, 1) * (CURVE_LUT - 1) + 0.5) | 0;
  const to8 = v => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);

  E.newImage = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });

  /** Average linear colour, used by Auto white balance. */
  E.computeStats = function (img) {
    const { w, h, data } = img, step = Math.max(1, (Math.max(w, h) / 200) | 0);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      r += toLinear[data[i]]; g += toLinear[data[i + 1]]; b += toLinear[data[i + 2]]; n++;
    }
    if (!n) return { avgR: 0.18, avgG: 0.18, avgB: 0.18 };
    return { avgR: Math.max(r / n, 1e-4), avgG: Math.max(g / n, 1e-4), avgB: Math.max(b / n, 1e-4) };
  };

  // ------------------------------------------------------------------ geometry

  /** Flip, then 90° turns clockwise (like Android's Matrix: postScale(−1, 1), postRotate). */
  E.rotateFlip = function (src, rotation, flipH) {
    if (!rotation && !flipH) return src;
    const { w, h, data } = src, swap = rotation % 180 !== 0;
    const ow = swap ? h : w, oh = swap ? w : h;
    const out = E.newImage(ow, oh), od = out.data, s32 = new Uint32Array(data.buffer, data.byteOffset, w * h), o32 = new Uint32Array(od.buffer);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      let sx, sy;
      switch (rotation) {
        case 90: sx = y; sy = h - 1 - x; break;
        case 180: sx = w - 1 - x; sy = h - 1 - y; break;
        case 270: sx = w - 1 - y; sy = x; break;
        default: sx = x; sy = y;
      }
      if (flipH) sx = w - 1 - sx;
      o32[y * ow + x] = s32[sy * w + sx];
    }
    return out;
  };

  /** 90° turns and flip, then straighten (zoomed to fill) and crop. */
  E.applyGeometry = function (src, p) {
    const bmp = E.rotateFlip(src, p.rotation, p.flipH);
    const { w, h } = bmp;
    const r = M.cropRect(p, w, h);
    const x0 = clamp(Math.round(r[0] * w), 0, w - 1), y0 = clamp(Math.round(r[1] * h), 0, h - 1);
    const x1 = clamp(Math.round(r[2] * w), x0 + 1, w), y1 = clamp(Math.round(r[3] * h), y0 + 1, h);
    const cw = x1 - x0, ch = y1 - y0;
    const angle = p.straighten;
    const s32 = new Uint32Array(bmp.data.buffer, bmp.data.byteOffset, w * h);
    if (Math.abs(angle) < 0.01) {
      if (cw === w && ch === h) return bmp === src ? { w, h, data: new Uint8ClampedArray(src.data) } : bmp;
      const out = E.newImage(cw, ch), o32 = new Uint32Array(out.data.buffer);
      for (let y = 0; y < ch; y++) o32.set(s32.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
      return out;
    }
    // Turn about the centre, zoomed so the frame has no blank corners, then cut out the crop (bilinear).
    const s = M.straightenScale(angle, w, h), a = -angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const out = E.newImage(cw, ch), od = out.data, sd = bmp.data, cx = w / 2, cy = h / 2;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const dx = (x + x0 + 0.5 - cx) / s, dy = (y + y0 + 0.5 - cy) / s;
      let fx = dx * cos - dy * sin + cx - 0.5, fy = dx * sin + dy * cos + cy - 0.5;
      fx = clamp(fx, 0, w - 1); fy = clamp(fy, 0, h - 1);
      const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const ix1 = ix + 1 < w ? ix + 1 : ix, iy1 = iy + 1 < h ? iy + 1 : iy;
      const a0 = (iy * w + ix) * 4, b0 = (iy * w + ix1) * 4, c0 = (iy1 * w + ix) * 4, d0 = (iy1 * w + ix1) * 4, o = (y * cw + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[a0 + k] + (sd[b0 + k] - sd[a0 + k]) * tx, bot = sd[c0 + k] + (sd[d0 + k] - sd[c0 + k]) * tx;
        od[o + k] = top + (bot - top) * ty;
      }
      od[o + 3] = 255;
    }
    return out;
  };

  // ------------------------------------------------------------------ preparation

  function kelvinRgb(k) {
    const t = clamp(k, 1000, 40000) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [clamp(r, 1, 255), clamp(g, 1, 255), clamp(b, 1, 255)];
  }
  function kelvinGains(k) {
    const ref = kelvinRgb(5500), t = kelvinRgb(k);
    const r = ref[0] / t[0], g = ref[1] / t[1], b = ref[2] / t[2];
    return [clamp(r / g, 0.3, 3), 1, clamp(b / g, 0.3, 3)];
  }
  const autoBlend = x => clamp(1 + (x - 1) * 0.75, 0.5, 2);
  function whiteBalanceGains(p, s) {
    const preset = M.WB_PRESETS[clamp(p.wb, 0, M.WB_PRESETS.length - 1)];
    let g;
    switch (preset.type) {
      case 'AUTO': g = [autoBlend(s.avgG / s.avgR), 1, autoBlend(s.avgG / s.avgB)]; break;
      case 'KELVIN': g = kelvinGains(preset.kelvin); break;
      case 'CUSTOM': g = kelvinGains(p.kelvin); break;
      case 'UNDERWATER': g = [1.45, 1, 0.8]; break;
      default: g = [1, 1, 1];
    }
    g[1] *= preset.green;
    return g;
  }

  function prepare(p, stats) {
    const q = {};
    q.sim = M.FILM_SIMS[clamp(p.sim, 0, M.FILM_SIMS.length - 1)];
    q.strength = clamp(p.simStrength, 0, 1);
    q.colorMul = 1 + 0.08 * p.color;
    q.proSat = p.saturation / 100;
    q.vib = p.vibrance / 100;
    q.cc = p.colorChrome === 1 ? 0.14 : p.colorChrome === 2 ? 0.26 : 0;
    q.ccb = p.colorChromeBlue === 1 ? 0.12 : p.colorChromeBlue === 2 ? 0.22 : 0;
    q.proContrast = p.contrast / 100 * 0.3;
    q.proHi = p.highlights / 100; q.proSh = p.shadows / 100; q.proWh = p.whites / 100; q.proBl = p.blacks / 100;
    q.fade = p.fade / 100 * 0.15;
    q.wc = p.monoWC; q.mg = p.monoMG;
    q.lutY = M.isIdentityCurve(p.curveY) ? null : M.curveLut(p.curveY, CURVE_LUT);
    q.lutR = M.isIdentityCurve(p.curveR) ? null : M.curveLut(p.curveR, CURVE_LUT);
    q.lutG = M.isIdentityCurve(p.curveG) ? null : M.curveLut(p.curveG, CURVE_LUT);
    q.lutB = M.isIdentityCurve(p.curveB) ? null : M.curveLut(p.curveB, CURVE_LUT);
    q.curveOn = !!(q.lutY || q.lutR || q.lutG || q.lutB);
    q.linked = p.curveLinked;
    q.mixY = (p.curveMix[0] ?? 100) / 100; q.mixR = (p.curveMix[1] ?? 100) / 100;
    q.mixG = (p.curveMix[2] ?? 100) / 100; q.mixB = (p.curveMix[3] ?? 100) / 100;
    q.outLow = [0, 1, 2].map(c => M.softValue(p, c, 0) / 100);
    q.outHigh = [0, 1, 2].map(c => Math.max(q.outLow[c] + 0.01, M.softValue(p, c, 1) / 100));
    q.lsKnee = [0, 1, 2].map(c => 0.5 * (M.softValue(p, c, 2) / 100));
    q.softOn = [0, 1, 2].some(c => q.outLow[c] !== 0 || q.outHigh[c] !== 1 || q.lsKnee[c] !== 0);
    q.hslOn = p.hslHue.some(v => v) || p.hslSat.some(v => v) || p.hslLum.some(v => v);
    q.hueShift = p.hslHue.map(v => v * 0.3);
    q.satShift = p.hslSat.map(v => v / 100);
    q.lumShift = p.hslLum.map(v => v / 100 * 0.5);

    const wb = whiteBalanceGains(p, stats);
    const ev = Math.pow(2, p.exposureThirds / 3);
    const t = p.temp / 100, tn = p.tint / 100;
    q.gR = wb[0] * ev * (1 + 0.3 * t) * (1 + 0.025 * p.wbShiftR);
    q.gG = wb[1] * ev * (1 - 0.2 * tn);
    q.gB = wb[2] * ev * (1 - 0.3 * t) * (1 + 0.025 * p.wbShiftB);
    const tone = M.effectiveTone(p);
    q.dr = tone.dr; q.hl = tone.highlight; q.sh = tone.shadow;
    q.knee = [1, 1, 1]; q.a = [1, 1, 1]; q.norm = [1, 1, 1]; q.shoulderOn = [false, false, false];
    for (let ch = 0; ch < 3; ch++) {
      const hs = M.softValue(p, ch, 3) / 100;
      let k = tone.dr === 1 ? 0.75 : tone.dr === 2 ? 0.6 : 1;
      let range = 1 + tone.dr * 0.5;
      if (hs > 0) { k = Math.min(k, 1 - 0.45 * hs); range = Math.max(range, 1 + 2 * hs); }
      q.knee[ch] = k; q.shoulderOn[ch] = k < 1;
      if (k < 1) { q.a[ch] = 1 / (1 - k); q.norm[ch] = 1 - Math.exp(-q.a[ch] * (range - k)); }
    }
    // Per-channel tables for step 1 (linear WB/exposure + shoulder → gamma), one entry per 8-bit input.
    const gains = [q.gR, q.gG, q.gB];
    q.step1 = [0, 1, 2].map(ch => {
      const tab = new Float32Array(256), k = q.knee[ch];
      for (let v = 0; v < 256; v++) {
        let x = toLinear[v] * gains[ch];
        if (q.shoulderOn[ch] && x > k) x = k + (1 - k) * Math.min(1, (1 - Math.exp(-q.a[ch] * (x - k))) / q.norm[ch]);
        tab[v] = enc(x);
      }
      return tab;
    });
    return q;
  }

  // ------------------------------------------------------------------ OKLab
  const LAB = new Float64Array(3), RGB = new Float64Array(3), TMP = new Float64Array(3);
  function toOklab(r, g, b, out) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  }
  function fromOklab(L, a, b, out) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  }
  function inGamut(L, ua, ub, c) {
    fromOklab(L, ua * c, ub * c, TMP);
    const e = 1e-4;
    return TMP[0] >= -e && TMP[0] <= 1 + e && TMP[1] >= -e && TMP[1] <= 1 + e && TMP[2] >= -e && TMP[2] <= 1 + e;
  }
  function softGamut(L, ua, ub, c, target) {
    if (inGamut(L, ua, ub, target * 1.35)) return target;
    let lo = c, hi = Math.max(target * 1.35, c + 1e-4);
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) * 0.5; if (inGamut(L, ua, ub, mid)) lo = mid; else hi = mid; }
    const cMax = lo, knee = Math.max(c, 0.72 * cMax);
    if (target <= knee || cMax - knee < 1e-5) return Math.min(target, cMax);
    const span = cMax - knee;
    return knee + span * Math.tanh((target - knee) / span);
  }

  /** Film simulation on one gamma-encoded pixel; result (gamma) in RGB. */
  function filmLook(r, g, b, sim, raw) {
    const mono = sim.mono;
    let L, a, bb;
    if (mono) {
      const l = mono[0] * lin(r) + mono[1] * lin(g) + mono[2] * lin(b);
      L = Math.cbrt(Math.max(l, 0)); a = 0; bb = 0;
    } else {
      toOklab(lin(r), lin(g), lin(b), LAB);
      L = LAB[0]; a = LAB[1]; bb = LAB[2];
    }
    const x = clamp(L, 0, 1);
    let L2 = x < 0.5 ? 0.5 * Math.pow(x / 0.5, 1 + sim.shadowTone) : 1 - 0.5 * Math.pow((1 - x) / 0.5, 1 + sim.highlightTone);
    if (!mono) {
      const c = Math.sqrt(a * a + bb * bb);
      let sat = sim.saturation;
      if (sim.midSat !== 0) sat *= 1 + sim.midSat * 4 * L2 * (1 - L2) - sim.midSat * 0.5;
      sat *= Math.sqrt(clamp((L2 + 0.05) / (L + 0.05), 0.7, 1.4));
      if (sim.bands.length && c > 1e-4) {
        let hue = Math.atan2(bb, a) * RAD;
        if (hue < 0) hue += 360;
        const strength = clamp(c / 0.04, 0, 1);
        let dH = 0, dL = 0;
        for (const band of sim.bands) {
          let d = Math.abs(hue - band.center) % 360;
          if (d > 180) d = 360 - d;
          const wt = clamp(1 - d / band.width, 0, 1) * strength;
          if (wt <= 0) continue;
          dH += wt * band.shift; sat *= 1 + wt * (band.sat - 1); dL += wt * band.lum;
        }
        const c2 = c * sat, h2 = (hue + dH) / RAD;
        a = c2 * Math.cos(h2); bb = c2 * Math.sin(h2);
        L2 += dL;
      } else { a *= sat; bb *= sat; }
      let sw = clamp(1 - L2 / 0.5, 0, 1); sw = sw * sw * 2;
      let hw = clamp((L2 - 0.5) / 0.5, 0, 1); hw = hw * hw * 2;
      a += sim.shadowTint[0] * sw + sim.highlightTint[0] * hw;
      bb += sim.shadowTint[1] * sw + sim.highlightTint[1] * hw;
    }
    fromOklab(L2, a, bb, RGB);
    if (!raw) { RGB[0] = enc(RGB[0]); RGB[1] = enc(RGB[1]); RGB[2] = enc(RGB[2]); }
  }
  /** Signed sRGB encoding (keeps out-of-gamut values, so tables interpolate smoothly through the clip). */
  const encS = v => v >= 0 ? linearToSrgb(v) : -linearToSrgb(-v);

  function rgbToHsv(r, g, b, out) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = d === 0 ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    out[0] = h; out[1] = mx === 0 ? 0 : d / mx; out[2] = mx;
  }
  function hsvToRgb(h, s, v, out) {
    const c = v * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = v - c;
    let r, g, b;
    switch (hp | 0) {
      case 0: r = c; g = x; b = 0; break;
      case 1: r = x; g = c; b = 0; break;
      case 2: r = 0; g = c; b = x; break;
      case 3: r = 0; g = x; b = c; break;
      case 4: r = x; g = 0; b = c; break;
      default: r = c; g = 0; b = x;
    }
    out[0] = r + m; out[1] = g + m; out[2] = b + m;
  }

  // ------------------------------------------------------------------ colour pass
  // Film look (with sepia / mono toning) depends only on the sim, so it is baked into a 3D table
  // (49³, trilinear) that is reused while sliders move. Small images compute it directly.
  const LUT_N = 49, lutCache = new Map();
  function lookOne(r, g, b, q, out, o, forLut) {
    const sim = q.sim;
    const raw = forLut && !sim.mono;
    filmLook(r, g, b, sim, raw);
    let sr = raw ? encS(RGB[0]) : RGB[0], sg = raw ? encS(RGB[1]) : RGB[1], sb = raw ? encS(RGB[2]) : RGB[2];
    if (sim.sepia) { const tl = clamp(luma(sr, sg, sb), 0, 1), k = 4 * tl * (1 - tl) + 0.25; sr += 0.06 * k; sg += 0.015 * k; sb -= 0.06 * k; }
    if (sim.mono && (q.wc !== 0 || q.mg !== 0)) { sr += q.wc * 0.006 + q.mg * 0.004; sg -= q.mg * 0.006; sb += -q.wc * 0.006 + q.mg * 0.004; }
    out[o] = sr; out[o + 1] = sg; out[o + 2] = sb;
  }
  function filmLut(q, simIndex) {
    const key = simIndex + '|' + (q.sim.mono ? q.wc + '|' + q.mg : '');
    let lut = lutCache.get(key);
    if (lut) return lut;
    const N = LUT_N, step = 1 / (N - 1);
    lut = new Float32Array(N * N * N * 3);
    let o = 0;
    for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++, o += 3) lookOne(ri * step, gi * step, bi * step, q, lut, o, true);
    if (lutCache.size > 24) lutCache.delete(lutCache.keys().next().value);
    lutCache.set(key, lut);
    return lut;
  }
  const LOOK = new Float64Array(3);
  function lutLook(lut, r, g, b) {
    const N1 = LUT_N - 1;
    const fr = clamp(r, 0, 1) * N1, fg = clamp(g, 0, 1) * N1, fb = clamp(b, 0, 1) * N1;
    let r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
    if (r0 >= N1) r0 = N1 - 1; if (g0 >= N1) g0 = N1 - 1; if (b0 >= N1) b0 = N1 - 1;
    const tr = fr - r0, tg = fg - g0, tb = fb - b0;
    const sG = LUT_N * 3, sB = LUT_N * LUT_N * 3;
    const i000 = b0 * sB + g0 * sG + r0 * 3;
    for (let k = 0; k < 3; k++) {
      const i = i000 + k;
      const c00 = lut[i] + (lut[i + 3] - lut[i]) * tr;
      const c10 = lut[i + sG] + (lut[i + sG + 3] - lut[i + sG]) * tr;
      const c01 = lut[i + sB] + (lut[i + sB + 3] - lut[i + sB]) * tr;
      const c11 = lut[i + sB + sG] + (lut[i + sB + sG + 3] - lut[i + sB + sG]) * tr;
      const c0 = c00 + (c10 - c00) * tg, c1 = c01 + (c11 - c01) * tg;
      LOOK[k] = c0 + (c1 - c0) * tb;
    }
  }

  function colorPass(img, q, simIndex) {
    const d = img.data, n = img.w * img.h, hsv = TMP;
    const s1r = q.step1[0], s1g = q.step1[1], s1b = q.step1[2];
    const lut = q.strength > 0 && n > 60000 ? filmLut(q, simIndex) : null;
    const clipLook = !!lut && !q.sim.mono;
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      let r = s1r[d[i]], g = s1g[d[i + 1]], b = s1b[d[i + 2]];

      // 2. film simulation
      if (q.strength > 0) {
        if (lut) lutLook(lut, r, g, b); else lookOne(r, g, b, q, LOOK, 0);
        let sr = LOOK[0], sg = LOOK[1], sb = LOOK[2];
        if (clipLook) { sr = clamp(sr, 0, 1); sg = clamp(sg, 0, 1); sb = clamp(sb, 0, 1); }
        r += (sr - r) * q.strength; g += (sg - g) * q.strength; b += (sb - b) * q.strength;
      }

      // 3. tone
      const lum = clamp(luma(r, g, b), 0, 1);
      let dL = 0;
      if (q.hl !== 0) dL += q.hl * 0.045 * smooth(0.45, 1, lum);
      if (q.sh !== 0) dL -= q.sh * 0.045 * (1 - smooth(0, 0.55, lum));
      if (q.proHi !== 0) dL += q.proHi * 0.22 * smooth(0.45, 1, lum);
      if (q.proSh !== 0) dL += q.proSh * 0.22 * (1 - smooth(0, 0.55, lum));
      if (q.proWh !== 0) dL += q.proWh * 0.15 * smooth(0.7, 1, lum);
      if (q.proBl !== 0) dL += q.proBl * 0.12 * (1 - smooth(0, 0.3, lum));
      r += dL; g += dL; b += dL;
      if (q.proContrast !== 0) { r = sCurve(r, q.proContrast); g = sCurve(g, q.proContrast); b = sCurve(b, q.proContrast); }

      // 3b. curves
      if (q.curveOn) {
        const ly = q.lutY;
        if (ly && q.mixY > 0) {
          if (q.linked) {
            r += (ly[ci(r)] - r) * q.mixY; g += (ly[ci(g)] - g) * q.mixY; b += (ly[ci(b)] - b) * q.mixY;
          } else {
            const yl = clamp(luma(r, g, b), 0, 1), dy = (ly[ci(yl)] - yl) * q.mixY;
            r += dy; g += dy; b += dy;
          }
        }
        if (q.lutR && q.mixR > 0) r += (q.lutR[ci(r)] - r) * q.mixR;
        if (q.lutG && q.mixG > 0) g += (q.lutG[ci(g)] - g) * q.mixG;
        if (q.lutB && q.mixB > 0) b += (q.lutB[ci(b)] - b) * q.mixB;
      }
      // 3c. soft clip
      if (q.softOn) { r = softClip(r, q, 0); g = softClip(g, q, 1); b = softClip(b, q, 2); }

      // 4. saturation / vibrance / Fuji colour in OKLab
      if (q.colorMul !== 1 || q.proSat !== 0 || q.vib !== 0) {
        r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);
        toOklab(lin(r), lin(g), lin(b), LAB);
        const ll = LAB[0], la = LAB[1], lb = LAB[2], c = Math.sqrt(la * la + lb * lb);
        if (c > 1e-5) {
          let f = q.colorMul;
          const sat = clamp(c / 0.22, 0, 1);
          let skin = 0;
          if (q.proSat > 0 || q.vib > 0) {
            let hue = Math.atan2(lb, la) * RAD;
            if (hue < 0) hue += 360;
            skin = clamp(1 - Math.abs(hue - 55) / 30, 0, 1);
          }
          if (q.proSat > 0) f *= 1 + q.proSat * (0.4 + 0.6 * (1 - sat) * (1 - sat)) * (1 - 0.5 * skin);
          else if (q.proSat < 0) f *= 1 + q.proSat;
          if (q.vib !== 0) {
            if (q.vib > 0) f *= 1 + q.vib * (1 - sat) * (1 - sat) * (1 - 0.6 * skin);
            else f *= 1 + q.vib * (0.2 + 0.45 * sat);
          }
          f = Math.max(f, 0);
          let ct = c * f;
          if (ct > c) ct = softGamut(ll, la / c, lb / c, c, ct);
          const k = ct / c;
          fromOklab(ll, la * k, lb * k, RGB);
          r = enc(RGB[0]); g = enc(RGB[1]); b = enc(RGB[2]);
        }
      }

      // 5. Color Chrome / FX Blue
      if (q.cc > 0 || q.ccb > 0) {
        const mx = Math.max(r, g, b), cs = clamp(mx - Math.min(r, g, b), 0, 1);
        if (q.cc > 0) { const f = 1 - q.cc * cs * cs * (0.5 + 0.5 * clamp(mx, 0, 1)); r *= f; g *= f; b *= f; }
        if (q.ccb > 0) {
          const bl = clamp((b - Math.max(r, g)) * 3, 0, 1);
          if (bl > 0) { const f = 1 - q.ccb * bl; r *= f; g *= f; b *= 1 - q.ccb * bl * 0.55; }
        }
      }

      // 6. HSL
      if (q.hslOn) {
        rgbToHsv(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1), hsv);
        const hh = hsv[0];
        let dh = 0, ds = 0, dl = 0;
        for (let k = 0; k < 8; k++) {
          let dd = Math.abs(hh - HUE_CENTERS[k]);
          if (dd > 180) dd = 360 - dd;
          const wgt = 1 - dd / 45;
          if (wgt > 0) { dh += wgt * q.hueShift[k]; ds += wgt * q.satShift[k]; dl += wgt * q.lumShift[k]; }
        }
        if (dh !== 0 || ds !== 0 || dl !== 0) {
          let nh = hh + dh;
          if (nh < 0) nh += 360;
          if (nh >= 360) nh -= 360;
          const ns = clamp(hsv[1] * (1 + ds), 0, 1), nv = clamp(hsv[2] * (1 + dl * hsv[1]), 0, 1);
          hsvToRgb(nh, ns, nv, hsv);
          r = hsv[0]; g = hsv[1]; b = hsv[2];
        }
      }

      // 7. fade
      if (q.fade > 0) { r = q.fade + r * (1 - q.fade); g = q.fade + g * (1 - q.fade); b = q.fade + b * (1 - q.fade); }
      d[i] = to8(r); d[i + 1] = to8(g); d[i + 2] = to8(b); d[i + 3] = 255;
    }
  }

  function softClip(v, q, ch) {
    let x = v;
    const ls = q.lsKnee[ch];
    if (ls > 0 && x < ls) x = ls - ls * Math.tanh((ls - x) / ls);
    return q.outLow[ch] + (q.outHigh[ch] - q.outLow[ch]) * clamp(x, 0, 1);
  }

  // ------------------------------------------------------------------ detail pass
  /** Separable box blur on RGB. Returns a new RGBA array. */
  E.boxBlur = function (src, w, h, r) {
    const tmp = new Uint8ClampedArray(src.length), dst = new Uint8ClampedArray(src.length);
    blurLines(src, tmp, w, h, r, true);
    blurLines(tmp, dst, w, h, r, false);
    return dst;
  };
  function blurLines(src, dst, w, h, r, horizontal) {
    const lines = horizontal ? h : w, len = horizontal ? w : h, stride = horizontal ? 4 : w * 4, div = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * w * 4 : line * 4;
      let sr = 0, sg = 0, sb = 0;
      for (let k = -r; k <= r; k++) { const o = base + clamp(k, 0, len - 1) * stride; sr += src[o]; sg += src[o + 1]; sb += src[o + 2]; }
      for (let j = 0; j < len; j++) {
        const o = base + j * stride;
        dst[o] = (sr / div) | 0; dst[o + 1] = (sg / div) | 0; dst[o + 2] = (sb / div) | 0; dst[o + 3] = 255;
        const ad = base + Math.min(j + r + 1, len - 1) * stride, sub = base + Math.max(j - r, 0) * stride;
        sr += src[ad] - src[sub]; sg += src[ad + 1] - src[sub + 1]; sb += src[ad + 2] - src[sub + 2];
      }
    }
  }
  function addDetail(d, blur, i, k) {
    d[i] = Math.round(d[i] + k * (d[i] - blur[i]));
    d[i + 1] = Math.round(d[i + 1] + k * (d[i + 1] - blur[i + 1]));
    d[i + 2] = Math.round(d[i + 2] + k * (d[i + 2] - blur[i + 2]));
  }
  function applyDetail(img, p) {
    const { w, h, data: d } = img, long = Math.max(w, h);
    if (p.smoothSkin > 0) smoothSkin(img, p.smoothSkin);
    const k = (p.sharpness >= 0 ? p.sharpness * 0.3 : p.sharpness * 0.12) - Math.max(0, p.noiseReduction) * 0.07;
    if (k !== 0) {
      const blur = E.boxBlur(d, w, h, Math.max(1, (long / 1800) | 0));
      for (let i = 0; i < d.length; i += 4) addDetail(d, blur, i, k);
    }
    if (p.clarity !== 0) {
      const r = Math.max(2, (long / 90) | 0);
      const blur = E.boxBlur(E.boxBlur(d, w, h, r), w, h, r);
      const kc = p.clarity * 0.09;
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        addDetail(d, blur, i, kc * 4 * l * (1 - l));
      }
    }
  }

  // ------------------------------------------------------------------ smooth skin
  const softRange = (x, lo, hi, f) => smooth(lo - f, lo + f, x) * (1 - smooth(hi - f, hi + f, x));
  function skinProbability(r, g, b) {
    const y = 255 * (0.299 * r + 0.587 * g + 0.114 * b);
    const cb = 128 + 255 * (-0.168736 * r - 0.331264 * g + 0.5 * b);
    const cr = 128 + 255 * (0.5 * r - 0.418688 * g - 0.081312 * b);
    return softRange(cb, 77, 127, 8) * softRange(cr, 133, 173, 8) * smooth(25, 55, y) * (1 - smooth(245, 254, y));
  }
  function boxF(src, dst, w, h, r, tmp) {
    const div = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const base = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[base + x] = sum * div;
        sum += src[base + Math.min(x + r + 1, w - 1)] - src[base + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum * div;
        sum += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
  }
  function smoothSkin(img, level) {
    const { w, h, data: px } = img, long = Math.max(w, h);
    const r = Math.max(3, (long / 140) | 0), rc = r * 3;
    const eps = level === 1 ? 0.0025 : 0.0060, amount = level === 1 ? 0.7 : 0.92, colourAmt = level === 1 ? 0.45 : 0.75;
    const src = new Uint8ClampedArray(px);
    const margin = Math.max(2 * r, rc) + 2;
    const stripH = clamp(((24000000 / (w * 44)) | 0) - 2 * margin, 32, 256);
    for (let y0 = 0; y0 < h; y0 += stripH) skinStrip(src, px, w, h, y0, Math.min(h, y0 + stripH), margin, r, rc, eps, amount, colourAmt);
  }
  function skinStrip(src, px, w, h, y0, y1, margin, r, rc, eps, amount, colourAmt) {
    const ys = Math.max(0, y0 - margin), ye = Math.min(h, y1 + margin), sh = ye - ys, n = w * sh;
    const F = () => new Float32Array(n);
    const lum = F(), mask = F(), cR = F(), cG = F(), cB = F(), tmp = F(), p1 = F(), p2 = F(), p3 = F(), p4 = F(), p5 = F();
    for (let i = 0; i < n; i++) {
      const o = (ys * w + i) * 4, rr = src[o] / 255, gg = src[o + 1] / 255, bb = src[o + 2] / 255;
      const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      lum[i] = l; mask[i] = skinProbability(rr, gg, bb);
      cR[i] = rr - l; cG[i] = gg - l; cB[i] = bb - l;
    }
    boxF(mask, p1, w, sh, r, tmp);
    for (let i = 0; i < n; i++) mask[i] = clamp(Math.min(mask[i], p1[i] * 1.15), 0, 1);
    boxF(lum, p1, w, sh, r, tmp);
    for (let i = 0; i < n; i++) p3[i] = lum[i] * lum[i];
    boxF(p3, p2, w, sh, r, tmp);
    for (let i = 0; i < n; i++) { const v = p2[i] - p1[i] * p1[i], ai = v / (v + eps); p3[i] = ai; p4[i] = p1[i] - ai * p1[i]; }
    boxF(p3, p1, w, sh, r, tmp);
    boxF(p4, p2, w, sh, r, tmp);
    boxF(mask, p4, w, sh, rc, tmp);
    for (const ch of [cR, cG, cB]) {
      for (let i = 0; i < n; i++) p3[i] = ch[i] * mask[i];
      boxF(p3, p5, w, sh, rc, tmp);
      for (let i = 0; i < n; i++) { const ws = p4[i]; if (ws > 0.05) ch[i] += (p5[i] / ws - ch[i]) * colourAmt * mask[i]; }
    }
    const from = (y0 - ys) * w, to = (y1 - ys) * w;
    for (let i = from; i < to; i++) {
      const m = mask[i];
      if (m <= 0.01) continue;
      const l = lum[i], nl = l + (p1[i] * l + p2[i] - l) * amount * m, o = (ys * w + i) * 4;
      px[o] = to8(nl + cR[i]); px[o + 1] = to8(nl + cG[i]); px[o + 2] = to8(nl + cB[i]);
    }
  }

  // ------------------------------------------------------------------ glow
  function applyGlow(img, p) {
    const { w, h, data: px } = img, long = Math.max(w, h);
    const f = Math.max(1, ((long + 1023) / 1024) | 0), sw = Math.max(1, (w / f) | 0), sh = Math.max(1, (h / f) | 0), n = sw * sh;
    const gr = new Float32Array(n), gg = new Float32Array(n), gb = new Float32Array(n);
    const th = p.glowThreshold / 100, warm = p.glowWarmth / 100, style = p.glowStyle;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      const y0 = y * f, x0 = x * f;
      for (let yy = y0; yy < Math.min(h, y0 + f); yy++) for (let xx = x0; xx < Math.min(w, x0 + f); xx++) {
        const o = (yy * w + xx) * 4; r += px[o] / 255; g += px[o + 1] / 255; b += px[o + 2] / 255; c++;
      }
      r /= c; g /= c; b /= c;
      const l = luma(r, g, b), k = y * sw + x;
      if (style === 1) { const m = smooth(th, Math.min(1, th + 0.2), l) * l; gr[k] = m; gg[k] = m * (0.22 + 0.25 * (1 - warm)); gb[k] = m * 0.08; }
      else if (style === 2) { const m = 0.35 + 0.65 * smooth(th - 0.4, th + 0.1, l); gr[k] = r * m; gg[k] = g * m; gb[k] = b * m; }
      else { const m = smooth(th - 0.1, Math.min(1, th + 0.15), l); gr[k] = r * m * (1 + 0.25 * warm); gg[k] = g * m * (1 + 0.05 * warm); gb[k] = b * m * (1 - 0.25 * warm); }
    }
    const radius = Math.max(1, Math.round(Math.max(sw, sh) * (0.004 + 0.05 * p.glowSize / 100)));
    const tmp = new Float32Array(n);
    for (const plane of [gr, gg, gb]) for (let k = 0; k < 3; k++) boxF(plane, plane, sw, sh, radius, tmp);
    const amt = p.glow / 100 * (style === 1 ? 2.4 : style === 2 ? 0.75 : 1.25);
    const sx = (sw - 1) / Math.max(1, w - 1), sy = (sh - 1) / Math.max(1, h - 1);
    const bil = (pl, a, b, c, d, tx, ty) => { const top = pl[a] + (pl[b] - pl[a]) * tx, bot = pl[c] + (pl[d] - pl[c]) * tx; return top + (bot - top) * ty; };
    for (let y = 0; y < h; y++) {
      const fy = y * sy, y0 = clamp(fy | 0, 0, sh - 1), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = x * sx, x0 = clamp(fx | 0, 0, sw - 1), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const a = y0 * sw + x0, b2 = y0 * sw + x1, c = y1 * sw + x0, d = y1 * sw + x1, o = (y * w + x) * 4;
        let r = px[o] / 255, g = px[o + 1] / 255, b = px[o + 2] / 255;
        const lr = clamp(bil(gr, a, b2, c, d, tx, ty) * amt, 0, 1), lg = clamp(bil(gg, a, b2, c, d, tx, ty) * amt, 0, 1), lb = clamp(bil(gb, a, b2, c, d, tx, ty) * amt, 0, 1);
        if (style === 2) { const k = 0.35 * amt; r += (0.5 - r) * k * 0.25; g += (0.5 - g) * k * 0.25; b += (0.5 - b) * k * 0.25; }
        px[o] = to8(1 - (1 - r) * (1 - lr)); px[o + 1] = to8(1 - (1 - g) * (1 - lg)); px[o + 2] = to8(1 - (1 - b) * (1 - lb));
      }
    }
  }

  // ------------------------------------------------------------------ grain + vignette
  function hashNoise(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h & 0xFFFF) / 32767.5 - 1;
  }
  function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hashNoise(xi, yi), b = hashNoise(xi + 1, yi), c = hashNoise(xi, yi + 1), d = hashNoise(xi + 1, yi + 1);
    const top = a + (b - a) * u, bottom = c + (d - c) * u;
    return clamp((top + (bottom - top) * v) * 1.6, -1, 1);
  }
  function finishPass(img, p) {
    const { w, h, data: px } = img, long = Math.max(w, h);
    const amp = (p.grain === 1 || p.grain === 2) ? 0.035 : (p.grain === 3 || p.grain === 4) ? 0.07 : 0;
    const large = p.grain === 2 || p.grain === 4;
    const cell = long / 2400 * (large ? 2.4 : 1.2), freq = 1 / Math.max(cell, 1);
    const v = p.vignette / 100, cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / cy;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        let r = px[o] / 255, g = px[o + 1] / 255, b = px[o + 2] / 255;
        if (v !== 0) { const dx = (x - cx) / cx, d2 = (dx * dx + dy * dy) * 0.5, vm = 1 + v * 0.8 * smooth(0.1, 1, d2); r *= vm; g *= vm; b *= vm; }
        if (amp > 0) {
          const l = clamp(luma(r, g, b), 0, 1), nz = cell <= 1 ? hashNoise(x, y) : valueNoise(x * freq, y * freq);
          const dd = nz * amp * (0.35 + 2.6 * l * (1 - l));
          r += dd; g += dd; b += dd;
        }
        px[o] = to8(r); px[o + 1] = to8(g); px[o + 2] = to8(b);
      }
    }
  }

  // ------------------------------------------------------------------ public
  /** Renders [src] with [p]. Returns a new image. */
  E.render = function (src, p, stats, detail = true) {
    const img = E.applyGeometry(src, p);
    colorPass(img, prepare(p, stats), clamp(p.sim, 0, M.FILM_SIMS.length - 1));
    if (detail) applyDetail(img, p);
    if (p.glow > 0) applyGlow(img, p);
    if (p.grain > 0 || p.vignette !== 0) finishPass(img, p);
    return img;
  };

  /** Colour as it enters the curves (curve eyedropper). [geo] already has crop/rotation applied. */
  E.samplePreCurve = function (geo, p, stats, fx, fy) {
    const cx = clamp((fx * geo.w) | 0, 0, geo.w - 1), cy = clamp((fy * geo.h) | 0, 0, geo.h - 1);
    const x0 = clamp(cx - 2, 0, Math.max(0, geo.w - 5)), y0 = clamp(cy - 2, 0, Math.max(0, geo.h - 5));
    const cw = Math.min(5, geo.w - x0), chh = Math.min(5, geo.h - y0);
    const crop = E.newImage(cw, chh);
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) for (let k = 0; k < 4; k++) crop.data[(y * cw + x) * 4 + k] = geo.data[((y + y0) * geo.w + x + x0) * 4 + k];
    const pre = M.withoutGeometry(M.copy(p, {
      curveY: [0, 0, 1, 1], curveR: [0, 0, 1, 1], curveG: [0, 0, 1, 1], curveB: [0, 0, 1, 1],
      softLow: 0, softHigh: 100, softLS: 0, softLink: false,
      softRGB: Array.from({ length: 12 }, (_, i) => i % 4 === 1 ? 100 : i % 4 === 3 ? M.softValue(p, (i / 4) | 0, 3) : 0),
      saturation: 0, vibrance: 0, color: 0, colorChrome: 0, colorChromeBlue: 0,
      hslHue: [0, 0, 0, 0, 0, 0, 0, 0], hslSat: [0, 0, 0, 0, 0, 0, 0, 0], hslLum: [0, 0, 0, 0, 0, 0, 0, 0],
      fade: 0, vignette: 0, grain: 0, glow: 0,
    }));
    const out = E.render(crop, pre, stats, false);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < out.data.length; i += 4) { r += out.data[i]; g += out.data[i + 1]; b += out.data[i + 2]; }
    const n = (out.data.length / 4) * 255;
    return [r / n, g / n, b / n];
  };

  /** 64-bin histograms (Y, R, G, B), each scaled so its tallest bin is 1. */
  E.histogram = function (img, bins = 64) {
    const { w, h, data } = img, step = Math.max(1, (Math.max(w, h) / 400) | 0);
    const hy = new Float32Array(bins), hr = new Float32Array(bins), hg = new Float32Array(bins), hb = new Float32Array(bins);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4, r = data[o], g = data[o + 1], b = data[o + 2];
      hr[(r * bins) >> 8]++; hg[(g * bins) >> 8]++; hb[(b * bins) >> 8]++;
      hy[(clamp((r * 77 + g * 150 + b * 29) >> 8, 0, 255) * bins) >> 8]++;
    }
    const norm = a => { let mx = 1; for (let i = 1; i < bins - 1; i++) mx = Math.max(mx, a[i]); return Array.from(a, v => Math.min(v / mx, 1)); };
    return { y: norm(hy), r: norm(hr), g: norm(hg), b: norm(hb) };
  };

  /** Output sharpening (unsharp mask on brightness only), as in Exporter.kt. */
  E.outputSharpen = function (img, kind, level) {
    const amounts = { Screen: [0.35, 0.55, 0.8], Matte: [0.6, 0.9, 1.25], Glossy: [0.45, 0.7, 1.0] }[kind];
    if (!amounts) return;
    const k = amounts[clamp(level, 0, 2)], { w, h, data: d } = img;
    if (w < 3 || h < 3) return;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - 1) * w, yc = y * w, yb = Math.min(h - 1, y + 1) * w;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
        const mean = (lum[ya + x0] + lum[ya + x] + lum[ya + x1] + lum[yc + x0] + lum[yc + x] + lum[yc + x1] + lum[yb + x0] + lum[yb + x] + lum[yb + x1]) / 9;
        const delta = (lum[yc + x] - mean) * k, o = (yc + x) * 4;
        d[o] = Math.round(d[o] + delta); d[o + 1] = Math.round(d[o + 1] + delta); d[o + 2] = Math.round(d[o + 2] + delta);
      }
    }
  };

  G.FDE = E;
})(typeof self !== 'undefined' ? self : this);
