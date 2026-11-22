# SPEC — v0 Presence Prototype

**Status: DRAFT.** Claude drafted this on 22 Nov 2026. It needs review from James and ChatGPT/Codex. Once James marks it **Agreed**, both bake-off builds follow it.

## 1. Goal

James can open the build's URL, enter VR, perform a full five-minute set to a small pub-back-room crowd, and **feel like people are watching**. Every v0 decision serves presence: scale, gaze, idle movement, lighting and sound. Polish and features come second.

## 2. Scope

### In v0

**Venue**
- One pub back room with about 25 seats in rows or around small tables, 3–4 m deep, a low ceiling and a small raised stage at one end.
- Stage: a small riser, a back wall, a mic stand and a single spotlight on the performer. Front rows clearly lit, back rows darker. A suggestion of a bar at the back (lit shelf, a figure behind it).
- **Adjustable lighting:** house-lights level and spotlight intensity, set on the entry page.

**Audience**
- 15–30 occupied seats (default 20). Which seats are filled is seeded.
- Lightweight, varied low-poly figures made from simple shapes (body, head, arms), with varied height, build, skin tone, clothing colour, and the odd hat or glasses. No realism needed. Instanced where possible.
- **Gaze:** heads turn to face the performer's *head position*, with lag and small offsets for each person. At any moment roughly 80–90% are looking at the stage. The rest glance at a drink, a phone or a neighbour, then look back. This is head orientation only. There is no eye tracking, and nothing claims there is.
- **Idle movement:** breathing, small posture shifts, occasional sips, leaning back or forward. Never in sync: every motion has its own seeded phase and timing.
- **Reaction animation:** laughing figures shake their shoulders, tilt their heads or lean back, in proportion to their part in the reaction.

**Sound** (Web Audio API)
- A spatial voice for each seat: a `PannerNode` (HRTF) placed at each audience head.
- **Room tone:** a quiet murmur bed, bar sounds from the back (glasses, till), occasional individual coughs and shuffles. It hushes slightly when the set starts.
- **Reactions are built from individuals.** Each audience member has a "voice": a small set of clips plus their own pitch (playback rate 0.9–1.1) and loudness. A reaction is a set of participants, each starting at a staggered time.
  - *Titter:* 1–3 people, onset spread over 0–300 ms.
  - *Ripple:* 4–8 people, spread over 0–500 ms.
  - *Laugh:* 50–90% of the room, a few starters followed by the rest over 0–800 ms, each with a different length.
  - *Applause:* individual clappers overlapping, building up and tailing off.
- Never one shared crowd clip. The same clip doesn't replay from the same seat twice in a row.
- **Master volume:** set on the entry page and adjustable in VR.
- **Missing-asset fallback:** if audio files are absent, the build still runs with simple synthesised placeholders (noise bursts or tones), so code isn't blocked waiting for assets.

**Session**
- An entry page (2D, before VR) offers: an optional **Enable microphone** button, mode (mic / timed / manual), volume, lighting, seed, **Enter VR**, and **Start on desktop**.
- Mic permission is requested **on the entry page, before entering VR**. Permission prompts may not show inside an immersive session.
- In VR you stand on the stage at your real height (`local-floor`), facing the crowd. No locomotion, no forced camera movement.
- States: `ready` (crowd present, chatter a little louder) → `running` (timer counts down from 5:00) → `finished` (applause, then the crowd settles back). You can stop at any time.
- A small countdown display on the back wall, which you can turn off. (The one-minute warning light is v1.)

**Reaction triggering** (three modes)
- **Mic mode:** local voice-activity and pause detection.
  - Speech means mic level stays above an adaptive noise floor for at least 150 ms.
  - A pause means at least 700 ms below that floor, after at least 2 s of speech, and at least 4 s since the last reaction.
  - Each qualifying pause rolls one weighted outcome. Proposed v0 weights: **silence 40, titter 30, ripple 20, laugh 10**. These are constants in one file, easy to tune.
  - A pause is never treated as a judgement of the joke.
  - **Echo guard:** the headset mic will pick up crowd audio from the headset speakers. Request `echoCancellation` and `noiseSuppression`, and ignore detection during, and for 500 ms after, any reaction louder than a titter.
  - Audio is analysed in memory only. Nothing is recorded, stored or transmitted.
- **Timed mode:** seeded reactions every 15–40 s using the same weights. This is used automatically if mic permission is denied or the mic fails, and the debug overlay says so.
- **Manual mode:** reactions only from buttons or keys. Manual triggers also work in the other two modes.

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
| Look around | Your head | Click to lock mouse; Esc to release |
| Exit | Meta/Oculus button (system) | Close tab |

Optional: render a handheld mic on the right controller, switchable to the left. A mic stand is always on stage.

**Debug overlay** (in VR, attached to the left controller or a fixed spot; a DOM panel on desktop) shows: fps, mic level and speech/pause state, mode, session state and time left, crowd state, last event, seed, and any caught errors.

**Repeatable randomness:** one seeded PRNG drives seat fill, appearance, idle timing and timed-mode events. Seed comes from `?seed=` (random if absent) and is shown in the overlay. Other URL parameters: `?mode=mic|timed|manual`, `?fill=15..30`, `?minutes=1..10` (default 5).

