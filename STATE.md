# State

_Last updated: 22 Nov 2026 by Claude_

## Project

- Repo `JamesOHands/StageTime`, Pages from `main` / root, live at https://jamesohands.github.io/StageTime/ (landing page only).
- Docs: AGENTS.md, CLAUDE.md, README.md, SPEC.md, STATE.md, DECISIONS.md, TEST_LOG.md.
- **SPEC.md (v0) is Agreed** (22 Nov 2026). The bake-off builds can start.
- Claude and ChatGPT/Codex can both read from and push to the repo.
- Hardware: M1 MacBook Pro. Quest 2 may not work. Quest 3/3S is the likely replacement. Not yet confirmed which headset will be used for testing.

## Next steps

1. ~~James marks SPEC.md Agreed.~~ Done.
2. Bake-off: Claude builds `/claude-v0/` and ChatGPT/Codex builds `/chatgpt-v0/`, both to the agreed spec, using placeholder sounds.
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

_Not started._
