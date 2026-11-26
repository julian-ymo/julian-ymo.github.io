# Film Desk — web version

The Film Desk Android app, running in the browser on PCs, tablets and phones.
Ported from the latest Android build (branch `fix/build-errors`, Nov 23 2026).

**Open it:** https://julian-ymo.github.io/Film-Desk/

- **RAW** — camera RAW files (Fujifilm RAF, DNG, CR2/CR3, NEF, ARW, ORF, RW2…) develop like in the app: LibRaw, camera white balance, camera-based exposure with a soft highlight shoulder. RAW badge in the Studio, camera info kept on export.
- **Studio** — import photos (button, drag and drop, or paste), filters, select, copy/paste edits, recipes, batch export (ZIP), reset, remove with undo.
- **Film** — 20 film simulations with live thumbnails of your photo, strength, hold to compare.
- **Q Menu** — every Fujifilm setting as round dials: exposure, grain, Color Chrome / FX Blue, white balance + WB shift pad, DR, D-Range Priority, highlight/shadow, colour, sharpness, NR, clarity, mono WC/MG, smooth skin.
- **Pro** — light, colour, 8-band HSL, vignette, glow (glow / halation / mist), and a Resolve-style **Curve** editor (YRGB, intensity, soft clip, histogram, eyedropper).
- **Crop** — free and locked ratios, drag handles, straighten ruler, composition guides, rotate, flip, pinch/wheel zoom.
- **Export** — JPEG / PNG / WebP, size modes, file-size limit, output sharpening, EXIF (camera info, location, copyright, embedded recipe), watermark, presets.

Recipes use the same text format as the Android app, so they can be shared both ways.
Photos never leave the device: everything runs locally (IndexedDB storage, Web Workers for rendering).

The image engine (`engine.js`) is a line-by-line port of `engine/ImageEngine.kt`; the film look is baked into a
49³ lookup table per simulation for speed (within 1–4 levels of the exact maths).

Icons: Material Icons by Google (Apache License 2.0), subset.

RAW support uses [LibRaw](https://www.libraw.org) 0.22.3 (CDDL 1.0, see `LibRaw-LICENSE.CDDL`), the same source as the Android
app (`app/src/main/cpp/LibRaw` on the `fix/build-errors` branch), compiled unchanged to WebAssembly (`libraw.wasm`) with
`raw_wasm.cpp` as the bridge (a port of the app's `raw_jni.cpp`). Built with clang 18, wasi-sdk 27's sysroot and LLVM 20.1.8's
libc++abi / libunwind for WebAssembly exceptions.
