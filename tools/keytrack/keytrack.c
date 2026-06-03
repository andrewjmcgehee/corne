/*
 * keytrack — passive, aggregate-only keystroke statistics for keyboard-layout design.
 *
 * Listens to the global keyboard via a CGEventTap in listen-only mode. It never
 * modifies, delays, or consumes events, so it cannot slow down your typing.
 *
 * It stores ONLY aggregate counters:
 *   - per-key press frequency
 *   - bigrams (how often key B follows key A within a typing burst)
 *   - chord candidates (pairs pressed near-simultaneously with overlap)
 *   - modifier press counts and shortcut (ctrl/alt/cmd + key) frequencies
 *   - hold-duration and inter-key-interval histograms
 * It never records the ordered stream of keys, so the data cannot be
 * reconstructed back into the text you typed.
 *
 * Build:  clang -O2 -Wall keytrack.c -o keytrack \
 *             -framework ApplicationServices -framework CoreFoundation
 *
 * SPDX-License-Identifier: MIT
 */

#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <signal.h>
#include <time.h>
#include <sys/stat.h>

/* ---- configuration ---------------------------------------------------- */

#define FLUSH_INTERVAL_SEC   30.0
#define CHORD_WINDOW_NS      70000000ULL    /* 70ms: presses this close + overlapping = combo candidate */
#define PAUSE_NS             1500000000ULL  /* gaps longer than 1.5s don't count as a bigram/interval   */
#define HOLD_CAP_MS          500
#define IVAL_CAP_MS          1000
#define BUCKET_MS            10
#define NHOLD                (HOLD_CAP_MS / BUCKET_MS + 1)   /* 51 */
#define NIVAL                (IVAL_CAP_MS / BUCKET_MS + 1)   /* 101 */

/* modifier bits (also the index into mod_counts via the bit position) */
#define M_SHIFT 1u
#define M_CTRL  2u
#define M_ALT   4u
#define M_CMD   8u
#define M_FN    16u
#define NMASK   32   /* all combinations of the 5 modifier bits */

/* ---- persistent aggregate state (fixed arrays; no hashing needed) ----- */

static uint64_t key_counts[256];
static uint64_t bigrams[256 * 256];        /* index: prev*256 + cur (ordered)      */
static uint64_t chords[256 * 256];         /* index: lo*256 + hi   (unordered)     */
static uint64_t shortcuts[NMASK * 256];    /* index: mask*256 + keycode            */
static uint64_t mod_counts[5];             /* shift, ctrl, alt, cmd, fn            */
static uint64_t hold_hist[NHOLD];
static uint64_t ival_hist[NIVAL];
static uint64_t pk_hold_sum[256];
static uint64_t pk_hold_cnt[256];
static uint64_t total_keydowns;
static char     since_iso[32];

/* ---- transient state (not persisted) ---------------------------------- */

static uint64_t held[256];   /* down-timestamp in ns, 0 = not currently held */
static int      last_kc = -1;
static uint64_t last_kd_t;
static uint32_t prev_mask;

static CFMachPortRef g_tap;
static char          g_path[1024];

/* ---- helpers ---------------------------------------------------------- */

static uint64_t now_ns(void) { return clock_gettime_nsec_np(CLOCK_UPTIME_RAW); }

static int bucket_idx(int ms, int cap) {
    if (ms < 0) ms = 0;
    if (ms > cap) ms = cap;
    return ms / BUCKET_MS;
}

static uint32_t mask_from_flags(CGEventFlags f) {
    uint32_t m = 0;
    if (f & kCGEventFlagMaskShift)       m |= M_SHIFT;
    if (f & kCGEventFlagMaskControl)     m |= M_CTRL;
    if (f & kCGEventFlagMaskAlternate)   m |= M_ALT;
    if (f & kCGEventFlagMaskCommand)     m |= M_CMD;
    if (f & kCGEventFlagMaskSecondaryFn) m |= M_FN;
    return m;
}

/* ---- persistence (simple line-based text; trivial to parse in any tool) */

