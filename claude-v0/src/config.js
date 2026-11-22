// @ts-check
/**
 * Every tunable number for the Claude v0 build lives here.
 * These are starting values from SPEC.md: tune them after headset tests,
 * and record meaningful changes in DECISIONS.md.
 *
 * Coordinates: metres. The performer stands at the origin facing −Z.
 * y = 0 is the stage surface, which is also the real floor in VR (local-floor).
 */

export const CONFIG = {
  venue: {
    stageFloorY: 0,
    audienceFloorY: -0.45,
    stageFrontZ: -1.1,
    stageBackZ: 1.7,
    stageWidth: 4.4,
    roomWidth: 7.4,
    roomBackZ: -8.4,
    ceilingY: 2.9,
    /** Seats per row, front to back. 5 × 6 = 30 seats. */
    rows: [6, 6, 6, 6, 6],
    firstRowRadius: 2.4,
    rowSpacing: 0.95,
    seatSpacing: 0.66,
    /** Chair seat height above the audience floor. */
    seatHeight: 0.45,
    /** Relative chance of a seat being filled, per row. Open-mic crowds avoid the front row. */
    rowFillWeights: [0.65, 1.0, 1.1, 1.05, 0.9],
    micStand: { x: 0.42, z: -0.72 },
    /** The spotlight hangs from the ceiling over the audience and shines back at you. */
    spotLampZ: -4.2,
  },

  /** Body proportions shared by crowd logic (head positions for audio) and rendering. */
  body: {
    hipToShoulder: 0.5,
    shoulderToHead: 0.2,
    headRadius: 0.105,
    shoulderWidth: 0.38,
  },

  audience: {
    fillDefault: 20,
    fillMin: 15,
    fillMax: 30,
    /** How long people look at the stage vs. away, in ms, while a set is running (~85% attention). */
    running: { stageMs: [8000, 25000], awayMs: [1500, 4500] },
    /** Before the set starts the room chats more (~55% attention). */
    ready: { stageMs: [2000, 7000], awayMs: [2000, 6000] },
    /** When the set starts, people who are looking away turn to the stage within this window. */
    hushTurnMs: [300, 2000],
    /** Weights for where people look when they look away. */
    awayWeights: { drink: 45, neighbour: 35, down: 15, phone: 5 },
    drinkChance: 0.6,
    hatChance: 0.15,
    glassesChance: 0.25,
    baldChance: 0.12,
  },

  palettes: {
    skin: [0xf1c7a5, 0xe0ac86, 0xc68863, 0xa86b4a, 0x8d5534, 0x6b3f25, 0x4e2d1b, 0xf6d6c0],
    shirt: [0x23324a, 0x1d1d22, 0x5a5f66, 0x6e2a30, 0x4b5530, 0x3e5878, 0x8a6a2c, 0xcfc6b4, 0x2f4f4f, 0x7a4b6a],
    hair: [0x1a1410, 0x3b2616, 0x6b4a2b, 0xb89058, 0x9a4a22, 0x8c8c8c],
    hat: [0x2b2b30, 0x5b3a29, 0x3a4a5a, 0x7d2b2b],
    trousers: [0x1f2633, 0x2b2b2b, 0x3c3a34, 0x2e3b52],
  },

  session: {
    minutesDefault: 5,
    minutesMin: 1,
    minutesMax: 10,
  },

  reactions: {
    /** Outcome weights for a qualifying pause or a timed event. A pause is never a judgement. */
    weights: { silence: 40, titter: 30, ripple: 20, laugh: 10 },
    titter: { count: [1, 3], spreadMs: 300, durMs: [600, 1300] },
    ripple: { count: [4, 8], spreadMs: 500, durMs: [900, 1900] },
    laugh: { fraction: [0.5, 0.9], starters: [1, 3], starterSpreadMs: 150, spreadMs: 800, durMs: [1400, 3200] },
    applause: { fraction: [0.75, 1.0], spreadMs: 700, durMs: [3000, 5500] },
    cough: { durMs: [500, 900] },
    /** Reactions louder than these trigger the mic echo guard. */
    loudKinds: ['ripple', 'laugh', 'applause'],
  },

  speech: {
    /** Level must stay above the noise floor this long to count as speech. */
    voiceMinMs: 150,
    /** Silence this long after speech is a pause. */
    pauseMs: 700,
    /** Speech segment needed before a pause qualifies (and to re-arm after an outcome). */
    minSegmentMs: 2000,
    /** Minimum time between any two reactions triggered by pauses. */
    cooldownMs: 4000,
    /** Ignore the mic for this long after a loud reaction ends. */
    echoGuardMs: 500,
    /** dB above the adaptive noise floor that counts as voice. */
    thresholdDb: 12,
    /** Ignore anything quieter than this, whatever the floor. */
    absMinDb: -58,
    calibrationMs: 1000,
    floorFallTauMs: 300,
    floorRiseTauMs: 3000,
    floorRiseDuringVoiceTauMs: 60000,
  },

  timed: { gapMs: [15000, 40000] },

  ambience: {
    coughGapMs: [15000, 45000],
    glassGapMs: [4000, 12000],
    shuffleGapMs: [6000, 20000],
  },

  audio: {
    maxVoices: 24,
    volumeDefault: 0.8,
    volumeStep: 0.1,
    /** Set false to use cheaper equal-power panning for rows 3–5 if HRTF costs too much on the headset. */
    hrtfBackRows: true,
    /** Room murmur level while a set runs, relative to before it starts. */
    hushGain: 0.4,
    cancelFadeMs: 300,
    sampleRate: 48000,
  },

  lighting: {
    houseDefault: 0.35,
    spotDefault: 1.0,
  },

  desktop: { eyeHeight: 1.7 },
};

/** @typedef {'silence'|'titter'|'ripple'|'laugh'} Outcome */
/** @typedef {'titter'|'ripple'|'laugh'|'applause'|'cough'} ReactionKind */
/** @typedef {'mic'|'timed'|'manual'} Mode */
