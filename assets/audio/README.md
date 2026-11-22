# Shared sound library

Both v0 builds read their crowd sounds from here. Until clips are added, `manifest.json` is empty (`{}`) and the builds use synthesised placeholders.

**Before adding any file**, list it in the root README.md → Asset licences: source, author, licence, and (for recordings of people) their consent to **public distribution**. This repo and site are public.

## Adding clips

1. Put each clip in a folder for its kind, e.g. `laugh/01.ogg`. One person per clip. Trim silence from the start. Mono is fine.
2. List the files in `manifest.json`:

```json
{
  "laugh":    ["laugh/01.ogg", "laugh/02.ogg"],
  "titter":   ["titter/01.ogg"],
  "applause": ["applause/01.ogg"],
  "cough":    ["cough/01.ogg"],
  "glass":    ["glass/01.ogg"],
  "shuffle":  ["shuffle/01.ogg"],
  "murmur":   ["murmur/room-01.ogg"]
}
```

Any kind left out keeps its placeholders. `.ogg` (Opus or Vorbis), `.mp3` and `.wav` all work in the Quest browser. Prefer `.ogg` or `.mp3`, because they're smaller.

## What's needed

| Kind | How many | Notes |
|---|---|---|
| laugh | 20–30 | Different people. 1.5–4 s each. Also used for ripples. |
| titter | ~10 | Short chuckles, 0.5–1.5 s. |
| applause | ~5 | **One person** clapping, 5–8 s. The crowd is built by layering these. |
| cough | ~6 | Single coughs. |
| glass | ~6 | Glass clinks, bar sounds. |
| shuffle | ~4 | Chair creaks, rustles. |
| murmur | 1–2 | Room chatter, 60 s or longer, no clear words. Loops. |
