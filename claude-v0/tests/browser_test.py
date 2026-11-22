"""
Desktop browser tests for Claude v0 (SPEC.md §6: D1, D2, D4, D5, D7, D9).

Runs headless Chrome against a local static server. Three.js is served from a local
copy of the pinned npm package instead of the CDN, so the test works offline.

Setup (once):
    pip install playwright
    npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz     # gives ./package/

Run from the repo root:
    python3 claude-v0/tests/browser_test.py --three-dir /path/to/package [--chrome /usr/bin/google-chrome] [--shots out/]

This proves the code runs. It says nothing about presence, comfort or headset performance.
"""

import argparse
import functools
import http.server
import json
import mimetypes
import os
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
CDN = "https://cdn.jsdelivr.net/npm/three@0.187.0/"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(port):
    handler = functools.partial(QuietHandler, directory=str(REPO))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def route_three(page, three_dir):
    def handle(route):
        rel = route.request.url[len(CDN):]
        path = Path(three_dir) / rel
        if not path.is_file():
            return route.fulfill(status=404, body="missing")
        mime = mimetypes.guess_type(str(path))[0] or "application/javascript"
        if path.suffix == ".js":
            mime = "application/javascript"
        route.fulfill(status=200, body=path.read_bytes(), headers={"content-type": mime, "access-control-allow-origin": "*"})

    page.route(CDN + "**", handle)


def new_page(browser, three_dir, base, query="", grant_mic=False, manifest_404=False):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, permissions=["microphone"] if grant_mic else [])
    page = ctx.new_page()
    console_errors, page_errors = [], []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    route_three(page, three_dir)
    if manifest_404:
        page.route("**/assets/audio/manifest.json", lambda r: r.fulfill(status=404, body="not found"))
    page.goto(f"{base}/claude-v0/{query}")
    page.wait_for_function("document.getElementById('status').textContent.startsWith('Ready')", timeout=30000)
    return ctx, page, console_errors, page_errors


