import type {
  AnimationStateConfig,
  CharacterManifest,
  CharacterPose,
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

/** Frame counts for packaged sad demo assets under `assets/`. */
export const SAD_DEMO_FRAMES = {
  transitionNeutralToSad: 121,
  transitionSadToNeutral: 91,
  sadIdle: 150,
  sadTalk: 117,
} as const;

/**
 * Layered manifest: neutral (existing `idle/` + `talk/`), sad clips, and melt / unmelt transitions.
 * Expects `assets/sad/idle`, `assets/sad/talk`, `assets/transitions/neutral_to_sad`, `assets/transitions/sad_to_neutral`.
 */
export function createSadDemoManifest(): LayeredCharacterManifest {
  return {
    defaultPose: { characterState: "neutral", action: "idle" },
    characterStates: {
      neutral: {
        actions: {
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
      },
      sad: {
        actions: {
          idle: {
            frames: framePaths("sad/idle", SAD_DEMO_FRAMES.sadIdle),
            fps: 32,
            loop: true,
          },
          talk: {
            frames: framePaths("sad/talk", SAD_DEMO_FRAMES.sadTalk),
            fps: 32,
            loop: true,
          },
        },
      },
    },
    transitions: {
      neutral: {
        sad: {
          frames: framePaths("transitions/neutral_to_sad", SAD_DEMO_FRAMES.transitionNeutralToSad),
          fps: 32,
          loop: false,
        },
      },
      sad: {
        neutral: {
          frames: framePaths("transitions/sad_to_neutral", SAD_DEMO_FRAMES.transitionSadToNeutral),
          fps: 32,
          loop: false,
        },
      },
    },
  };
}
