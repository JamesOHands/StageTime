# Decisions

Newest at the bottom. Each entry: what was decided, why, and who agreed. Superseded decisions stay in place, marked **Superseded by Dxxx**.

## D001 — Hosting: GitHub Pages from a public repo
- **Date:** 22 Nov 2026 · **Agreed by:** James (in brief)
- Repo `JamesOHands/StageTime`, Pages from `main` / root, served at https://jamesohands.github.io/StageTime/.
- **Why:** free static HTTPS hosting, which WebXR needs. No backend.
- **Consequence:** the repo and the site are public, so nothing private ever goes in (see AGENTS.md → Privacy).

## D002 — Disable Jekyll with `.nojekyll`
- **Date:** 22 Nov 2026 · **Proposed by:** Claude
- **Why:** By default, Pages runs Jekyll. Jekyll can ignore files and folders whose names start with `_` and turn Markdown into web pages. We want plain files served exactly as committed.

## D003 — Stack: WebXR + pinned Three.js, plain ES modules, no build step
- **Date:** 22 Nov 2026 · **Agreed by:** James (in brief)
- JSDoc types with `// @ts-check`, checked by assistants that have a terminal. TypeScript/build tooling, Immersive Web SDK or Unity only if justified and approved.

## D004 — v0 bake-off in separate folders on `main`
- **Date:** 22 Nov 2026 · **Agreed by:** James (in brief)
- `/claude-v0/` and `/chatgpt-v0/`, both built to the same agreed SPEC.md. The winner becomes the app.
- **Rules** (SPEC.md §4):
  - Each assistant edits only its own folder.
  - Shared files: pull first, use small commits, and don't rewrite the other's sections.
  - Same Three.js version, assets, defaults and headset for both builds.

## D005 — Three.js pinned to 0.187.0
- **Date:** 22 Nov 2026 · **Agreed by:** Claude, ChatGPT/Codex (spec review)
- Loaded through an import map from jsDelivr at an exact version, add-ons included.
- **Why:** 0.187.0 is the latest release (30 Oct 2026). The CDN is simplest with no build step. Pinning keeps both builds identical and stops surprise upgrades.
- Changing the version needs both builds to agree.

## D006 — Microphone optional for v0
- **Date:** 22 Nov 2026 · **Agreed by:** Claude, ChatGPT/Codex (spec review)
- v0 can pass on timed and manual reactions alone. Mic mode (H5a) is recorded, but not required.
- **Why:** the primary goal is being watched. Quest Browser mic behaviour is unverified and shouldn't block that.

## D007 — Public test log holds technical results only
- **Date:** 22 Nov 2026 · **Agreed by:** Claude, ChatGPT/Codex (spec review)
- TEST_LOG.md records technical results plus the single H7 presence answer (yes / partly / no). Personal notes about nerves or rehearsals stay off the repo.
- **Why:** the repo is public.
