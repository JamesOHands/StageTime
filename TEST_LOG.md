# Test log

**This file is public.** Technical results only. Never record any of your set, and keep personal notes about nerves or how a rehearsal went somewhere private.

Two kinds of test, always labelled:

- **Desktop / assistant:** run in a desktop browser or emulator, either by an assistant or by James. These prove the code runs. They do **not** prove presence, comfort or headset performance.
- **Headset (James):** James wearing the headset. Only these count towards milestone acceptance.

Test IDs refer to the acceptance tests in SPEC.md.

## Summary

| Date | Build | Commit | Kind | Device | Tests | Result | Tester |
|---|---|---|---|---|---|---|---|
| 22 Nov 2026 | claude-v0 | eeaaf7b | Desktop / assistant | Node 22 | D3, D4, D8 (23 unit tests) | Pass | Claude |
| 22 Nov 2026 | claude-v0 | eeaaf7b | Desktop / assistant | Headless Chrome (software WebGL), fake mic | D1, D2, D3, D4 (incl. full 1-min set), D5, D7, D9; draw-call budget | Pass (24/24) | Claude |
| 22 Nov 2026 | claude-v0 | eeaaf7b | Desktop / assistant | TypeScript 5, strict | D6 type check | Pass | Claude |
| 22 Nov 2026 | chatgpt-v0 | 90c532d | Desktop / assistant | Node 24, TypeScript 5.9 | D3, D4 (logic), D6, D8; synthetic controller/mic and geometry | Pass (11/11 tests + strict type check) | ChatGPT/Codex |
| 22 Nov 2026 | chatgpt-v0 | 90c532d | Desktop / assistant | Live cloud Chrome, WebGL disabled | Desktop compatibility controls, D4 timer/stop, D5 mic-off fallback, D7 scheduled placeholder audio | Compatibility checks passed; native WebGL not verified | ChatGPT/Codex |
| 22 Nov 2026 | chatgpt-v0 | 90c532d | Desktop / assistant | Local Chromium | Full WebGL browser suite, D9 actual fake-device tracks | Pending: browser process launch blocked by environment | ChatGPT/Codex |

## Headset session template

Copy this block for each headset session.

```
### YYYY-MM-DD — <build> @ <commit> — <Quest 2 / Quest 3 / Quest 3S>

Tests: H1 ☐ H2 ☐ H3 ☐ H4 ☐ H5a ☐ H5b ☐ H6 ☐ H7 ☐

- Refresh rate shown / lowest fps seen:
- Mic mode used (mic / timed / manual):
- H7 — felt watched? (yes / partly / no):
- Comfort issues (judder, dizziness, wrong height or scale):
- Audio: directional? repetitive? too loud/quiet?
- Bugs / errors shown in overlay:
- What would most improve presence:
```

## Sessions

### 2026-11-22 — claude-v0 @ eeaaf7b — desktop / assistant (Claude)

Not a headset test. This proves the code runs, nothing about presence or headset performance.

- **Unit (Node):**
  - 30 seats facing the performer;
  - same seed gives the same audience;
  - behaviour identical at 72 fps, 30 fps and with jittery frames;
  - timed gaps are 15–40 s;
  - reaction sizes match the spec;
  - no repeated clip from one seat;
  - about 85% attention during a set;
  - one pause, one outcome;
  - re-arms only after ≥ 2 s of fresh speech;
  - 4 s cooldown;
  - echo guard ignores crowd noise;
  - a noisy room is learnt as background;
  - the same result at 30, 72 and 90 Hz mic sampling.
- **Headless Chrome:**
  - no console or page errors;
  - every desktop key works;
  - the overlay shows all its fields;
  - Space starts and stops;
  - on stop, scheduled reactions are dropped and playing ones fade to zero within 0.6 s;
  - a 1-minute set ends with applause;
  - mic denied falls back to timed mode, labelled in the overlay;
  - exiting VR and page hide stop every mic track;
  - a missing sound library falls back to placeholders.
- **Render budget:** 51 draw calls, 23k triangles with 20 people.
- **Frame rate:** not meaningful here (software rendering).

### 2026-11-22 — chatgpt-v0 @ 90c532d — desktop / assistant (ChatGPT/Codex)

Not a headset test. No real microphone access or private rehearsal material used.

- **Type check:** `npm run check` (strict checkJs, noEmit) passed.
- **11 Node tests:** 30 physical seats, seed/fill/appearance repeatability, independent PRNG streams, identical logical reaction timeline at 14 ms and 781 ms frame intervals, reaction distributions and staggered participants, attention, conservative instanced audience geometry budget, monotonic session start/finish/stop, one pause/one outcome, fresh speech/cooldown/echo guard, synthetic Quest handedness/button hold mapping, and synthetic mic stop/denial/late permission cleanup.
- **Live Pages test (labelled Canvas2D compatibility view):** the cloud browser reported GL_VENDOR / GL_RENDERER disabled; this is not a native WebGL performance test. The assistant verified the deployed setup at the default 20 seats and five minutes, a deterministic test seed, camera look-around, D/L/T/R/P/C/Space/+/- controls and overlay, reaction source scheduling up to the 24-voice cap, stop clearing voices and timer returning to 1:00, a full one-minute countdown naturally reaching 0:00 and scheduling finish applause, and a mic mode request without enabling mic falling back to timed mode. Seed `pub-demo` produced the expected timed laugh around 19 seconds (14 scheduled voices); exit returned to setup with zero reaction voices. No new app runtime errors in the compatibility test. Sound direction/quality was not judged.
- **Geometry estimate only:** 16 scene batches, 50,262 source triangles for the 20-member test seed (not measured GPU draw calls). The unit geometry test passed at 30 occupied seats in five seeds. Compatibility FPS is intentionally not compared to headset FPS.
- **Pending:** full D1 native WebGL verification and actual browser permission-denial/fake-device D9 tests; runnable Playwright suite is in the build folder but the local Chromium process could not launch under the environment's socket restrictions. D5 rejection and D9 track cleanup were validated synthetically. All H1–H7 pending James's headset test.