### Not in v0
Backstage wait, MC, walk-on, warning light, generosity/disruption settings, presets, heckling, session logging, set import, speech-to-text, AI, scoring, other venues, locomotion.

## 3. Approach and file structure

Plain ES modules, no build step. Three.js is pinned to an exact release via an import map (see open question 4). Every JS file starts with `// @ts-check` and uses JSDoc types.

Both builds use this layout inside their own folder:

```
<build>-v0/
├── index.html            entry page + import map
├── main.js               wires modules together; owns the render loop
└── src/
    ├── config.js         all tunable constants (weights, timings, defaults)
    ├── rng.js            seeded PRNG
    ├── events.js         tiny event bus
    ├── session.js        session state machine + timer           (no Three.js, no audio)
    ├── crowd.js          seats, members, attention, reaction choice (no Three.js, no audio)
    ├── speech.js         mic, voice activity, pause detection, fallback
    ├── audio.js          AudioContext, per-seat panners, room tone, reaction playback
    ├── render/
    │   ├── room.js       venue geometry + lighting
    │   ├── audience.js   avatar meshes, gaze, idle + reaction animation
    │   └── overlay.js    debug overlay (VR panel + desktop DOM)
    └── input/
        ├── desktop.js    pointer lock + keys
        └── xr.js         controller buttons, optional handheld mic
```

**Separation rule:** `crowd.js`, `session.js` and `speech.js` never import Three.js or touch audio nodes. They emit events (`{type:'reaction', kind:'laugh', participants:[…], at}`, `{type:'pause', …}`, `{type:'session', state:'running'}`). Renderer and audio subscribe. That keeps crowd logic testable without a headset.

**Shared assets:** audio clips live at repo root in `/assets/audio/`, used by both builds, so the bake-off compares builds, not sound sourcing. Each file is listed in README.md → Asset licences before it is committed.

## 4. Performance budget (until verified on hardware)

Target the Quest 2 until we know it's dead, then whichever headset is actually used.

- 72 fps sustained, all session long, with the overlay open.
- Roughly ≤ 100 draw calls and ≤ 100k triangles. Instanced audience parts.
- No real-time shadows. Use a fake spotlight: a soft floor pool plus a faint cone. Use cheap materials (Lambert/basic), and keep textures minimal.
- Fixed foveation on. Default framebuffer scale.
- Audio: cap simultaneous reaction voices at about 24. If HRTF panning costs too much CPU, fall back to equal-power panning for the back rows.

## 5. Acceptance tests

### Desktop / assistant (prove the code runs; do not count towards acceptance)
- **D1** Loads in desktop Chrome with no console errors. Room, stage and audience visible. Mouse-look works.
- **D2** Every desktop key from the table triggers its event, and the overlay shows it as the last event.
- **D3** The same `?seed=` gives the same seat fill, appearance and timed-event schedule. A different seed gives a different result.
- **D4** Session runs `ready → running → finished` with `?minutes=1`. Stopping early works from any state.
- **D5** Denying mic permission falls back to timed mode, shown in the overlay, with no errors.
- **D6** Type check passes (`tsc --noEmit` with `allowJs`/`checkJs`), run by an assistant with a terminal.
- **D7** With audio files removed, the build still runs on placeholder sounds.

### Headset (James)
- **H1** Open the URL in Quest Browser. Mic and Enter VR work. You're standing on the stage at a natural height facing the crowd. No camera movement you didn't cause.
- **H2** The overlay shows ≥ 72 fps throughout a full five-minute session. Note which headset.
- **H3** The crowd reads as people: front rows visible, back rows dimmer. Heads track you as you move around the stage. Nobody moves in sync.
- **H4** Room tone audible. When you turn your head, a laugh or cough stays where it came from.
- **H5** Mic mode: talk, then pause. Sometimes nothing happens, sometimes there's a reaction of varying size. The crowd's own noise doesn't keep re-triggering it. With mic denied, timed mode works.
- **H6** Every controller action in the table works. Volume changes. The overlay toggles. The Meta button exits cleanly.
- **H7** Perform your full set start to finish. Log it in TEST_LOG.md (no set content).

**v0 passes** when H1–H7 pass on James's headset and H7's "felt watched" score is good enough that James wants to keep rehearsing in it rather than fix basics.

## 6. Open questions

1. **Audio clips.** We need roughly 20–30 individual laughs (different people), 10 chuckles/titters, 5 single-person clapping clips, 6 coughs, 6 bar/glass sounds and 1–2 room-tone loops of 60 s or more. Options:
   - (a) CC0/CC-BY clips from Freesound. You'd download them with a free account; assistants can't reach it.
   - (b) Record yourself and willing friends (consent from each).
   - (c) A mix.
   
   The recommendation is (c): start with Freesound CC0 for the bed and coughs, and add recorded laughs for variety. Until then, builds use placeholders.
2. **Pause threshold** — 700 ms default? Tune it on the headset.
3. **Reaction weights** — 40/30/20/10 is a sparse, neutral open-mic feel. Too harsh or too generous for v0?
4. **Three.js loading** — the recommendation is an import map pinned to an exact version on jsDelivr: simplest, with no copies to update. Vendor a copy into the repo only if the CDN causes trouble. Record the version in README.md.
5. **Countdown display** — visible by default, or off?

## 7. Review notes

_ChatGPT/Codex and James: add comments or objections here, with your name and the date._
