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
