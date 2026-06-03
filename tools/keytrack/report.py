#!/usr/bin/env python3
"""
keytrack report — turn aggregate keystroke stats into layout-design signal.

Reads the stats file written by the keytrack daemon and prints:
  - most-used keys (home-row candidates)
  - most-common bigrams (rolls / finger travel)
  - chord candidates (keys you already press together -> ZMK combo candidates)
  - modifier + shortcut usage (home-row-mod / layer decisions)
  - hold-duration and inter-key timing percentiles (tapping-term / combo-timeout tuning)

Usage:  python3 report.py [path-to-stats.txt] [--top N]

Stdlib only. Reads, never writes — safe to run anytime while the daemon runs.
"""
import os
import sys

# macOS virtual keycode -> human label (ANSI layout positions).
KEY = {
    0:"a",1:"s",2:"d",3:"f",4:"h",5:"g",6:"z",7:"x",8:"c",9:"v",11:"b",12:"q",
    13:"w",14:"e",15:"r",16:"y",17:"t",18:"1",19:"2",20:"3",21:"4",22:"6",23:"5",
    24:"=",25:"9",26:"7",27:"-",28:"8",29:"0",30:"]",31:"o",32:"u",33:"[",34:"i",
    35:"p",36:"Return",37:"l",38:"j",39:"'",40:"k",41:";",42:"\\",43:",",44:"/",
    45:"n",46:"m",47:".",48:"Tab",49:"Space",50:"`",51:"Bspc",53:"Esc",
    54:"RCmd",55:"Cmd",56:"Shift",57:"Caps",58:"Opt",59:"Ctrl",60:"RShift",
    61:"ROpt",62:"RCtrl",63:"Fn",
    65:"KP.",67:"KP*",69:"KP+",71:"Clear",75:"KP/",76:"KPEnter",78:"KP-",81:"KP=",
    82:"KP0",83:"KP1",84:"KP2",85:"KP3",86:"KP4",87:"KP5",88:"KP6",89:"KP7",
    91:"KP8",92:"KP9",96:"F5",97:"F6",98:"F7",99:"F3",100:"F8",101:"F9",103:"F11",
    105:"F13",107:"F14",109:"F10",111:"F12",113:"F15",114:"Help",115:"Home",
    116:"PgUp",117:"FwdDel",118:"F4",119:"End",120:"F2",121:"PgDn",122:"F1",
    123:"Left",124:"Right",125:"Down",126:"Up",
}
MODS = ["shift", "ctrl", "alt", "cmd", "fn"]  # index == bit position


def kname(kc):
    return KEY.get(kc, f"<{kc}>")


def maskname(mask):
    parts = [m for i, m in enumerate(MODS) if mask & (1 << i)]
    # show in a conventional order
    order = ["cmd", "ctrl", "alt", "shift", "fn"]
    parts.sort(key=lambda p: order.index(p))
    return "+".join(parts) if parts else "(none)"


def load(path):
    d = {"since": "?", "total": 0, "k": {}, "b": {}, "c": {}, "s": {},
         "m": {}, "h": {}, "i": {}, "p": {}}
    with open(path) as fp:
        for line in fp:
            t = line.split()
            if not t:
                continue
            tag = t[0]
            if tag == "since":
                d["since"] = t[1]
            elif tag == "total":
                d["total"] = int(t[1])
            elif tag == "k":
                d["k"][int(t[1])] = int(t[2])
            elif tag == "b":
                d["b"][(int(t[1]), int(t[2]))] = int(t[3])
            elif tag == "c":
                d["c"][(int(t[1]), int(t[2]))] = int(t[3])
            elif tag == "s":
                d["s"][(int(t[1]), int(t[2]))] = int(t[3])
            elif tag == "m":
                d["m"][int(t[1])] = int(t[2])
            elif tag == "h":
                d["h"][int(t[1])] = int(t[2])
            elif tag == "i":
                d["i"][int(t[1])] = int(t[2])
            elif tag == "p":
                d["p"][int(t[1])] = (int(t[2]), int(t[3]))
    return d


