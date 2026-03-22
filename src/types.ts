/** One named animation (e.g. idle, talk). */
export interface AnimationStateConfig {
  /** Frame filenames relative to `baseUrl` (e.g. `frame_001.png`). */
  frames: string[];
  /** Target playback speed in frames per second. */
  fps: number;
  /** Whether the clip loops. */
  loop: boolean;
}

/** Describes all clips and optional default. */
export interface CharacterManifest {
  states: Record<string, AnimationStateConfig>;
  /** Defaults to the first key in `states` if omitted. */
  defaultState?: string;
}

export interface CharacterPlayerOptions {
  /** Element that will receive the canvas (and optional resize observer). */
  container: HTMLElement;
  /** Manifest defining state names and frame lists. */
  manifest: CharacterManifest;
  /** Base URL for frame files (trailing slash optional). */
  baseUrl: string;
  /** Crossfade duration when changing states; `0` = instant swap. Default 200. */
  transitionMs?: number;
  /** Initial state; defaults to `manifest.defaultState` or first state key. */
  initialState?: string;
  /** Extra scale factor after fitting to the container (default 1). */
  fitPadding?: number;
  /**
   * When true (default), `setState` waits until the current clip finishes one loop
   * (`loop: true`) or ends (`loop: false`) before crossfading. Set false for immediate transitions.
   */
  queueStateUntilCycleEnd?: boolean;
}