static void save(void) {
    char tmp[1100];
    snprintf(tmp, sizeof tmp, "%s.tmp", g_path);
    FILE *fp = fopen(tmp, "w");
    if (!fp) { perror("keytrack: open for write"); return; }

    fprintf(fp, "keytrack 1\n");
    fprintf(fp, "since %s\n", since_iso);
    fprintf(fp, "total %llu\n", (unsigned long long)total_keydowns);

    for (int i = 0; i < 256; i++)
        if (key_counts[i]) fprintf(fp, "k %d %llu\n", i, (unsigned long long)key_counts[i]);
    for (int i = 0; i < 256 * 256; i++)
        if (bigrams[i]) fprintf(fp, "b %d %d %llu\n", i >> 8, i & 255, (unsigned long long)bigrams[i]);
    for (int i = 0; i < 256 * 256; i++)
        if (chords[i]) fprintf(fp, "c %d %d %llu\n", i >> 8, i & 255, (unsigned long long)chords[i]);
    for (int i = 0; i < NMASK * 256; i++)
        if (shortcuts[i]) fprintf(fp, "s %d %d %llu\n", i >> 8, i & 255, (unsigned long long)shortcuts[i]);
    for (int i = 0; i < 5; i++)
        if (mod_counts[i]) fprintf(fp, "m %d %llu\n", i, (unsigned long long)mod_counts[i]);
    for (int i = 0; i < NHOLD; i++)
        if (hold_hist[i]) fprintf(fp, "h %d %llu\n", i * BUCKET_MS, (unsigned long long)hold_hist[i]);
    for (int i = 0; i < NIVAL; i++)
        if (ival_hist[i]) fprintf(fp, "i %d %llu\n", i * BUCKET_MS, (unsigned long long)ival_hist[i]);
    for (int i = 0; i < 256; i++)
        if (pk_hold_cnt[i]) fprintf(fp, "p %d %llu %llu\n", i,
                                    (unsigned long long)pk_hold_sum[i],
                                    (unsigned long long)pk_hold_cnt[i]);

    if (fclose(fp) != 0) { perror("keytrack: close"); return; }
    if (rename(tmp, g_path) != 0) perror("keytrack: rename");
}

static void load(void) {
    FILE *fp = fopen(g_path, "r");
    if (!fp) return;  /* fresh start */
    char *line = NULL; size_t cap = 0; ssize_t n;
    while ((n = getline(&line, &cap, fp)) > 0) {
        int a, b; unsigned long long v, w;
        if      (sscanf(line, "since %31s", since_iso) == 1) {}
        else if (sscanf(line, "total %llu", &v) == 1) total_keydowns = v;
        else if (sscanf(line, "k %d %llu", &a, &v) == 2 && a >= 0 && a < 256) key_counts[a] = v;
        else if (sscanf(line, "b %d %d %llu", &a, &b, &v) == 3) bigrams[(a & 255) * 256 + (b & 255)] = v;
        else if (sscanf(line, "c %d %d %llu", &a, &b, &v) == 3) chords[(a & 255) * 256 + (b & 255)] = v;
        else if (sscanf(line, "s %d %d %llu", &a, &b, &v) == 3 && a >= 0 && a < NMASK) shortcuts[a * 256 + (b & 255)] = v;
        else if (sscanf(line, "m %d %llu", &a, &v) == 2 && a >= 0 && a < 5) mod_counts[a] = v;
        else if (sscanf(line, "h %d %llu", &a, &v) == 2) { int idx = a / BUCKET_MS; if (idx >= 0 && idx < NHOLD) hold_hist[idx] = v; }
        else if (sscanf(line, "i %d %llu", &a, &v) == 2) { int idx = a / BUCKET_MS; if (idx >= 0 && idx < NIVAL) ival_hist[idx] = v; }
        else if (sscanf(line, "p %d %llu %llu", &a, &v, &w) == 3 && a >= 0 && a < 256) { pk_hold_sum[a] = v; pk_hold_cnt[a] = w; }
    }
    free(line);
    fclose(fp);
}

/* ---- event handling --------------------------------------------------- */

static void on_keydown(int kc, CGEventFlags f, int is_repeat, uint64_t now) {
    if (is_repeat || kc < 0 || kc >= 256) return;

    total_keydowns++;
    key_counts[kc]++;

    /* sequential bigram + inter-key interval, only within a typing burst */
    if (last_kc >= 0 && last_kd_t && now - last_kd_t < PAUSE_NS) {
        bigrams[last_kc * 256 + kc]++;
        ival_hist[bucket_idx((int)((now - last_kd_t) / 1000000ULL), IVAL_CAP_MS)]++;
    }

    /* chord candidates: other keys still held that went down very recently */
    for (int o = 0; o < 256; o++) {
        if (o != kc && held[o] && now - held[o] < CHORD_WINDOW_NS) {
            int lo = o < kc ? o : kc, hi = o < kc ? kc : o;
            chords[lo * 256 + hi]++;
        }
    }

    /* shortcut / control sequence (a non-shift modifier is held) */
    uint32_t mask = mask_from_flags(f);
    if (mask & (M_CTRL | M_ALT | M_CMD)) shortcuts[mask * 256 + kc]++;

    held[kc] = now;
    last_kc = kc;
    last_kd_t = now;
}

