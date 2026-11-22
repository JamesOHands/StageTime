# Stage Time — project brief

## What we're building

You are my technical and creative collaborator on Stage Time, a VR stand-up crowd simulator. I'm James Hands, a UK comedy writer preparing for my first open mic, with a rehearsed five-minute set and substantial stage fright. The primary goal is stage time on demand: become accustomed to being watched, waiting, starting and continuing after a joke falls flat. Delivery, timing, improvisation and crowd work are secondary.

Build a private personal tool first, with potential to become a wider product. It complements real gigs; it is not clinical treatment or a joke-quality judge. Crowd reactions are simulated, not earned.

My background is data analysis, SQL and Power BI; assume JavaScript, 3D and VR development are new to me. Use British English. I have an M1 MacBook Pro and a possibly non-working Quest 2; likely replacement: Quest 3/3S. Support both generations; the performance target is set by the oldest headset I'm actually using, verified on hardware.

## Design priorities

1. **Presence over polish.** Convincing scale, audience gaze and movement, timing and atmosphere matter more than photorealism. Begin with a typical intimate British comedy room: spotlight, visible front rows and darker seating behind. Make lighting adjustable.
2. **Sound is central.** Spatial sound from individual seats; subtle room tone (murmurs, glasses, bar noise); applause, coughs and varied laughs. Build larger reactions from overlapping voices, not a synchronised crowd or one repeated clip.
3. **Simulate the whole gig.** Include waiting backstage while the previous act finishes, MC introduction, walk-on applause, handheld mic or stand, set timer, one-minute warning light and finish. The wait and opening moments are valuable rehearsal opportunities.
4. **Realistic, adjustable challenge.** Silence, distraction, partial laughter and optional heckling are useful. A small, half-empty open mic may be harder than an arena. Let me choose the intensity and stop any time; never escalate automatically. The aim is practising despite nerves, not maximising distress, but tell me when a setting has stopped challenging me.
5. **Real stages are the goal.** Point out if endless polishing or generous virtual crowds become a way to avoid gigs.

## Technical direction

- Start with WebXR + pinned Three.js in the Quest browser, static HTTPS hosting and no backend. Use plain modular JavaScript with no build step; for type safety, use JSDoc annotations with // @ts-check, checked by assistants that have a terminal. Adopt TypeScript/build tooling, Meta's Immersive Web SDK or Unity/OpenXR only if justified and approved. Consult current official docs.
- Hosting: GitHub Pages from a public repository. (On GitHub Free, Pages requires a public repo, and Pages sites are public even when the repo is private.) The repo and the deployed site must therefore never contain private material: no sets, recordings, logs, secrets or API keys. My set is loaded on the headset and stored only on the device.
- Use Web Audio API spatial/HRTF audio. With permission, use local microphone voice activity and pause detection via getUserMedia; provide a timed/manual fallback when access is denied or unreliable. Do not record or transmit audio by default.
- Provide the same scene in a desktop browser, with mouse-look and manual event shortcuts. Optionally render a handheld microphone on either tracked controller.
- Provide an in-headset debug overlay, toggled from a controller: frame rate, mic level, crowd state, last event and any errors.
- Separate crowd logic, rendering, audio, speech and session state. Use seeded randomness for repeatable tests and variation between rehearsals.
- Target stable headset frame pacing (at least 72 fps where supported); use lightweight varied avatars, instancing and simple lighting. Profile on the headset.
- Use original or appropriately licensed assets; record sources and licences. Never rip audio or footage from streamed specials.

## Crowd settings

Separate venue capacity, fill, generosity (receptiveness), distraction, noise and heckling. Long-term venues: pub back room (~25 seats), club (~120), theatre (~800), arena.

Disruption 0–5 is a shortcut that sets distraction, noise and heckling together: attentive; minor distractions; table chatter/interruptions; occasional canned heckle or woo; interactive heckling; unruly stag do. Higher levels are later, opt-in features. Presets: Honest Open Mic (sparse and neutral), Good Saturday (engaged), Bomb Mode (silence, coughs, someone leaving), Stag Do (later). All should remain adjustable.

## Roadmap

**v0 — Presence prototype.** One pub back room with 15–30 seats, varied low-poly audience with idle movement, a spotlight, room tone and spatial reactions. Five-minute session, start/stop controls, desktop fallback, debug overlay and manual test triggers. If local mic access works, add probabilistic pause-triggered reactions; otherwise use timed/manual events. No AI, scoring or extra venues.

**v1 — The full gig.** Complete the wait, MC, walk-on, mic/stand, timer and warning light in the same room. Add fill, generosity, disruption levels 0–3, presets and varied weighted reactions. A pause may produce silence, a titter, a ripple or a big laugh; it is not a judgement. Add optional private session logging (duration, reaction timeline, self-rated nerves, notes; recording/export only if enabled), stored on the device.

**v2 — Script-aware rehearsal.** Optionally import my set (on the device only) and mark intended laugh points and response intensity, not joke ratings. Track progress using speech timing or speech-to-text and vary/omit reactions. Add manual/director-controlled responses for rehearsing unpredictability.

**v3 — Responsive audience.** Explore contextual reactions and interactive hecklers using live speech, a language model and text-to-speech. Make them optional and adjustable. Verify latency, costs and privacy; API keys never go in the repo or site. Retain a fast procedural fallback.

**Later — Expansion and research.** Add venues and replicas of actual comedy rooms from permitted references. Investigate rights-cleared laughter-annotated datasets and consensual recordings to improve reaction timing and variability. Predicting human laughter on unseen material is experimental research, not a validated humour judge.

Test each milestone on the headset before adding dependent features. v0 succeeds when I can open the approved URL, enter VR, finish a five-minute set and feel like people are watching. Test comfort, smooth rendering, audio, controls and mic fallback. Use a safe standing position, user-controlled transitions and no forced camera motion. Improve presence before adding scope.

## Privacy and safeguards

Keep sets, audio and data private by default; get my explicit consent for recording, cloud processing, reuse or sharing, and permission before recording others. Provide adjustable sound, difficulty, pause and exit. Never auto-escalate disruption, make therapeutic claims, score joke quality or conflate head orientation with eye tracking.

## How we work together

I'm using ChatGPT/Codex and Claude/Claude Code. Judge ideas and code on merit; challenge assumptions, don't rewrite working code for style.

- Use one shared GitHub repository as the technical source of truth. For the v0 bake-off, each assistant builds in its own folder on main (/claude-v0/ and /chatgpt-v0/), so both can be tested on the headset at their own URLs; the winner becomes the app. After that, agree one implementation owner per task.
- This brief lives in AGENTS.md (Codex reads it automatically; CLAUDE.md contains only @AGENTS.md so Claude Code loads it too). Also keep README.md (setup, run, deploy, asset licences), SPEC.md (current milestone), STATE.md, DECISIONS.md and TEST_LOG.md current. Record changes, tests, issues and next steps for handover.
- Read current code, spec and project state before edits. If you have repository/terminal access, edit and test directly. Otherwise provide complete, correctly pathed files or clear patches, not vague fragments.
- Give numbered setup steps and concrete headset tests with expected results. Distinguish desktop/emulator tests from actual tests I have performed in the headset; don't pretend you can wear it.
- Flag costs and ask before paid services, private data uploads, major architectural changes or public releases. Prefer small, verifiable working implementations to extensive plans.

Before coding, agree a single v0 specification (scope, file structure, approach, acceptance tests). Any bake-off uses that spec. Build the smallest headset-testable app and iterate from my feedback.
