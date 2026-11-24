/* Film Desk web — EXIF read/write (JPEG) and a small ZIP writer for batch export. */
'use strict';
(function (G) {
  const F = {};

  // ------------------------------------------------------------------ EXIF read
  /** Camera info and GPS from a JPEG's EXIF, or null. Values keep their EXIF types. */
  F.readExif = function (buf) {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 4 < v.byteLength) {
      if (v.getUint8(o) !== 0xFF) return null;
      const marker = v.getUint8(o + 1), len = v.getUint16(o + 2);
      if (marker === 0xE1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10, len - 8);
      if (marker === 0xDA) return null;
      o += 2 + len;
    }
    return null;
  };
  function parseTiff(v, t0, len) {
    try {
      const le = v.getUint16(t0) === 0x4949;
      const u16 = o => v.getUint16(t0 + o, le), u32 = o => v.getUint32(t0 + o, le);
      const readIfd = (off) => {
        const out = {}, n = u16(off);
        for (let i = 0; i < n; i++) {
          const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
          const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] || 1, total = size * count;
          const vo = total <= 4 ? e + 8 : u32(e + 8);
          if (vo + total > len) continue;
          let val;
          if (type === 2) { let s = ''; for (let k = 0; k < count; k++) { const c = v.getUint8(t0 + vo + k); if (!c) break; s += String.fromCharCode(c); } val = s.trim(); }
          else if (type === 3) val = count === 1 ? u16(vo) : Array.from({ length: count }, (_, k) => u16(vo + k * 2));
          else if (type === 4) val = count === 1 ? u32(vo) : Array.from({ length: count }, (_, k) => u32(vo + k * 4));
          else if (type === 5 || type === 10) val = Array.from({ length: count }, (_, k) => [u32(vo + k * 8), u32(vo + k * 8 + 4)]);
          else if (type === 1 || type === 7) val = Array.from({ length: Math.min(count, 4) }, (_, k) => v.getUint8(t0 + vo + k));
          out[tag] = { type, val };
        }
        return out;
      };
      const ifd0 = readIfd(u32(4));
      const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769].val) : {};
      const gps = ifd0[0x8825] ? readIfd(ifd0[0x8825].val) : {};
      const pick = (src, tags) => { const r = {}; tags.forEach(t => { if (src[t]) r[t] = src[t]; }); return r; };
      return {
        ifd0: pick(ifd0, [0x010F, 0x0110, 0x0132]),
        exif: pick(exif, [0x829A, 0x829D, 0x8827, 0x9003, 0x9004, 0x920A, 0xA405, 0xA433, 0xA434, 0x9201, 0x9202, 0x9204, 0x9207, 0x9209]),
        gps: pick(gps, [0, 1, 2, 3, 4, 5, 6, 7, 0x1D]),
      };
    } catch (_) { return null; }
  }

  // ------------------------------------------------------------------ EXIF write
  const ascii = s => ({ type: 2, val: s });
  F.ascii = ascii;
  /** Builds a JPEG APP1 EXIF segment. [tags] = { ifd0: {tag: {type,val}}, exif: {...}, gps: {...} }. */
  F.buildExif = function (tags) {
    const enc = new TextEncoder();
    const entryBytes = (e) => {
      const { type, val } = e;
      if (type === 2) { const b = enc.encode(val); const out = new Uint8Array(b.length + 1); out.set(b); return { count: out.length, bytes: out }; }
      if (type === 7) { const b = val instanceof Uint8Array ? val : new Uint8Array(val); return { count: b.length, bytes: b }; }
      if (type === 1) { const a = Array.isArray(val) ? val : [val]; return { count: a.length, bytes: new Uint8Array(a) }; }
      const arr = Array.isArray(val) && !(type === 5 || type === 10) ? val : (type === 5 || type === 10 ? val : [val]);
      const size = { 3: 2, 4: 4, 5: 8, 10: 8 }[type];
      const b = new Uint8Array(size * arr.length), dv = new DataView(b.buffer);
      arr.forEach((x, i) => {
        if (type === 3) dv.setUint16(i * 2, x, true);
        else if (type === 4) dv.setUint32(i * 4, x, true);
        else { dv.setUint32(i * 8, x[0], true); dv.setUint32(i * 8 + 4, x[1], true); }
      });
      return { count: arr.length, bytes: b };
    };
    const layoutIfd = (map) => Object.keys(map).map(Number).sort((a, b) => a - b).map(tag => Object.assign({ tag, type: map[tag].type }, entryBytes(map[tag])));
    const ifd0 = Object.assign({}, tags.ifd0);
    const hasExif = Object.keys(tags.exif || {}).length > 0, hasGps = Object.keys(tags.gps || {}).length > 0;
    if (hasExif) ifd0[0x8769] = { type: 4, val: 0 };
    if (hasGps) ifd0[0x8825] = { type: 4, val: 0 };
    const blocks = [['ifd0', layoutIfd(ifd0)]];
    if (hasExif) blocks.push(['exif', layoutIfd(tags.exif)]);
    if (hasGps) blocks.push(['gps', layoutIfd(tags.gps)]);
    // Offsets: header 8, then each IFD followed by its data area.
    let off = 8;
    const pos = {};
    blocks.forEach(([name, entries]) => {
      pos[name] = off;
      off += 2 + entries.length * 12 + 4;
      entries.forEach(e => { if (e.bytes.length > 4) { e.dataOff = off; off += e.bytes.length + (e.bytes.length & 1); } });
    });
    const tiff = new Uint8Array(off), dv = new DataView(tiff.buffer);
    dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    blocks.forEach(([name, entries]) => {
      let p = pos[name];
      dv.setUint16(p, entries.length, true); p += 2;
      entries.forEach(e => {
        dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true); dv.setUint32(p + 4, e.count, true);
        if (e.tag === 0x8769 && name === 'ifd0') dv.setUint32(p + 8, pos.exif, true);
        else if (e.tag === 0x8825 && name === 'ifd0') dv.setUint32(p + 8, pos.gps, true);
        else if (e.bytes.length > 4) { dv.setUint32(p + 8, e.dataOff, true); tiff.set(e.bytes, e.dataOff); }
        else tiff.set(e.bytes, p + 8);
        p += 12;
      });
      dv.setUint32(p, 0, true);
    });
    const seg = new Uint8Array(10 + tiff.length), sv = new DataView(seg.buffer);
    sv.setUint16(0, 0xFFE1); sv.setUint16(2, 8 + tiff.length);
    seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
    seg.set(tiff, 10);
    return seg;
  };
  /** Inserts an APP1 segment right after the JPEG's SOI. */
  F.insertApp1 = (jpeg, app1) => {
    const out = new Uint8Array(jpeg.length + app1.length);
    out.set(jpeg.subarray(0, 2)); out.set(app1, 2); out.set(jpeg.subarray(2), 2 + app1.length);
    return out;
  };
  F.userComment = text => {
    const b = new TextEncoder().encode(text), out = new Uint8Array(8 + b.length);
    out.set([0x41, 0x53, 0x43, 0x49, 0x49, 0, 0, 0]); out.set(b, 8);
    return { type: 7, val: out };
  };

  // ------------------------------------------------------------------ ZIP (stored)
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  F.zip = function (files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  G.FDF = F;
})(this);
