# Stage Time

A VR stand-up crowd simulator: a private rehearsal tool for getting used to being watched before real open mics. Work in progress.

**Live site:** https://jamesohands.github.io/StageTime/

| Build | URL | Status |
|---|---|---|
| Claude v0 | https://jamesohands.github.io/StageTime/claude-v0/ | Ready for headset test (22 Nov 2026) — see `claude-v0/README.md` |
| ChatGPT v0 | https://jamesohands.github.io/StageTime/chatgpt-v0/ | Not built yet |

## What's in this repo

| File | Purpose |
|---|---|
| `AGENTS.md` | The project brief. Codex reads it automatically. |
| `CLAUDE.md` | Contains only `@AGENTS.md`, so Claude Code loads the same brief. |
| `SPEC.md` | The current milestone's agreed specification. |
| `STATE.md` | Where things stand right now, plus next steps (handover notes). |
| `DECISIONS.md` | Decisions made and why. |
| `TEST_LOG.md` | Test results. Desktop/assistant tests are kept separate from James's headset tests. |
| `index.html` | Landing page linking to each build. |
| `.nojekyll` | Tells GitHub Pages to serve files exactly as they are (no Jekyll processing). |
| `claude-v0/`, `chatgpt-v0/` | The two v0 bake-off builds. |

## Privacy

This repository and its website are **public**. Never commit sets, recordings, session logs, secrets or API keys. A set is loaded on the headset and stored only on that device. `private/` is git-ignored as a safe place for local-only files.

## Run on the desktop

The app is plain HTML and JavaScript with no build step, but browsers block ES modules from `file://`, so serve it locally:

1. In Terminal: `cd` into the repo folder.
2. Run `python3 -m http.server 8000`.
3. Open http://localhost:8000/claude-v0/ (or `/chatgpt-v0/`) in Chrome.

## Run in the headset

WebXR needs HTTPS, so use the live site:

1. Put on the headset and open the **Browser** app.
2. Go to the build's URL (bookmark it).
3. Follow the on-page steps, then press **Enter VR**.
4. The headset's Meta/Oculus button always exits.

## Deploy

GitHub Pages publishes from the `main` branch, root folder. Anything pushed to `main` goes live, usually within a minute or two. Check progress under the repo's **Actions** tab ("pages build and deployment"). If you don't see your changes, refresh: the browser may be showing a cached copy.

## Asset licences

Every third-party asset (sound, model, texture, font) must be listed here before it is committed. No streamed specials or ripped audio.

Shared audio goes in `/assets/audio/`, used by both builds. `/assets/audio/README.md` explains the folder layout and the `manifest.json` format.

**Recordings of real people:** because this repo is public, anyone recorded (including friends) must agree to their audio being **publicly distributed**, not just recorded. Note their consent in the table below. Your own voice is fine.

| File | Source | Author | Licence | Notes |
|---|---|---|---|---|
| — | — | — | — | No third-party assets yet. Builds use synthesised placeholders. |

## Third-party code

| Library | Version | Licence | How it's loaded |
|---|---|---|---|
| Three.js (+ add-ons) | 0.187.0 | MIT | Import map → jsDelivr, exact version (see SPEC.md §3) |
