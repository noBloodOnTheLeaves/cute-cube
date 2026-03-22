import type { CharacterManifest } from "./types.js";

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

/** Default manifest: `idle` and `talk` under distinct asset folders. */
export function createDefaultManifest(): CharacterManifest {
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
