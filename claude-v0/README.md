# Claude v0 — presence prototype

Live: https://jamesohands.github.io/StageTime/claude-v0/

Built to SPEC.md (v0, agreed 22 Nov 2026). Plain ES modules, no build step. Three.js 0.187.0 comes from an import map in `index.html`.

## How it fits together

```
index.html        entry page (mic, mode, room settings, Enter VR / Start on desktop) + import map
main.js           wiring and the frame loop
src/
  config.js       every tunable number (weights, timings, lighting, sizes)
  rng.js          seeded PRNG; named streams derived from one seed
  events.js       event bus
  session.js      ready → running → finished; the set timer          ┐ pure logic,
  crowd.js        seats, people, attention, who reacts and when      │ tested in Node
  speech.js       voice activity + pause rules (one pause, one outcome)┘
  mic.js          getUserMedia → level in dB; releases the tracks
  audio.js        HRTF voice per person, room murmur, placeholder synthesis, library loader
  render/room.js       the pub back room, stage at your real floor height, spotlight, countdown
  render/audience.js   instanced low-poly people with faces, gaze, idle and reaction animation
  render/overlay.js    debug overlay (VR panel + desktop text) and frame-rate meter
  input/desktop.js     mouse-look and keys
  input/xr.js          Quest buttons, holds, handheld mic
tests/
  *.test.js         Node unit tests (D3, D4, D8)
  browser_test.py   headless Chrome tests (D1, D2, D4, D5, D7, D9) + screenshots
```

Events flow one way: `session`, `crowd` and `speech` emit `session`, `reaction`, `ambient`, `pause` and `cancel` events. `main.js` passes them to `audience.js` (animation), `audio.js` (sound) and the overlay.

## Behaviour worth knowing

- **Mic mode** needs the mic enabled on the entry page *before* entering VR. If it's off, denied or fails, the build uses timed reactions and says so in the overlay.
- **One pause, one outcome:**
  - after ≥ 2 s of speech, ≥ 700 ms of silence rolls silence / titter / ripple / laugh at 40 / 30 / 20 / 10;
  - after that, a new 2 s stretch of speech is needed;
  - loud reactions switch on an echo guard so the crowd doesn't trigger itself.
- **Stopping** drops scheduled reactions immediately and fades playing ones over 0.3 s. Room murmur and bar sounds carry on.
- **Exiting VR** (hold both grips, or the Meta button) and **leaving the page** release the mic. Stopping a set doesn't, because getting it back might prompt invisibly inside VR. To use mic mode again after exiting, enable the mic again.
- **When the set starts**, the room hushes and people turn to you over a second or two. Before and after, they chat more.
- **Applause** only comes from people who aren't already laughing.
- **Ripples** use the laugh clips.
- **Sounds** are synthesised placeholders until `/assets/audio/manifest.json` lists real clips (see `/assets/audio/README.md`).

## Tests

```bash
# Logic (no browser needed)
node --test claude-v0/tests/*.test.js

# Type check (assistants with a terminal)
npm i --no-save typescript@5 @types/three@0.187.0 @types/node@22   # once
npx tsc --noEmit --allowJs --checkJs --strict --target ES2022 --module ESNext \
  --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable --types node,webxr --skipLibCheck \
  claude-v0/main.js claude-v0/tests/*.test.js

# Headless Chrome (needs Python Playwright and a local copy of three@0.187.0)
npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz -C /tmp
python3 claude-v0/tests/browser_test.py --three-dir /tmp/package --shots /tmp/shots [--long]
```

These prove the code runs. Presence, comfort and frame rate can only be judged in the headset.