def last_event(page):
    return page.evaluate("window.__stageTime.getLastEvent().text")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--three-dir", required=True)
    ap.add_argument("--chrome", default="/usr/bin/google-chrome")
    ap.add_argument("--shots", default="")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--long", action="store_true", help="also run a full 1-minute session (D4 end-to-end)")
    args = ap.parse_args()
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    httpd = serve(args.port)
    base = f"http://127.0.0.1:{args.port}"
    flags = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required",
             "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
    deny_flags = [f for f in flags if f != "--use-fake-ui-for-media-stream"]

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chrome, headless=True, args=flags)

        # --- D1: loads with no errors; scene visible ---
        ctx, page, cerr, perr = new_page(browser, args.three_dir, base, "?seed=4242&mode=timed&fill=20")
        time.sleep(1.5)
        if shots:
            page.screenshot(path=str(shots / "01-entry.png"))
        page.click("#start-desktop")
        time.sleep(2.5)
        if shots:
            page.screenshot(path=str(shots / "02-desktop-scene.png"))
        n = page.evaluate("window.__stageTime.getCrowd().members.length")
        check("D1 loads, 20 audience members, no console or page errors", n == 20 and not cerr and not perr, f"members={n} console={cerr[:2]} page={perr[:2]}")
        calls, tris = page.evaluate("(() => { const i = window.__stageTime.renderer.info.render; return [i.calls, i.triangles]; })()")
        check("Budget: ≤ 100 draw calls and ≤ 100k triangles (30 people)", calls <= 100 and tris <= 100000, f"calls={calls} triangles={tris} (fill 20)")
        sounds = page.evaluate("document.getElementById('status').textContent")
        check("D7 placeholders used when the library is empty", "placeholders" in sounds, sounds)

        # --- D2: every key triggers its event ---
        page.mouse.move(640, 400)
        for key, expect in [("l", "laugh"), ("t", "titter"), ("p", "applause"), ("c", "cough")]:
            page.keyboard.press(key)
            time.sleep(0.15)
            ev = last_event(page)
            check(f"D2 key {key.upper()} → {expect}", ev.startswith(expect) and "manual" in ev, ev)
        page.keyboard.press("d")
        time.sleep(0.4)
        visible = page.evaluate("!document.getElementById('debug').hidden")
        check("D2 key D shows the debug overlay", visible)
        lines = page.evaluate("window.__stageTime.debugLines()")
        check("D2 overlay shows fps, mic, crowd, last event, seed", all(any(s in l for l in lines) for s in ["fps", "mic", "crowd", "last:", "seed 4242"]), " | ".join(lines[:7]))
        vol0 = page.evaluate("window.__stageTime.settings.volume")
        page.keyboard.press("-")
        vol1 = page.evaluate("window.__stageTime.settings.volume")
        page.keyboard.press("=")
        vol2 = page.evaluate("window.__stageTime.settings.volume")
        check("D2 keys − / + change volume", vol1 < vol0 and abs(vol2 - vol0) < 1e-6, f"{vol0} → {vol1} → {vol2}")

        # --- D4: start, react, stop → nothing plays after stop ---
        page.keyboard.press(" ")
        time.sleep(0.3)
        check("D4 Space starts the session", page.evaluate("window.__stageTime.session.state") == "running")
        time.sleep(2.2)  # let the crowd hush and turn to the stage
        if shots:
            page.screenshot(path=str(shots / "03-running.png"))
        page.keyboard.press("l")
        time.sleep(0.5)
        if shots:
            page.screenshot(path=str(shots / "04-laughing.png"))
        page.keyboard.press("l")  # a second laugh: some of its voices are still scheduled when we stop
        voices_before = page.evaluate("window.__stageTime.audio.reactionVoices()")
        page.keyboard.press(" ")
        immediately = page.evaluate("window.__stageTime.audio.reactionVoices()")
        time.sleep(0.6)
        state = page.evaluate("window.__stageTime.session.state")
        voices_after = page.evaluate("window.__stageTime.audio.reactionVoices()")
        check("D4 stop → ready; scheduled reactions dropped at once, playing ones faded out", state == "ready" and voices_before > 0 and immediately < voices_before and voices_after == 0,
              f"reaction voices {voices_before} → {immediately} at stop → {voices_after} after 0.6 s")
        check("D1 still no errors after interaction", not cerr and not perr, f"{cerr[:2]} {perr[:2]}")

        # Close-up of the front row, to check faces read at a glance.
        if shots:
            page.evaluate("(() => { const c = window.__stageTime.camera; c.fov = 28; c.updateProjectionMatrix(); c.rotation.set(-0.38, 0, 0, 'YXZ'); })()")
            time.sleep(0.6)
            page.screenshot(path=str(shots / "05-front-row-zoom.png"))
            page.evaluate("(() => { const c = window.__stageTime.camera; c.fov = 70; c.updateProjectionMatrix(); c.position.set(2.2, 1.7, 0.6); c.lookAt(0, 0.6, -3.5); })()")
            time.sleep(0.6)
            page.screenshot(path=str(shots / "06-side-view.png"))
        ctx.close()

        # --- D3 (browser): same seed → same audience ---
        looks = []
        for _ in range(2):
            ctx, page, _, _ = new_page(browser, args.three_dir, base, "?seed=777&fill=18")
            looks.append(page.evaluate("JSON.stringify(window.__stageTime.getCrowd().members.map(m => [m.seat.index, m.look]))"))
            ctx.close()
        check("D3 same seed in two page loads → same audience", looks[0] == looks[1])

        # --- D9: fake mic granted; leaving VR or the page stops every track ---
        ctx, page, cerr, perr = new_page(browser, args.three_dir, base, "?mode=mic", grant_mic=True)
        page.click("#mic-btn")
        page.wait_for_function("window.__stageTime.mic.status !== 'off'", timeout=10000)
        live = page.evaluate("window.__stageTime.mic.liveTracks()")
        check("D9 mic on with a live track", page.evaluate("window.__stageTime.mic.status") == "on" and live > 0, f"tracks={live}")
        page.click("#start-desktop")
        page.keyboard.press(" ")
        time.sleep(1.5)
        mode = page.evaluate("window.__stageTime.debugLines()[1]")
        check("Mic mode active while the mic is on", mode.startswith("mode mic"), mode)
        page.evaluate("window.__stageTime.simulateXREnd()")
        check("D9 exiting VR stops every mic track", page.evaluate("window.__stageTime.mic.liveTracks()") == 0 and page.evaluate("window.__stageTime.mic.status") == "off")
        page.click("#mic-btn")
        page.wait_for_function("window.__stageTime.mic.status === 'on'", timeout=10000)
        page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        check("D9 leaving the page stops every mic track", page.evaluate("window.__stageTime.mic.liveTracks()") == 0)
        check("D9 no errors", not cerr and not perr, f"{cerr[:2]} {perr[:2]}")
        ctx.close()
        browser.close()

        # --- D5: mic denied → timed fallback ---
        browser = p.chromium.launch(executable_path=args.chrome, headless=True, args=deny_flags)
        ctx, page, cerr, perr = new_page(browser, args.three_dir, base, "?mode=mic")
        page.click("#mic-btn")
        page.wait_for_function("window.__stageTime.mic.status !== 'off'", timeout=10000)
        status = page.evaluate("window.__stageTime.mic.status")
        page.click("#start-desktop")
        page.keyboard.press(" ")
        time.sleep(0.5)
        mode = page.evaluate("window.__stageTime.debugLines()[1]")
        check("D5 mic denied → timed mode, shown in the overlay", status in ("denied", "error") and "timed" in mode and "→ timed" in mode, f"status={status} line='{mode}'")
        check("D5 no page errors", not perr, str(perr[:2]))
        ctx.close()

        # --- D7: manifest missing entirely (404) → still runs on placeholders ---
        ctx, page, cerr, perr = new_page(browser, args.three_dir, base, "?mode=timed", manifest_404=True)
        page.click("#start-desktop")
        page.keyboard.press("l")
        time.sleep(0.3)
        check("D7 missing manifest → placeholders, no page errors", "placeholders" in page.evaluate("document.getElementById('status').textContent") and not perr, str(perr[:2]))
        ctx.close()

        # --- D4 end-to-end: a 1-minute set finishes with applause ---
        if args.long:
            ctx, page, cerr, perr = new_page(browser, args.three_dir, base, "?mode=timed&minutes=1&seed=99")
            page.click("#start-desktop")
            page.keyboard.press(" ")
            time.sleep(61.0)
            st = page.evaluate("window.__stageTime.session.state")
            ev = last_event(page)
            crowd_state = page.evaluate("window.__stageTime.getCrowd().stateLabel(performance.now())")
            check("D4 1-minute set → finished with applause", st == "finished" and ev.startswith("applause") and "finish" in ev and crowd_state == "applauding",
                  f"state={st} last={ev} crowd={crowd_state}")
            check("D4 no errors over a full set", not cerr and not perr, f"{cerr[:2]} {perr[:2]}")
            ctx.close()
        browser.close()

    httpd.shutdown()
    failed = [r for r in results if not r[1]]
    print(json.dumps({"passed": len(results) - len(failed), "failed": len(failed)}))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