def pct(hist, qs):
    """Percentiles from a {bucket_ms: count} histogram."""
    items = sorted(hist.items())
    total = sum(c for _, c in items)
    if total == 0:
        return {q: None for q in qs}
    out, seen, qi = {}, 0, 0
    targets = sorted(qs)
    for bucket, c in items:
        seen += c
        while qi < len(targets) and seen >= targets[qi] / 100 * total:
            out[targets[qi]] = bucket
            qi += 1
    while qi < len(targets):
        out[targets[qi]] = items[-1][0]
        qi += 1
    return out


def bar(n, mx, width=24):
    if mx == 0:
        return ""
    return "█" * max(1, round(n / mx * width)) if n else ""


def section(title):
    print(f"\n\033[1m{title}\033[0m")


def main():
    args = [a for a in sys.argv[1:] if a != "--top"]
    top = 20
    if "--top" in sys.argv:
        i = sys.argv.index("--top")
        if i + 1 < len(sys.argv):
            top = int(sys.argv[i + 1])
            args = [a for a in args if a != str(top)]
    path = args[0] if args else os.path.expanduser("~/.local/share/keytrack/stats.txt")

    if not os.path.exists(path):
        print(f"No stats file at {path}\nIs the keytrack daemon running? See README.md.")
        sys.exit(1)

    d = load(path)
    total = d["total"] or 1

    print(f"keytrack report  ·  since {d['since']}  ·  {d['total']:,} keystrokes")
    print(f"source: {path}")

    # --- key frequency -------------------------------------------------
    section("Most-used keys  (home-row / strong-finger candidates)")
    ks = sorted(d["k"].items(), key=lambda kv: -kv[1])
    mx = ks[0][1] if ks else 0
    for kc, n in ks[:top]:
        print(f"  {kname(kc):>7}  {n:>9,}  {100*n/total:5.1f}%  {bar(n, mx)}")

    # --- bigrams -------------------------------------------------------
    section("Top bigrams  (rolls & finger travel — keep these easy/adjacent)")
    bs = sorted(d["b"].items(), key=lambda kv: -kv[1])
    mx = bs[0][1] if bs else 0
    for (a, b), n in bs[:top]:
        print(f"  {kname(a)+'→'+kname(b):>14}  {n:>9,}  {bar(n, mx)}")

    # --- chord candidates ---------------------------------------------
    section("Chord candidates  (already pressed together → ZMK combo candidates)")
    cs = sorted(d["c"].items(), key=lambda kv: -kv[1])
    mx = cs[0][1] if cs else 0
    if not cs:
        print("  (none yet — collect more data)")
    for (a, b), n in cs[:top]:
        print(f"  {kname(a)+'+'+kname(b):>14}  {n:>9,}  {bar(n, mx)}")

    # --- modifiers & shortcuts ----------------------------------------
    section("Modifier presses")
    for i, name in enumerate(MODS):
        n = d["m"].get(i, 0)
        print(f"  {name:>7}  {n:>9,}")

    section("Top shortcuts  (mod + key — layer/combo & home-row-mod signal)")
    ss = sorted(d["s"].items(), key=lambda kv: -kv[1])
    mx = ss[0][1] if ss else 0
    if not ss:
        print("  (none yet)")
    for (mask, kc), n in ss[:top]:
        print(f"  {maskname(mask)+'+'+kname(kc):>18}  {n:>9,}  {bar(n, mx)}")

    # --- timing --------------------------------------------------------
    section("Hold duration (ms)  — informs tap-hold / home-row-mod tapping-term")
    h = pct(d["h"], [50, 75, 90, 95, 99])
    print("  " + "   ".join(f"p{q}={v}ms" for q, v in sorted(h.items())))

    section("Inter-key interval (ms)  — informs combo timeout & tapping-term")
    iv = pct(d["i"], [10, 25, 50, 75, 90])
    print("  " + "   ".join(f"p{q}={v}ms" for q, v in sorted(iv.items())))
    p25 = iv.get(25)
    if p25 is not None:
        print(f"\n  Note: your current hm/lt_bal tapping-term is 175ms; the 'caps' combo")
        print(f"  fires on simultaneous N+/. A combo timeout a little under your fast")
        print(f"  inter-key interval (≈p10–p25 = {iv.get(10)}–{p25}ms) avoids misfires while rolling.")

    print()


if __name__ == "__main__":
    main()
