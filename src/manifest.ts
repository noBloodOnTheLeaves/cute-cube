import type {
  AnimationStateConfig,
  AnimationStateGridSheetConfig,
  CharacterManifest,
  CharacterPose,
  GridSheetConfig,
  GridSheetOrder,
  LayeredCharacterManifest,
  LegacyCharacterManifest,
} from "./types.js";
import { isLayeredManifest } from "./types.js";

/** Separator for flat keys: `characterState/action` (e.g. `neutral/idle`). */
export const POSE_KEY_SEPARATOR = "/";

/** `frame_001.png` … `frame_181.png` */
export function idleFrameNames(count = 181): string[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return `frame_${n}.png`;
  });
}

/** `idle/frame_001.png` … when `subdir` is `idle`; use with `baseUrl` at the assets root. */
export function framePaths(subdir: string, count: number): string[] {
  const prefix = subdir.replace(/\/$/, "");
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return `${prefix}/frame_${n}.png`;
  });
}

export function poseToKey(pose: CharacterPose): string {
  return `${pose.characterState}${POSE_KEY_SEPARATOR}${pose.action}`;
}

/** Parse `neutral/idle` into a pose; returns null if not a layered key. */
export function keyToPose(key: string): CharacterPose | null {
  const i = key.indexOf(POSE_KEY_SEPARATOR);
  if (i <= 0 || i === key.length - 1) {
    return null;
  }
  return {
    characterState: key.slice(0, i),
    action: key.slice(i + POSE_KEY_SEPARATOR.length),
  };
}

/** Internal flat key for a one-shot character-state transition clip. */
export function transitionFlatKey(fromCharacterState: string, toCharacterState: string): string {
  return `__tr__${POSE_KEY_SEPARATOR}${fromCharacterState}${POSE_KEY_SEPARATOR}${toCharacterState}`;
}

export function isTransitionFlatKey(key: string): boolean {
  return key.startsWith(`__tr__${POSE_KEY_SEPARATOR}`);
}

/**
 * Merge layered character actions and transition clips into one flat `states` map for the player.
 */
export function flattenLayeredManifest(manifest: LayeredCharacterManifest): Record<
  string,
  AnimationStateConfig
> {
  const states: Record<string, AnimationStateConfig> = {};
  for (const [characterState, { actions }] of Object.entries(manifest.characterStates)) {
    for (const [action, cfg] of Object.entries(actions)) {
      states[poseToKey({ characterState, action })] = cfg;
    }
  }
  if (manifest.transitions) {
    for (const [from, toMap] of Object.entries(manifest.transitions)) {
      for (const [to, cfg] of Object.entries(toMap)) {
        states[transitionFlatKey(from, to)] = cfg;
      }
    }
  }
  return states;
}

/** Resolve default pose for a layered manifest (deterministic: first entry keys). */
export function defaultPoseForLayered(manifest: LayeredCharacterManifest): CharacterPose {
  if (manifest.defaultPose) {
    return manifest.defaultPose;
  }
  const csKeys = Object.keys(manifest.characterStates);
  if (csKeys.length === 0) {
    throw new Error("manifest.characterStates must not be empty");
  }
  const characterState = csKeys[0];
  const actionKeys = Object.keys(manifest.characterStates[characterState].actions);
  if (actionKeys.length === 0) {
    throw new Error(`manifest.characterStates["${characterState}"].actions must not be empty`);
  }
  return { characterState, action: actionKeys[0] };
}

/** Build a single flat `states` map for CharacterPlayer from any manifest shape. */
export function manifestToFlatStates(manifest: CharacterManifest): Record<string, AnimationStateConfig> {
  if (isLayeredManifest(manifest)) {
    return flattenLayeredManifest(manifest);
  }
  return manifest.states;
}

/** Default manifest: `idle` and `talk` under distinct asset folders (legacy flat). */
export function createDefaultManifest(): LegacyCharacterManifest {
  return {
    defaultState: "idle",
    states: {
      idle: {
        frames: framePaths("idle", 181),
        fps: 32,
        loop: true,
      },
      talk: {
        frames: framePaths("talk", 90),
        fps: 32,
        loop: true,
      },
    },
  };
}

