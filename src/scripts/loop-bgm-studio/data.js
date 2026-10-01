/* 表は engine.js が正本。ここは Astro ページなどの既存の import を壊さないための窓口 */
export {
  PC, QUAL, EXT, SUF, MINOR_Q, PCF, SHARP_KEYS,
  LEADS, PADS, BASSES, KITS, SCALES, SCALE_SET, PROGS, PRESETS,
  LEAD_KEYS, PAD_KEYS, BASS_KEYS, KIT_KEYS, MOOD_KEYS, SCALE_KEYS, PEAKS,
} from "./engine.js";
export const KEY_NAMES=['C','C#/D♭','D','D#/E♭','E','F','F#/G♭','G','G#/A♭','A','A#/B♭','B'];
