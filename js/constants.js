// MUST match CACHE_VERSION in sw.js. They travel by different routes — this
// rides in a cached JS file, that one lives in the service worker process — so
// when they disagree the device is serving stale JS out of an old cache. The
// settings screen shows both precisely so that state stops being invisible.
export const APP_VERSION = "v14";

export const GROUP_PRESETS = ["まつぼっくり", "くるみ", "くわのみ", "つぼみ", "たね"];

// Voice alias limits. Here rather than in voice.js so roster.js can enforce
// them without depending on a module that touches browser speech APIs.
// Beyond a handful of aliases per child every extra entry is another surface
// for a wrong-child match, so the cap is deliberately low.
export const MAX_ALIASES_PER_CHILD = 5;
export const MAX_ALIAS_LENGTH = 20;
