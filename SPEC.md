# SPEC — v0 Presence Prototype

**Status: READY FOR SIGN-OFF.** Claude drafted this on 22 Nov 2026 and revised it after ChatGPT/Codex's review the same day (see §7). It becomes **Agreed** when James says so. After that, both bake-off builds follow it, and changes need James's approval.

All numbers below are **starting values**, to be tuned once James has tried a working build in the headset.

## 1. Goal

James can open the build's URL, enter VR, perform a full five-minute set to a small pub-back-room crowd, and **feel like people are watching**. Every v0 decision serves presence: scale, gaze, idle movement, lighting and sound. Polish and features come second.

The microphone is a bonus, not a requirement. A convincing room with timed and manual reactions meets the v0 goal.

## 2. Scope

### In v0

**Venue and scale**
- One pub back room with **30 seats** (rows or small tables), 3–4 m deep, a low ceiling, and a small stage at one end.
- **Floor heights:** WebXR's `local-floor` origin is the real floor James is standing on, so **the stage surface is at y = 0**. The audience floor sits **0.45 m below** it (`y = −0.45`). Everything is built relative to that, so James is never made to feel taller or shorter than he is. On desktop, the camera sits at 1.7 m above the stage.
- Stage: the riser edge, a back wall, a mic stand and a single spotlight on the performer. Front rows clearly lit, back rows darker. A suggestion of a bar at the back (lit shelf, a figure behind it).
- **Adjustable lighting:** house-lights level and spotlight intensity, set on the entry page.

**Audience**
- 15–30 occupied seats (default **20**). Which seats are filled is seeded.
- Lightweight, varied low-poly figures made from simple shapes, with varied height, build, skin tone, clothing colour, and the odd hat or glasses. Instanced where possible.
- **Readable faces:** front-row heads have simple features (eyes, brows, nose) so it's obvious from the stage which way each one is facing. Blank spheres don't count. Back rows can be simpler, since they're in the dark.
- **Gaze:** heads turn towards the performer's *head position*, with lag and small offsets for each person. Front-row bodies turn slightly too. At any moment roughly 80–90% are looking at the stage. The rest glance at a drink, a phone or a neighbour, then look back. The painted eyes move with the head. It's head orientation only, with no eye tracking, and the app never claims otherwise.
- **Idle movement:** breathing, small posture shifts, occasional sips, leaning back or forward. Never in sync: every motion has its own seeded phase and timing.
- **Reaction animation:** laughing figures shake their shoulders, tilt their heads or lean back, in proportion to their part in the reaction.

**Sound** (Web Audio API)
- A spatial voice for each seat: a `PannerNode` (HRTF) at each audience head.
- **Room tone:** a quiet murmur bed, bar sounds from the back (glasses, till), occasional individual coughs and shuffles. It hushes slightly when the set starts.
- **Reactions are built from individuals.** Each audience member has a "voice": a small set of clips plus their own pitch (playback rate 0.9–1.1) and loudness. A reaction is a set of participants, each starting at a staggered time.
  - *Titter:* 1–3 people, onset spread over 0–300 ms.
  - *Ripple:* 4–8 people, spread over 0–500 ms.
  - *Laugh:* 50–90% of the room, a few starters then the rest over 0–800 ms, each with a different length.
  - *Applause:* individual clappers overlapping, building up and tailing off.
- Never one shared crowd clip. The same clip doesn't replay from the same seat twice in a row.
- **Master volume:** set on the entry page and adjustable in VR.
- **Placeholder sounds first.** Until a licensed human sound library exists, builds use simple synthesised placeholders (noise bursts and tones). If the audio files are missing, a build falls back to placeholders automatically.

