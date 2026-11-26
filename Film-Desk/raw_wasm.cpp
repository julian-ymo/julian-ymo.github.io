// Film Desk web — RAW bridge. Same develop as the Android app's raw_jni.cpp (LibRaw, camera WB,
// sRGB, camera-based exposure + auto gain, soft highlight shoulder, gentle S-curve), but reading
// the file from memory and writing RGBA for the browser.
#include <cstdint>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <vector>
#include "libraw/libraw.h"

#define EXPORT extern "C" __attribute__((visibility("default")))

namespace {

LibRaw *g_raw = nullptr;
uint8_t *g_out = nullptr;
int g_info[8];

void closeAll() {
    delete g_raw; g_raw = nullptr;
    free(g_out); g_out = nullptr;
}

LibRaw *openRaw(const void *buf, size_t len, int *err) {
    auto *raw = new LibRaw();
    int r = raw->open_buffer(buf, len);
    if (r != LIBRAW_SUCCESS) { *err = r; delete raw; return nullptr; }
    return raw;
}

float metadataEv(const LibRaw *raw) {
    float ev = -raw->imgdata.makernotes.common.ExposureCalibrationShift;
    float dng = raw->imgdata.color.dng_levels.baseline_exposure;
    if (dng > -10.f && dng < 10.f) ev += dng;
    if (!(ev > -1.f)) ev = -1.f;
    if (ev > 3.f) ev = 3.f;
    return ev;
}

double photoGain(const LibRaw *raw) {
    const auto &sz = raw->imgdata.sizes;
    const size_t n = (size_t) sz.width * sz.height;
    auto image = raw->imgdata.image;
    std::vector<unsigned> hist(4096, 0);
    for (size_t i = 0; i < n; i += 3) {
        unsigned m = image[i][0];
        if (image[i][1] > m) m = image[i][1];
        if (image[i][2] > m) m = image[i][2];
        hist[m >> 4]++;
    }
    size_t total = (n + 2) / 3, limit = total / 100, acc = 0;
    int p99 = 4095;
    for (; p99 > 0; p99--) { acc += hist[p99]; if (acc > limit) break; }
    double bright = (p99 + 0.5) / 4096.0;
    double autoGain = 0.9 / (bright > 1e-4 ? bright : 1e-4);
    if (autoGain < 1.0) autoGain = 1.0;
    if (autoGain > 8.0) autoGain = 8.0;
    double meta = std::pow(2.0, metadataEv(raw));
    return meta > autoGain ? meta : autoGain;
}

std::vector<uint8_t> toneTable(double gain) {
    std::vector<uint8_t> lut(65536);
    const double knee = 0.8, top = gain, a = 1.0 / (1.0 - knee);
    const double norm = top > knee ? 1.0 - std::exp(-a * (top - knee)) : 1.0;
    const double contrast = 0.12;
    for (int i = 0; i < 65536; i++) {
        double x = i / 65535.0 * gain;
        if (x > knee) x = knee + (1.0 - knee) * (1.0 - std::exp(-a * (x - knee))) / norm;
        if (x > 1.0) x = 1.0;
        double y = x <= 0.0031308 ? 12.92 * x : 1.055 * std::pow(x, 1.0 / 2.4) - 0.055;
        y = y - contrast * std::sin(2.0 * M_PI * y) / (2.0 * M_PI);
        int v = (int) std::lround(y * 255.0);
        lut[i] = (uint8_t) (v < 0 ? 0 : v > 255 ? 255 : v);
    }
    return lut;
}

}  // namespace

EXPORT void *fd_malloc(size_t n) { return malloc(n); }
EXPORT void fd_free(void *p) { free(p); }
EXPORT const char *fd_strerror(int e) { return libraw_strerror(e); }

/** Output size and orientation, without developing: [w, h, flip, iso, make/model are in fd_camera]. */
EXPORT int *fd_info(const void *buf, size_t len) {
    int err = 0;
    LibRaw *raw = openRaw(buf, len, &err);
    if (!raw) { g_info[0] = 0; g_info[1] = 0; g_info[2] = err; return g_info; }
    raw->adjust_sizes_info_only();
    g_info[0] = raw->imgdata.sizes.iwidth; g_info[1] = raw->imgdata.sizes.iheight; g_info[2] = 0;
    delete raw;
    return g_info;
}

/**
 * Develops the RAW in [buf]. Returns a pointer to [w, h, rgbaPtr, error] (w = 0 on failure).
 * [half] = LibRaw's fast half-size develop. [highlight]: 0 clip, 1 unclip, 2 blend.
 */
EXPORT int *fd_develop(const void *buf, size_t len, int half, int highlight) {
    closeAll();
    g_info[0] = g_info[1] = g_info[2] = g_info[3] = 0;
    int err = 0;
    LibRaw *raw = openRaw(buf, len, &err);
    if (!raw) { g_info[3] = err; return g_info; }
    auto &o = raw->imgdata.params;
    o.use_camera_wb = 1;
    o.use_camera_matrix = 1;
    o.output_color = 1;
    o.output_bps = 8;
    o.gamm[0] = 1.0 / 2.4;
    o.gamm[1] = 12.92;
    o.half_size = half ? 1 : 0;
    o.highlight = highlight;
    o.no_auto_bright = 1;
    o.user_qual = half ? 0 : (raw->imgdata.idata.filters == 9 ? 2 : 3);
    int r = raw->unpack();
    if (r == LIBRAW_SUCCESS) r = raw->dcraw_process();
    if (r != LIBRAW_SUCCESS || !raw->imgdata.image || raw->imgdata.idata.colors < 3) {
        g_info[3] = r ? r : LIBRAW_UNSPECIFIED_ERROR; delete raw; return g_info;
    }
    const auto &sz = raw->imgdata.sizes;
    auto image = raw->imgdata.image;
    const int iw = sz.width, ih = sz.height, flip = sz.flip;
    const int ow = (flip & 4) ? ih : iw, oh = (flip & 4) ? iw : ih;
    std::vector<uint8_t> lut = toneTable(photoGain(raw));
    g_out = (uint8_t *) malloc((size_t) ow * oh * 4);
    if (!g_out) { g_info[3] = LIBRAW_UNSUFFICIENT_MEMORY; delete raw; return g_info; }
    uint8_t *dst = g_out;
    for (int y = 0; y < oh; y++) {
        for (int x = 0; x < ow; x++) {
            int row = y, col = x;
            if (flip & 4) { int t = row; row = col; col = t; }
            if (flip & 2) row = ih - 1 - row;
            if (flip & 1) col = iw - 1 - col;
            const ushort *p = image[(size_t) row * iw + col];
            dst[0] = lut[p[0]]; dst[1] = lut[p[1]]; dst[2] = lut[p[2]]; dst[3] = 255;
            dst += 4;
        }
    }
    // Keep only the finished picture: the RAW work image is big.
    g_raw = raw;
    raw->recycle();
    delete raw; g_raw = nullptr;
    g_info[0] = ow; g_info[1] = oh; g_info[2] = (int) (intptr_t) g_out; g_info[3] = 0;
    return g_info;
}

/** Frees the last developed picture. */
EXPORT void fd_release() { closeAll(); }