/** Frame counts for packaged sad demo assets under `assets/sheets/` (must match PNG layout). */
export const SAD_DEMO_FRAMES = {
  /**
   * `neutral_to_sad.png` is 5120×3830 → 10×10 cells @ 512×383; only **91** frames are drawn
   * (9 full rows + 1 cell in row 10). The last 9 cells in the bottom row are empty—do not play them.
   */
  transitionNeutralToSad: 91,
  /** `sad_to_neutral.png` is 4608×3064 → 9×8 cells @ 512×383 (66 frames; last row partial). */
  transitionSadToNeutral: 66,
  sadIdle: 149,
  sadTalk: 126,
  /** `neutral_click_512.png` is 3072×2298 → 6×6 cells @ 512×383 (36 frames). */
  neutralClick: 36,
} as const;

/**
 * Uniform grid parameters per `assets/sheets/*.png`, derived from image pixel size and
 * {@link SAD_DEMO_FRAMES} (row-major cells; unused trailing cells are allowed).
 */
export const SAD_DEMO_GRID_SHEETS = {
  neutralIdle: {
    image: "sheets/neutral_idle_512.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 14,
    frameCount: 181,
  },
  neutralTalk: {
    image: "sheets/neutral_talk_512.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 10,
    frameCount: 93,
  },
  neutralClick: {
    image: "sheets/neutral_click_512.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 6,
    frameCount: SAD_DEMO_FRAMES.neutralClick,
  },
  sadIdle: {
    image: "sheets/sad_idle_512.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 13,
    frameCount: SAD_DEMO_FRAMES.sadIdle,
  },
  sadTalk: {
    image: "sheets/sad_talk_512.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 12,
    frameCount: SAD_DEMO_FRAMES.sadTalk,
  },
  neutralToSad: {
    image: "sheets/neutral_to_sad.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 10,
    frameCount: SAD_DEMO_FRAMES.transitionNeutralToSad,
  },
  sadToNeutral: {
    image: "sheets/sad_to_neutral.png",
    frameWidth: 512,
    frameHeight: 383,
    columns: 9,
    frameCount: SAD_DEMO_FRAMES.transitionSadToNeutral,
  },
} as const;

function sadDemoGridClip(
  sheet: (typeof SAD_DEMO_GRID_SHEETS)[keyof typeof SAD_DEMO_GRID_SHEETS],
  fps: number,
  loop: boolean,
): AnimationStateGridSheetConfig {
  const gridSheet: GridSheetConfig = {
    image: sheet.image,
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    columns: sheet.columns,
    frameCount: sheet.frameCount,
  };
  if ("order" in sheet && sheet.order !== undefined && sheet.order !== null) {
    gridSheet.order = sheet.order as GridSheetOrder;
  }
  return {
    gridSheet,
    fps,
    loop,
  };
}

/**
 * Layered manifest: neutral, sad, and one-shot transitions using one PNG grid sheet per clip
 * under `assets/sheets/` (see {@link SAD_DEMO_GRID_SHEETS}).
 */
export function createSadDemoManifest(): LayeredCharacterManifest {
  return {
    defaultPose: { characterState: "neutral", action: "idle" },
    characterStates: {
      neutral: {
        actions: {
          idle: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.neutralIdle, 32, true),
          talk: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.neutralTalk, 32, true),
          click: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.neutralClick, 50, false),
        },
      },
      sad: {
        actions: {
          idle: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.sadIdle, 32, true),
          talk: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.sadTalk, 32, true),
        },
      },
    },
    transitions: {
      neutral: {
        sad: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.neutralToSad, 32, false),
      },
      sad: {
        neutral: sadDemoGridClip(SAD_DEMO_GRID_SHEETS.sadToNeutral, 32, false),
      },
    },
  };
}