**Session**
- An entry page (2D, before VR) offers: an optional **Enable microphone** button, mode (mic / timed / manual), volume, lighting, seed, **Enter VR**, and **Start on desktop**.
- Mic permission is requested **on the entry page, before entering VR**, because permission prompts may not show inside an immersive session.
- In VR you stand on the stage at your real height, facing the crowd. No locomotion, no forced camera movement.
- States: `ready` (crowd present, chatter a little louder) → `running` (timer counts down from 5:00) → `finished` (applause, then the crowd settles back). You can stop at any time.
- **Countdown:** a small display on the back wall, visible by default, unobtrusive, and easily switched off. (The one-minute warning light is v1.)
- **Stopping** a session, at any point:
  - cancels every reaction that's scheduled but not yet started;
  - fades out any reaction already playing within about 300 ms;
  - stops pause detection.
- **Exiting VR** (the in-app control or the system button) ends the WebXR session with `XRSession.end()`, stops the session, and **releases the microphone** by stopping every track. Leaving or hiding the page does the same.
  - A build may also release the mic on every stop, but only if headset testing shows that getting it back doesn't re-prompt invisibly inside VR.

**Reaction triggering** (three modes)

*Mic mode:* local voice-activity and pause detection.
- **Speech** means mic level stays above an adaptive noise floor for at least 150 ms.
- **A qualifying pause** means:
  - at least **700 ms** below the floor;
  - after a speech segment of at least 2 s;
  - at least 4 s since the last reaction.
- **One pause, one outcome.** Each qualifying pause produces exactly one outcome, and silence counts as an outcome. Detection then re-arms only after **fresh speech** (a new segment of at least 2 s). A long silence can never trigger a string of reactions.
- **Outcome weights:** silence 40, titter 30, ripple 20, laugh 10. These are constants in `config.js`. A pause is never treated as a judgement of the joke.
- **Echo guard:**
  - The headset mic will pick up crowd audio from the headset speakers.
  - Request `echoCancellation` and `noiseSuppression`.
  - Ignore speech detection during, and for 500 ms after, any reaction louder than a titter.
- Audio is analysed in memory only. Nothing is recorded, stored or transmitted.

*Timed mode:* seeded reactions every 15–40 s of session time, using the same weights. This is used automatically if mic permission is denied or the mic fails, and the debug overlay says so.

*Manual mode:* reactions only from buttons or keys. Manual triggers also work in the other two modes.

**Controls**

| Action | Quest controller | Desktop |
|---|---|---|
| Start / stop session | Hold right thumbstick press for 1 s | Space |
| Laugh | A | L |
| Titter | B | T |
| Applause | X | P |
| Cough | Y | C |
| Toggle debug overlay | Left thumbstick press | D |
| Volume up / down | Right thumbstick up / down | + / − |
| **Exit VR** | **Hold both grips for 1 s** | — |
| Look around | Your head | Click to lock mouse; Esc to release |
| Emergency exit | Meta/Oculus button (system) | Close tab |

Optional: render a handheld mic on the right controller, switchable to the left. A mic stand is always on stage.

**Debug overlay**
- In VR it's attached to the left controller or a fixed spot. On desktop it's a DOM panel.
- It shows:
  - current fps and the session's target refresh rate;
  - the lowest fps over the last 10 s;
  - mic level, speech/pause state and whether detection is armed;
  - mode, session state and time left;
  - crowd state and the last event;
  - the seed and any caught errors.

**Repeatable randomness**
- **Separate seeded streams.** One master seed (`?seed=`, random if absent, shown in the overlay) is used to derive independent random streams for:
  - **appearance** (seat fill, looks);
  - **idle** (movement phases and timing);
  - **reactions** (outcome rolls, participants, onset jitter);
  - **schedule** (timed-mode event times).
- Adding or removing draws in one stream never shifts another.
- **No dependence on frame rate.** Events are scheduled on the session clock, never as per-frame random draws. The same seed gives the same event timeline at any frame rate.
- **Other URL parameters:**
  - `?mode=mic|timed|manual`
  - `?fill=15..30`
  - `?minutes=1..10` (default 5)