static void on_keyup(int kc, uint64_t now) {
    if (kc < 0 || kc >= 256 || !held[kc]) return;
    int ms = (int)((now - held[kc]) / 1000000ULL);
    hold_hist[bucket_idx(ms, HOLD_CAP_MS)]++;
    pk_hold_sum[kc] += ms < 0 ? 0 : (uint64_t)ms;
    pk_hold_cnt[kc]++;
    held[kc] = 0;
}

static void on_flags(CGEventFlags f) {
    uint32_t m = mask_from_flags(f);
    for (int i = 0; i < 5; i++) {
        uint32_t bit = 1u << i;
        if ((m & bit) && !(prev_mask & bit)) mod_counts[i]++;
    }
    prev_mask = m;
}

static CGEventRef tap_cb(CGEventTapProxy proxy, CGEventType type, CGEventRef e, void *ctx) {
    (void)proxy; (void)ctx;
    uint64_t now = now_ns();
    switch (type) {
    case kCGEventKeyDown:
        on_keydown((int)CGEventGetIntegerValueField(e, kCGKeyboardEventKeycode),
                   CGEventGetFlags(e),
                   (int)CGEventGetIntegerValueField(e, kCGKeyboardEventAutorepeat), now);
        break;
    case kCGEventKeyUp:
        on_keyup((int)CGEventGetIntegerValueField(e, kCGKeyboardEventKeycode), now);
        break;
    case kCGEventFlagsChanged:
        on_flags(CGEventGetFlags(e));
        break;
    case kCGEventTapDisabledByTimeout:
    case kCGEventTapDisabledByUserInput:
        if (g_tap) CGEventTapEnable(g_tap, true);  /* macOS can disable us; re-arm */
        break;
    default:
        break;
    }
    return e;  /* listen-only: return value is ignored, but pass the event through */
}

/* ---- run loop plumbing ------------------------------------------------ */

static void flush_timer_cb(CFRunLoopTimerRef t, void *info) { (void)t; (void)info; save(); }

static void handle_signal(int sig) { (void)sig; CFRunLoopStop(CFRunLoopGetMain()); }

int main(void) {
    const char *dir = getenv("KEYTRACK_DIR");
    char dirbuf[1024];
    if (!dir) {
        const char *home = getenv("HOME");
        snprintf(dirbuf, sizeof dirbuf, "%s/.local/share/keytrack", home ? home : ".");
        dir = dirbuf;
    }
    snprintf(g_path, sizeof g_path, "%s/stats.txt", dir);

    /* mkdir -p the data dir */
    char mk[1100];
    snprintf(mk, sizeof mk, "%s", dir);
    for (char *p = mk + 1; *p; p++) {
        if (*p == '/') { *p = 0; mkdir(mk, 0755); *p = '/'; }
    }
    mkdir(mk, 0755);

    load();
    if (since_iso[0] == 0) {
        time_t now = time(NULL); struct tm tm;
        gmtime_r(&now, &tm);
        strftime(since_iso, sizeof since_iso, "%Y-%m-%dT%H:%M:%SZ", &tm);
    }

    CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) |
                       CGEventMaskBit(kCGEventKeyUp) |
                       CGEventMaskBit(kCGEventFlagsChanged);

    g_tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                             kCGEventTapOptionListenOnly, mask, tap_cb, NULL);
    if (!g_tap) {
        fprintf(stderr,
            "keytrack: could not create event tap — Input Monitoring permission is required.\n"
            "  Grant it in: System Settings -> Privacy & Security -> Input Monitoring\n"
            "  (add the keytrack binary), then run it again.\n");
        return 1;
    }

    CFRunLoopSourceRef src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_tap, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), src, kCFRunLoopCommonModes);
    CGEventTapEnable(g_tap, true);

    CFRunLoopTimerRef timer = CFRunLoopTimerCreate(
        kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + FLUSH_INTERVAL_SEC,
        FLUSH_INTERVAL_SEC, 0, 0, flush_timer_cb, NULL);
    CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes);

    signal(SIGTERM, handle_signal);
    signal(SIGINT,  handle_signal);

    fprintf(stderr, "keytrack: running (stats -> %s)\n", g_path);
    CFRunLoopRun();          /* blocks until a signal stops the loop */

    save();                  /* final flush in normal (async-safe) context */
    fprintf(stderr, "keytrack: stopped, stats saved.\n");
    return 0;
}
