/** Uniform grid spritesheet: one image, equal-sized cells. */
export type GridSheetOrder = "row-major" | "column-major";
export interface GridSheetConfig {
  /** Image path relative to `baseUrl`. */
  image: string;
  frameWidth: number;
  frameHeight: number;
  /** Number of columns in the grid (>= 1). */
  columns: number;
  /**
   * Frames to play (may leave unused cells at the end of the grid).
   * Determines how the linear `frameCount` sequence maps onto the 2D grid.
   */
  frameCount: number;
  /**
   * How frames are read out of the grid.
   * - Default: `row-major` (left-to-right, then top-to-bottom)
   * - `column-major` (top-to-bottom, then left-to-right)
   */
  order?: GridSheetOrder;
}

/** One named animation (e.g. idle, talk): either per-frame files or a single grid sheet. */
export type AnimationStateConfig = AnimationStateFramesConfig | AnimationStateGridSheetConfig;

export interface AnimationStateFramesConfig {
  /** Frame filenames relative to `baseUrl` (e.g. `frame_001.png`). */
  frames: string[];
  fps: number;
  loop: boolean;
}

export interface AnimationStateGridSheetConfig {
  gridSheet: GridSheetConfig;
  fps: number;
  loop: boolean;
}

export function isGridSheetAnimation(
  cfg: AnimationStateConfig,
): cfg is AnimationStateGridSheetConfig {
  return "gridSheet" in cfg && cfg.gridSheet !== undefined;
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
   * Optional rendered size in CSS pixels (sprite texture dimensions × scale).
   * When either is set, scaling follows these constraints instead of fitting the container;
   * the sprite stays centered in the container and may extend past its edges.
   * - Only `characterWidth`: scale so width matches.
   * - Only `characterHeight`: scale so height matches.
   * - Both: preserve aspect ratio and fit inside the box (contain).
   */
  characterWidth?: number;
  characterHeight?: number;
  /**
   * When true, `setState` / `setPose` waits until the current clip finishes one loop (`loop: true`)
   * or ends (`loop: false`) before crossfading. Default false: apply the new clip as soon as the
   * request is processed (still queued while a crossfade or character-state transition clip runs).
   */
  queueStateUntilCycleEnd?: boolean;
  /**
   * When true, emit `console.debug` for pose changes, character-state transitions, and edge lookup.
   */
  debug?: boolean;
}