### Not in v0
Backstage wait, MC, walk-on, warning light, generosity/disruption settings, presets, heckling, session logging, set import, speech-to-text, AI, scoring, other venues, locomotion.

## 3. Approach and file structure

Plain ES modules, no build step. Every JS file starts with `// @ts-check` and uses JSDoc types.

**Three.js is pinned to 0.187.0** (r187, MIT) for both builds, including add-ons, via an import map:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"
  }
}
</script>
```

Changing the version needs agreement from both builds and an entry in DECISIONS.md.

Both builds use this layout inside their own folder:

```
<build>-v0/
├── index.html            entry page + import map
├── main.js               wires modules together; owns the render loop
└── src/
    ├── config.js         all tunable constants (weights, timings, defaults)
    ├── rng.js            seeded PRNG + named stream derivation
    ├── events.js         tiny event bus
    ├── session.js        session state machine + timer               ┐
    ├── crowd.js          seats, members, attention, reaction choice  │ pure logic: no DOM,
    ├── speech.js         voice activity + pause state machine,       │ Three.js or Web Audio;
    │                     fed (time, level) samples                   ┘ importable in Node for tests
    ├── mic.js            getUserMedia, AnalyserNode → level samples; start/stop; owns the tracks
    ├── audio.js          AudioContext, per-seat panners, room tone, reaction playback
    ├── render/
    │   ├── room.js       venue geometry + lighting
    │   ├── audience.js   avatar meshes, faces, gaze, idle + reaction animation
    │   └── overlay.js    debug overlay (VR panel + desktop DOM)
    └── input/
        ├── desktop.js    pointer lock + keys
        └── xr.js         controller buttons, exit VR, optional handheld mic
