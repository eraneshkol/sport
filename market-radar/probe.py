#!/usr/bin/env python3
"""
Phase 0 probe: does the free data actually work from your machine?

Run:  python probe.py
No pip install needed. Python 3.8+. Safe to re-run.

Answers five questions before we build anything:
  1. Do Apple's endpoints work from an Israeli IP with country=us?
  2. What's the real rate limit (not the folklore one)?
  3. How many results can we actually get per query?  (coverage ceiling)
  4. Is Google Play scrapeable from here, or do we need a proxy?
  5. ASO reality check: are the top results for a query beatable?
"""
import json, sys, time, urllib.request, urllib.parse, urllib.error, re
from datetime import datetime, timezone

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
COUNTRY = "us"
RESULTS = {"probed_at": datetime.now(timezone.utc).isoformat(), "checks": {}}


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(), round(time.time() - t0, 2)


def ok(label, msg):   print(f"  \033[32mPASS\033[0m  {label}: {msg}")
def bad(label, msg):  print(f"  \033[31mFAIL\033[0m  {label}: {msg}")
def warn(label, msg): print(f"  \033[33mWARN\033[0m  {label}: {msg}")
def head(t):          print(f"\n{'='*66}\n{t}\n{'='*66}")


# ---------------------------------------------------------------- 1. iTunes
def probe_itunes_search():
    head("1. iTunes Search API  (the backbone - metadata + your filters)")
    url = ("https://itunes.apple.com/search?" + urllib.parse.urlencode({
        "term": "kids learning games", "country": COUNTRY,
        "entity": "software", "limit": 200}))
    try:
        status, body, secs = get(url)
    except Exception as e:
        bad("reachable", f"{type(e).__name__}: {e}")
        RESULTS["checks"]["itunes_search"] = {"ok": False, "error": str(e)}
        return None
    d = json.loads(body)
    n = d.get("resultCount", 0)
    ok("reachable", f"HTTP {status} in {secs}s")
    ok("result count", f"{n} apps (asked for 200 -> this is our coverage ceiling per query)")
    if n < 200:
        warn("ceiling", f"only {n} came back; broad queries may cap lower than documented")

    r = d["results"][0]
    need = ["trackName", "artistName", "averageUserRating", "userRatingCount",
            "releaseDate", "currentVersionReleaseDate", "contentAdvisoryRating",
            "primaryGenreName", "genres", "formattedPrice", "version"]
    missing = [f for f in need if r.get(f) is None]
    (ok if not missing else bad)("required fields",
        "all present" if not missing else f"MISSING: {missing}")

    print(f"\n  Sample record ({r.get('trackName')!r}):")
    for f in need:
        print(f"    {f:32} {r.get(f)}")
    print(f"    {'(total fields available)':32} {len(r)}")

    # Does the Kids category actually surface? (our best segment, per the thesis)
    kids = [a for a in d["results"] if "Kids" in (a.get("genres") or [])]
    print()
    ok("Kids-category apps in this query", f"{len(kids)} of {n}")

    RESULTS["checks"]["itunes_search"] = {
        "ok": True, "count": n, "seconds": secs, "missing_fields": missing,
        "kids_category": len(kids), "fields_available": len(r)}
    return d["results"]


def probe_rate_limit():
    head("2. Real rate limit  (decides how big a daily scan can be)")
    terms = ["puzzle kids", "toddler games", "learn to read", "coloring kids",
             "dinosaur kids", "math kids", "abc kids", "kids music",
             "preschool games", "kids cooking", "animal kids", "shapes kids"]
    sent = failed = 0
    first_fail = None
    t0 = time.time()
    for t in terms:
        u = ("https://itunes.apple.com/search?" + urllib.parse.urlencode(
            {"term": t, "country": COUNTRY, "entity": "software", "limit": 5}))
        try:
            get(u, timeout=15); sent += 1
        except urllib.error.HTTPError as e:
            failed += 1
            if first_fail is None:
                first_fail = sent
                warn("throttled", f"HTTP {e.code} after {sent} rapid requests")
        except Exception as e:
            failed += 1
            if first_fail is None:
                first_fail = sent; warn("error", f"{type(e).__name__} after {sent}")
    el = round(time.time() - t0, 1)
    rate = round(sent / el * 60, 1) if el else 0
    if not failed:
        ok("no throttling", f"{sent}/{len(terms)} back-to-back OK in {el}s (~{rate}/min sustained)")
    else:
        warn("throttling", f"{failed}/{len(terms)} failed, first at #{first_fail} -> we'll add backoff")
    RESULTS["checks"]["rate_limit"] = {
        "sent": sent, "failed": failed, "seconds": el,
        "effective_per_min": rate, "first_failure_at": first_fail}


def probe_reviews(app_id):
    head("3. Review text  (needed to classify complaints -> the core signal)")
    url = (f"https://itunes.apple.com/{COUNTRY}/rss/customerreviews/"
           f"page=1/id={app_id}/sortby=mostrecent/json")
    try:
        status, body, secs = get(url)
        d = json.loads(body)
        entries = d.get("feed", {}).get("entry", []) or []
        revs = [e for e in entries if "im:rating" in e]
        ok("reviews RSS", f"{len(revs)} reviews on page 1 (10 pages max = ~500 ceiling)")
        if revs:
            e = revs[0]
            print(f"    rating   {e['im:rating']['label']}")
            print(f"    title    {e['title']['label'][:60]}")
            print(f"    body     {e['content']['label'][:110]}...")
        RESULTS["checks"]["reviews"] = {"ok": True, "page1": len(revs)}
    except Exception as ex:
        bad("reviews RSS", f"{type(ex).__name__}: {ex}")
        RESULTS["checks"]["reviews"] = {"ok": False, "error": str(ex)}


