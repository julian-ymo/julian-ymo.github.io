/* Film Desk web — render worker. Keeps the edited photo here so the page never freezes while rendering. */
'use strict';
importScripts('model.js?v=5', 'engine.js?v=5', 'raw.js?v=5');
const M = self.FDM, E = self.FDE;

let src = null, half = null, stats = null, geoKey = null, geoImg = null;

/** Area-average downscale (or bilinear when growing). */
function resize(img, tw, th) {
  const { w, h, data } = img;
  if (tw === w && th === h) return img;
  const out = E.newImage(tw, th), od = out.data;
  if (tw > w || th > h) {
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * w / tw - 0.5)), fy = Math.min(h - 1, Math.max(0, (y + 0.5) * h / th - 0.5));
      const ix = fx | 0, iy = fy | 0, ix1 = Math.min(w - 1, ix + 1), iy1 = Math.min(h - 1, iy + 1), tx = fx - ix, ty = fy - iy, o = (y * tw + x) * 4;
      for (let k = 0; k < 3; k++) {
        const a = data[(iy * w + ix) * 4 + k], b = data[(iy * w + ix1) * 4 + k], c = data[(iy1 * w + ix) * 4 + k], d = data[(iy1 * w + ix1) * 4 + k];
        od[o + k] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
      }
      od[o + 3] = 255;
    }
    return out;
  }
  const sx = w / tw, sy = h / th;
  const acc = new Float64Array(tw * 3), wsum = new Float64Array(tw);
  // Precompute horizontal spans.
  const x0s = new Int32Array(tw), x1s = new Int32Array(tw);
  for (let x = 0; x < tw; x++) { x0s[x] = Math.floor(x * sx); x1s[x] = Math.max(x0s[x] + 1, Math.min(w, Math.floor((x + 1) * sx))); }
  for (let y = 0; y < th; y++) {
    acc.fill(0); wsum.fill(0);
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * sy)));
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * w * 4;
      for (let x = 0; x < tw; x++) {
        let r = 0, g = 0, b = 0;
        for (let xx = x0s[x]; xx < x1s[x]; xx++) { const o = row + xx * 4; r += data[o]; g += data[o + 1]; b += data[o + 2]; }
        acc[x * 3] += r; acc[x * 3 + 1] += g; acc[x * 3 + 2] += b; wsum[x] += x1s[x] - x0s[x];
      }
    }
    for (let x = 0; x < tw; x++) {
      const o = (y * tw + x) * 4, n = wsum[x];
      od[o] = acc[x * 3] / n; od[o + 1] = acc[x * 3 + 1] / n; od[o + 2] = acc[x * 3 + 2] / n; od[o + 3] = 255;
    }
  }
  return out;
}

const pack = img => ({ w: img.w, h: img.h, buf: img.data.buffer });
const unpack = o => ({ w: o.w, h: o.h, data: new Uint8ClampedArray(o.buf) });

self.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'source': {
        src = unpack(m.img);
        stats = E.computeStats(src);
        const k = 0.5;
        half = Math.max(src.w, src.h) > 900 ? resize(src, Math.max(1, Math.round(src.w * k)), Math.max(1, Math.round(src.h * k))) : null;
        geoKey = null; geoImg = null;
        self.postMessage({ type: 'stats', id: m.id, stats });
        break;
      }
      case 'render': {
        if (!src) return;
        const base = m.fast && half ? half : src;
        const p = m.crop ? M.cropBase(m.params) : m.params;
        const out = E.render(base, p, stats, true);
        const res = { type: 'rendered', seq: m.seq, fast: !!m.fast, crop: !!m.crop, params: m.params, img: pack(out) };
        const transfer = [out.data.buffer];
        if (m.hist) res.hist = E.histogram(out);
        if (m.orig) {
          const orig = E.applyGeometry(src, p);
          res.orig = pack(orig); transfer.push(orig.data.buffer);
        }
        self.postMessage(res, transfer);
        break;
      }
      case 'sample': {
        if (!src) return;
        const key = JSON.stringify(M.GEO_KEYS.map(k => m.params[k]));
        if (key !== geoKey) { geoImg = E.applyGeometry(src, m.params); geoKey = key; }
        self.postMessage({ type: 'sampled', seq: m.seq, rgb: E.samplePreCurve(geoImg, m.params, stats, m.fx, m.fy) });
        break;
      }
      case 'thumbs': {
        // Renders one small picture with several settings (film strip, recipe cards, studio grid).
        const img = unpack(m.img), st = m.stats || E.computeStats(img);
        m.list.forEach((p, i) => {
          const out = E.render(img, p, st, !!m.detail);
          self.postMessage({ type: 'thumb', job: m.job, index: i, key: m.keys ? m.keys[i] : i, img: pack(out) }, [out.data.buffer]);
        });
        self.postMessage({ type: 'thumbsDone', job: m.job });
        break;
      }
      case 'export': {
        const img = unpack(m.img), st = m.stats || E.computeStats(img);
        let out = E.render(img, m.params, st, true);
        if (out.w !== m.tw || out.h !== m.th) out = resize(out, m.tw, m.th);
        if (m.sharpen && m.sharpen !== 'Off') E.outputSharpen(out, m.sharpen, m.sharpenLevel);
        self.postMessage({ type: 'exported', job: m.job, img: pack(out) }, [out.data.buffer]);
        break;
      }
      case 'raw': {
        // Develops a camera RAW (LibRaw → WebAssembly), then fits it into maxEdge if asked.
        FDR.develop(new Uint8Array(m.buf), m.maxEdge || 0).then(img => {
          let out = img;
          if (m.fit && Math.max(img.w, img.h) > m.fit) {
            const k = m.fit / Math.max(img.w, img.h);
            out = resize(img, Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)));
          }
          self.postMessage({ type: 'rawDone', job: m.job, img: pack(out), fullW: img.fullW, fullH: img.fullH }, [out.data.buffer]);
        }).catch(err => self.postMessage({ type: 'error', job: m.job, message: String(err && err.message || err) }));
        break;
      }
      case 'resize': {
        const out = resize(unpack(m.img), m.tw, m.th);
        self.postMessage({ type: 'resized', job: m.job, img: pack(out), stats: E.computeStats(out) }, [out.data.buffer]);
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', job: m.job, seq: m.seq, message: String(err && err.message || err) });
  }
};
