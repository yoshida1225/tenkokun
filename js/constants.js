export const GROUP_PRESETS = ["まつぼっくり", "くるみ", "くわのみ", "つぼみ", "たね"];

// Voice alias limits. Here rather than in voice.js so roster.js can enforce
// them without depending on a module that touches browser speech APIs.
// Beyond a handful of aliases per child every extra entry is another surface
// for a wrong-child match, so the cap is deliberately low.
export const MAX_ALIASES_PER_CHILD = 5;
export const MAX_ALIAS_LENGTH = 20;
