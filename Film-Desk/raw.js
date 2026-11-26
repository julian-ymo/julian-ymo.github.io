/* Film Desk web — camera RAW (RAF, DNG, CR2/CR3, NEF, ARW, ORF, RW2…) through LibRaw compiled to
 * WebAssembly (libraw.wasm, LibRaw 0.22.3 under its CDDL 1.0 licence). Develops exactly like the
 * Android app's raw_jni.cpp: camera white balance, sRGB, camera-based exposure with a soft
 * highlight shoulder. A fresh instance per photo, so a damaged file can't leave anything behind. */
'use strict';
(function (G) {
  const R = {};
  const EXT = ['raf', 'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'orf', 'rw2', 'raw', 'pef', 'srw', '3fr', 'fff', 'iiq', 'rwl', 'x3f', 'erf', 'kdc', 'dcr', 'mrw', 'mos', 'mef'];
  R.EXTENSIONS = EXT;
  const PLAIN = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/avif'];
  /** True when the file name, type or Fujifilm header says it is a camera RAW. */
  R.isRawName = (name, type) => {
    const t = (type || '').toLowerCase();
    if (PLAIN.includes(t)) return false;
    if (t === 'image/dng' || (t.startsWith('image/x-') && t !== 'image/x-icon' && t !== 'image/x-ms-bmp')) return true;
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return !!m && EXT.includes(m[1].toLowerCase());
  };
  R.isRawHeader = bytes => bytes.length >= 15 && String.fromCharCode.apply(null, bytes.subarray(0, 15)) === 'FUJIFILMCCD-RAW';

  let modulePromise = null;
  R.load = (url) => modulePromise || (modulePromise = (async () => {
    const res = await fetch(url || 'libraw.wasm?v=1');
    if (!res.ok) throw new Error('RAW support could not be loaded');
    return WebAssembly.compile(await res.arrayBuffer());
  })().catch(e => { modulePromise = null; throw e; }));
  R.setModule = m => { modulePromise = Promise.resolve(m); };

  async function instance() {
    const mod = await R.load();
    let mem = null, log = '';
    const ENOSYS = 52, EBADF = 8;
    const wasi = {
      fd_write: (fd, iovs, n, outp) => {
        const v = new DataView(mem.buffer); let total = 0;
        for (let i = 0; i < n; i++) {
          const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
          log += new TextDecoder().decode(new Uint8Array(mem.buffer, p, l)); total += l;
        }
        v.setUint32(outp, total, true); return 0;
      },
      fd_close: () => 0, fd_seek: () => EBADF, fd_read: () => EBADF, fd_fdstat_get: () => EBADF, fd_fdstat_set_flags: () => EBADF,
      fd_prestat_get: () => EBADF, fd_prestat_dir_name: () => EBADF, path_open: () => 44,
      proc_exit: code => { throw new Error('RAW decoder stopped (' + code + ')'); },
    };
    const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: new Proxy(wasi, { get: (o, k) => o[k] || (() => ENOSYS) }) });
    mem = inst.exports.memory;
    if (inst.exports._initialize) inst.exports._initialize();
    return { x: inst.exports, mem: () => mem, log: () => log };
  }

  /**
   * Develops RAW [bytes] (Uint8Array). [maxEdge]: when the photo is at least twice that size, the
   * fast half-size develop is used (as in the app). Returns { w, h, data: Uint8ClampedArray RGBA }.
   */
  R.develop = async function (bytes, maxEdge) {
    const ins = await instance(), x = ins.x;
    const strErr = e => { const p = x.fd_strerror(e); const b = new Uint8Array(ins.mem().buffer, p); let s = ''; for (let i = 0; b[i] && i < 200; i++) s += String.fromCharCode(b[i]); return s; };
    try {
      const ptr = x.fd_malloc(bytes.length);
      if (!ptr) throw new Error('Not enough memory for this RAW file');
      new Uint8Array(ins.mem().buffer, ptr, bytes.length).set(bytes);
      const ip = x.fd_info(ptr, bytes.length);
      const info = new Int32Array(ins.mem().buffer, ip, 3).slice();
      if (!info[0]) throw new Error('Not a RAW file this decoder can read (' + strErr(info[2]) + ')');
      const full = Math.max(info[0], info[1]);
      const half = maxEdge > 0 && maxEdge * 2 <= full ? 1 : 0;
      const rp = x.fd_develop(ptr, bytes.length, half, 2);
      const res = new Int32Array(ins.mem().buffer, rp, 4).slice();
      if (!res[0]) throw new Error('Could not develop this RAW file (' + strErr(res[3]) + ')');
      const w = res[0], h = res[1], p = res[2];
      const data = new Uint8ClampedArray(w * h * 4);
      data.set(new Uint8Array(ins.mem().buffer, p, w * h * 4));
      x.fd_release();
      return { w, h, data, fullW: info[0], fullH: info[1] };
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw new Error('This RAW file could not be read (' + e.message + ')');
      throw e;
    }
  };

  G.FDR = R;
})(typeof self !== 'undefined' ? self : this);