def probe_charts():
    head("4. Apple charts RSS  (scale proxy + spotting UA-funded incumbents)")
    url = f"https://rss.marketingtools.apple.com/api/v2/{COUNTRY}/apps/top-free/50/apps.json"
    try:
        status, body, secs = get(url)
        d = json.loads(body)
        apps = d["feed"]["results"]
        ok("charts", f"{len(apps)} apps from '{d['feed']['title']}'")
        for a in apps[:3]:
            g = (a.get("genres") or [{}])[0].get("name", "?")
            print(f"    {a['name'][:40]:42} {a['artistName'][:22]:24} {g}")
        RESULTS["checks"]["charts"] = {"ok": True, "count": len(apps)}
    except Exception as ex:
        bad("charts", f"{type(ex).__name__}: {ex}")
        RESULTS["checks"]["charts"] = {"ok": False, "error": str(ex)}


# ------------------------------------------------------------------ 5. Play
def probe_play():
    head("5. Google Play  (the ONLY source of absolute install numbers)")
    url = ("https://play.google.com/store/apps/details"
           "?id=com.duckduckmoosedesign.kindergarten&hl=en&gl=us")
    try:
        status, body, secs = get(url, timeout=30)
        html = body.decode("utf-8", "replace")
        ok("page fetch", f"HTTP {status}, {len(html)//1024}KB in {secs}s")
        signals = {
            "install bucket": re.search(r'([\d,]+\+)\s*<', html) or re.search(r'"([\d,]+\+)"', html),
            "AF_initDataCallback (parseable JSON)": "AF_initDataCallback" in html,
            "rating present": re.search(r'\b([1-4]\.\d)\b', html),
            "captcha / blocked": ("captcha" in html.lower() or "unusual traffic" in html.lower()),
        }
        for k, v in signals.items():
            if k.startswith("captcha"):
                (bad if v else ok)(k, "BLOCKED - needs a proxy" if v else "no block detected")
            else:
                (ok if v else warn)(k, "found" if v else "not found - parser needs work")
        RESULTS["checks"]["play"] = {
            "ok": True, "kb": len(html)//1024,
            "has_datacallback": "AF_initDataCallback" in html,
            "blocked": bool(signals["captcha / blocked"])}
    except Exception as ex:
        bad("page fetch", f"{type(ex).__name__}: {ex}")
        warn("implication", "Play may need a US proxy, or we run iOS-only at first")
        RESULTS["checks"]["play"] = {"ok": False, "error": str(ex)}


# -------------------------------------------------------------- 6. ASO gate
def probe_aso(results):
    head("6. ASO reality check  (SHAPES THE WHOLE THESIS - your only channel)")
    if not results:
        warn("skipped", "no iTunes results to analyse")
        return
    q = "kids learning games"
    tokens = [t for t in q.lower().split() if len(t) > 2]
    top = results[:10]
    exact = sum(1 for a in top
                if all(t in (a.get("trackName", "") + " ").lower() for t in tokens))
    rated = [a for a in top if (a.get("userRatingCount") or 0) > 50]
    avg = round(sum(a["averageUserRating"] for a in rated) / len(rated), 2) if rated else 0
    stale = 0
    for a in top:
        try:
            d = datetime.fromisoformat(a["currentVersionReleaseDate"].replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - d).days > 365:
                stale += 1
        except Exception:
            pass

    print(f"  query: {q!r}\n")
    ok("title exact-match in top 10", f"{exact}/10  (LOW = keyword is winnable)")
    ok("avg rating of top 10", f"{avg}  (BELOW 4.0 = incumbents are weak)")
    ok("not updated in 12mo", f"{stale}/10  (HIGH = incumbents are asleep)")
    print("\n  Top 10 as the engine will see them:")
    print(f"    {'rating':>6} {'reviews':>9}  {'updated':>10}  app")
    for a in top:
        upd = (a.get("currentVersionReleaseDate") or "")[:10]
        print(f"    {a.get('averageUserRating', 0):>6} "
              f"{a.get('userRatingCount', 0):>9,}  {upd:>10}  {a.get('trackName','')[:44]}")
    RESULTS["checks"]["aso"] = {"query": q, "exact_match_top10": exact,
                                "avg_rating_top10": avg, "stale_top10": stale}


if __name__ == "__main__":
    print(f"Phase 0 probe | python {sys.version.split()[0]} | storefront={COUNTRY}")
    res = probe_itunes_search()
    probe_rate_limit()
    probe_reviews(res[0]["trackId"] if res else 1481314084)
    probe_charts()
    probe_play()
    probe_aso(res)

    out = "probe_results.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, indent=2, ensure_ascii=False)
    head("DONE")
    passed = sum(1 for c in RESULTS["checks"].values() if c.get("ok") is not False)
    print(f"  {passed}/{len(RESULTS['checks'])} checks usable. Wrote {out}")
    print("  -> paste the console output (or that file) back to me.")
