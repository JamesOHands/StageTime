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
