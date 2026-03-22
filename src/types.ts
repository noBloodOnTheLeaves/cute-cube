/** One named animation (e.g. idle, talk). */
export interface AnimationStateConfig {
  /** Frame filenames relative to `baseUrl` (e.g. `frame_001.png`). */
  frames: string[];
  /** Target playback speed in frames per second. */
  fps: number;
  /** Whether the clip loops. */
  loop: boolean;
}

/** Character mood/state (e.g. neutral, sad) paired with an action (idle, talk). */
export interface CharacterPose {
  characterState: string;
  action: string;
}

/**
 * Legacy manifest: flat clip names (`idle`, `talk`, …) each mapping to one sprite.
 */
export interface LegacyCharacterManifest {
  states: Record<string, AnimationStateConfig>;
  /** Defaults to the first key in `states` if omitted. */
  defaultState?: string;
}

/**
 * Layered manifest: actions grouped under character states, plus optional one-shot
 * transition clips between character states (`transitions[from][to]`).
 */
export interface LayeredCharacterManifest {
  characterStates: Record<string, { actions: Record<string, AnimationStateConfig> }>;
  /** Directed edges: play once (`loop: false` in each config) when switching `from` → `to`. */
  transitions: Record<string, Record<string, AnimationStateConfig>>;
  /** Defaults to the first character state and its first action if omitted. */
  defaultPose?: CharacterPose;
}

/** Union of supported manifest shapes. */
export type CharacterManifest = LegacyCharacterManifest | LayeredCharacterManifest;

export function isLayeredManifest(
  manifest: CharacterManifest,
): manifest is LayeredCharacterManifest {
  return (
    "characterStates" in manifest &&
    manifest.characterStates !== undefined &&
    Object.keys(manifest.characterStates).length > 0
  );
}

export interface CharacterPlayerOptions {
  /** Element that will receive the canvas (and optional resize observer). */
  container: HTMLElement;
  /** Manifest defining clips (flat or layered). */
  manifest: CharacterManifest;
  /** Base URL for frame files (trailing slash optional). */
  baseUrl: string;
  /** Crossfade duration when changing clips; `0` = instant swap. Default 200. */
  transitionMs?: number;
  /**
   * Legacy: initial flat state name. Ignored when `initialPose` is set or when using
   * a layered manifest with `defaultPose`.
   */
  initialState?: string;
  /** Layered: initial pose; overrides `initialState` when set. */
  initialPose?: CharacterPose;
  /** Extra scale factor after fitting to the container (default 1). */
  fitPadding?: number;
  /**
   * When true (default), `setState` / `setPose` waits until the current clip finishes one loop
   * (`loop: true`) or ends (`loop: false`) before crossfading. Set false for immediate transitions.
   */
  queueStateUntilCycleEnd?: boolean;
  /**
   * When true, emit `console.debug` for pose changes, character-state transitions, and edge lookup.
   */
  debug?: boolean;
}