```

**Separation rule:** `session.js`, `crowd.js` and `speech.js` are pure logic. They never touch the DOM, Three.js or audio nodes. They emit events (`{type:'reaction', kind:'laugh', participants:[…], at}`, `{type:'pause', …}`, `{type:'session', state:'running'}`). `mic.js` turns the microphone into level samples, and `speech.js` decides what those samples mean, so pause logic can be tested with synthetic data. The renderer and audio subscribe to events.

## 4. Bake-off rules

- **Own folder only.** Each assistant edits only its own build folder (`/claude-v0/` or `/chatgpt-v0/`).
- **Shared files.** These are the root docs, `/assets/` and the root `index.html`. Pull before editing, make small focused commits, and never rewrite the other assistant's sections. STATE.md has a section for each build.
- **Same inputs.** Both builds use the same Three.js version, the same shared `/assets/audio/` library (once it exists) and the defaults in this spec.
- **Same comparison.** James tests both builds on the same headset in the same sitting. The final comparison uses the real sound library, not placeholders.

## 5. Performance budget (until verified on hardware)

Target the Quest 2 until we know it's dead, then whichever headset is actually used.

- Sustained, comfortable frame rate at the session's refresh rate (at least 72 fps). Record what the headset actually does. A brief dip while loading isn't an automatic failure; repeated or felt judder is.
- Roughly ≤ 100 draw calls and ≤ 100k triangles, with instanced audience parts.
- No real-time shadows. Use a fake spotlight (a soft floor pool plus a faint cone) and cheap materials (Lambert/basic). Keep textures minimal; a small shared face texture is fine.
- Fixed foveation on. Default framebuffer scale.
- Audio: cap simultaneous reaction voices at about 24. If HRTF panning costs too much CPU, fall back to equal-power panning for the back rows.

## 6. Acceptance tests

### Desktop / assistant (prove the code runs; do not count towards acceptance)
- **D1** Loads in desktop Chrome with no console errors. Room, stage and audience visible. Mouse-look works.
- **D2** Every desktop key from the table triggers its event, and the overlay shows it as the last event.
- **D3** The same `?seed=` gives the same seat fill, appearance and timed-event timeline, including when the frame rate is throttled. A different seed gives a different result.
- **D4** The session runs `ready → running → finished` with `?minutes=1`. Stopping early works from any state, and no reaction plays after a stop.
- **D5** Denying mic permission falls back to timed mode, shown in the overlay, with no errors.
- **D6** The type check passes (`tsc --noEmit` with `allowJs`/`checkJs`), run by an assistant with a terminal.
- **D7** With audio files absent, the build runs on placeholder sounds.
- **D8** Synthetic samples fed into `speech.js`:
  - 3 s speech then 10 s silence gives **exactly one** outcome;
  - a second outcome needs new speech of at least 2 s;
  - sounds during the echo-guard window are ignored.
- **D9** In desktop Chrome with a fake mic, ending the session or leaving the page stops every mic track (the browser's mic indicator goes off).

### Headset (James)
- **H1** Open the URL in Quest Browser. Enter VR works. You're standing on the stage at your natural height, facing the crowd. No camera movement you didn't cause.
- **H2** Frame rate stays at the session's refresh rate (at least 72 fps) through a full five-minute session, apart from brief dips. Note the headset and the lowest fps the overlay showed.
- **H3** The crowd reads as people: front rows visible, back rows dimmer. You can tell which way front-row faces are looking, and heads follow you as you move around the stage. Nobody moves in sync.
- **H4** Room tone audible. When you turn your head, a laugh or cough stays where it came from.
- **H5a (mic, optional for v0)** Talk, then pause:
  - sometimes nothing happens, sometimes there's a reaction of varying size;
  - one pause never gives more than one reaction;
  - the crowd's own noise doesn't re-trigger it.
- **H5b (fallback)** With the mic denied, timed mode runs, and manual triggers still work.
- **H6** Every controller action in the table works, including **Exit VR** (hold both grips), which returns you to the entry page.
- **H7** Perform your full set start to finish. Then answer: did it feel like people were watching (yes / partly / no)?

**v0 passes** when H1–H4, H5b, H6 and H7 pass on James's headset, and H7's answer is "yes". H5a is recorded but not required.

TEST_LOG.md is public, so it holds technical results only. Keep any personal notes about nerves or how the rehearsal went somewhere private, such as your own notes app.

## 7. Settled questions and review

**Settled questions** (starting values, to be tuned after a headset test)

| Question | Answer |
|---|---|
| Audio clips | Placeholders first. James will download and/or record a shared, properly licensed human sound library before the final comparison. Anyone recorded must consent to their audio being **publicly distributed**, because the repo is public. Consent to being recorded isn't enough. |
| Pause threshold | 700 ms |
| Reaction weights | Silence 40, titter 30, ripple 20, laugh 10 |
| Three.js loading | Import map pinned to 0.187.0 on jsDelivr, same version and add-ons for both builds |
| Countdown display | Visible by default, unobtrusive, easily switched off |

**Review log**
- *22 Nov 2026, Claude:* first draft.
- *22 Nov 2026, ChatGPT/Codex review, all accepted:*
  1. Mic is optional for passing v0.
  2. `mic.js` is split from `speech.js`.
  3. One outcome per pause; detection re-arms only on fresh speech.
  4. Stage surface at `local-floor`, audience floor below; 30 physical seats.
  5. Readable front-row faces.
  6. Explicit Exit VR control; stopping cancels pending reactions and releases the mic.
  7. Separate seeded streams, independent of frame rate.
  8. Bake-off fairness rules.
  9. Performance criteria and a technical-only public test log.
- *22 Nov 2026, Claude:*
  - Releasing the mic on every *stop* (not just on exit) is allowed only if getting it back doesn't re-prompt invisibly inside VR. A hidden permission prompt in the headset would break the session.
  - H7 keeps one presence answer (yes / partly / no), because it's the v0 success criterion. Personal notes stay private.
- *22 Nov 2026, James:* nothing to add. Will tune values after trying a working build.
