# State

_Last updated: 22 Nov 2026 by ChatGPT/Codex_

## Project

- Repo `JamesOHands/StageTime`, Pages from `main` / root, live at https://jamesohands.github.io/StageTime/ (landing page and both v0 builds).
- Docs: AGENTS.md, CLAUDE.md, README.md, SPEC.md, STATE.md, DECISIONS.md, TEST_LOG.md.
- **SPEC.md (v0) is Agreed** (22 Nov 2026). Both bake-off builds are implemented.
- Claude and ChatGPT/Codex can both read from and push to the repo.
- Hardware: M1 MacBook Pro. Quest 2 may not work. Quest 3/3S is the likely replacement. Not yet confirmed which headset will be used for testing.

## Next steps

1. ~~James marks SPEC.md Agreed.~~ Done.
2. ~~Build both bake-off prototypes to the agreed spec.~~ Done; both use placeholder sounds.
3. James runs the headset tests (SPEC.md §6) on both builds, in the same sitting, and records results in TEST_LOG.md.
4. James sources the shared, licensed sound library for `/assets/audio/` before the final comparison.
5. Pick the winner. Record the decision in DECISIONS.md.

## Blockers / open items

- Check whether the Quest 2 works. That sets the performance target.
- Human sound library: James is downloading or recording it. Placeholders until then.

## Claude v0 (`/claude-v0/`)

_Updated 22 Nov 2026 by Claude._

- **Status: built, desktop-tested, waiting for James's first headset test.** Live at https://jamesohands.github.io/StageTime/claude-v0/
- Everything in SPEC.md §2 is implemented: room, 30 seats, readable faces, gaze, idle and reaction animation, per-seat HRTF audio, room tone, mic/timed/manual modes, controls, Exit VR, debug overlay, seeded streams. Structure and behaviour notes: `claude-v0/README.md`.
- **Desktop/assistant tests:** all pass (see TEST_LOG.md):
  - D1–D9;
  - 23 Node unit tests;
  - 22 headless Chrome checks;
  - strict type check.
  - Draw calls: 51 with 20 people (budget 100).
- **Sounds:** synthesised placeholders (laughs, titters, single-person clapping, coughs, glass, shuffles, room murmur). They're crude by design, until the real library arrives.
- **Shared files added:** `/assets/audio/manifest.json` (`{}`) and `/assets/audio/README.md` (format and what's needed). ChatGPT/Codex: use or amend as needed. The manifest format is documented there.
- **Not verified, needs the headset:**
  - frame rate on Quest 2/3;
  - whether the Quest Browser keeps the mic live inside VR;
  - controller button mapping;
  - comfort, stage height, audio levels.
- **Next:** James runs H1–H7 and reports. Then tune presence (lighting, levels, gaze, timing) based on what he says.

## ChatGPT v0 (`/chatgpt-v0/`)

_Updated 22 Nov 2026 by ChatGPT/Codex._

- **Status: built and Pages deployment verified; ready for James's first trial.** https://jamesohands.github.io/StageTime/chatgpt-v0/ (refresh if cached).
- Native WebXR/Three.js 0.187.0 scene, thirty physical chairs, default 20 instanced seated avatars with readable faces, independent gaze/idle/reaction poses, stage-height alignment, mic stand, adjustable lighting, clock and overlay. HRTF individual audio, shared manifest, timed/manual modes and optional local VAD, controller start/stop/exit. See `chatgpt-v0/README.md`.
- **Desktop/assistant:** strict JS type check and 11 Node tests pass. Live Pages desktop compatibility view verified: mouse-look, all shortcuts, audio-voice scheduling/cap/cancellation, one-minute countdown with finish applause, mic-off fallback and automatic timed reaction. The assistant's browser explicitly has WebGL disabled, so the labelled Canvas2D view is not native WebGL or Quest performance evidence.
- **Pending:** native WebGL desktop browser suite (local Chromium launch was blocked by the environment), actual browser fake-mic cleanup test, and every real headset acceptance test H1–H7. Controller holds and mic track lifecycle were validated synthetically only. No real microphone permission was granted by the assistant.
- **Sounds:** original synthesised placeholders; reads the exact shared `/assets/audio/manifest.json` including laugh clips for ripple. The final comparison needs the licensed human sound library for both builds.
- **Next:** James tries both builds on the same headset, notes comfort, gaze, FPS and spatial audio, and reports H1–H7. Do not expand to v1 before presence is verified.
