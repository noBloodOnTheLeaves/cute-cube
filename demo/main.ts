/// <reference types="vite/client" />
import {
  CharacterPlayer,
  createSadDemoManifest,
  type CharacterPose,
} from "../src/index.js";

async function main(): Promise<void> {
  const wrap = document.querySelector<HTMLDivElement>("#stage-wrap");
  if (!wrap) {
    throw new Error("#stage-wrap missing");
  }

  const manifest = createSadDemoManifest();
  const baseUrl = new URL("./", window.location.origin + import.meta.env.BASE_URL)
    .href;

  const player = new CharacterPlayer({
    container: wrap,
    manifest,
    baseUrl,
    transitionMs: 380,
    initialPose: { characterState: "neutral", action: "idle" },
    characterWidth: 450,
    characterHeight: 450,
  });

  await player.init();

  const scheduleIdle =
    typeof globalThis.requestIdleCallback === "function"
      ? (cb: () => void) => globalThis.requestIdleCallback(cb, { timeout: 5000 })
      : (cb: () => void) => {
          globalThis.setTimeout(cb, 0);
        };

  scheduleIdle(() => {
    void player.preloadAllAssets();
  });

  let characterState: CharacterPose["characterState"] = "neutral";
  let action: CharacterPose["action"] = "idle";

  const clickBtn = document.querySelector<HTMLButtonElement>("button[data-play-click]");
  const oneShotButtons = document.querySelectorAll<HTMLButtonElement>(
    "button[data-play-one-shot]",
  );

  function canPlayStateOneShots(): boolean {
    return characterState === "neutral" || characterState === "sad";
  }

  function syncOneShotUi(): void {
    const on = canPlayStateOneShots();
    if (clickBtn) {
      clickBtn.disabled = !on;
    }
    oneShotButtons.forEach((btn) => {
      btn.disabled = !on;
    });
    player.container.style.cursor = on ? "pointer" : "default";
  }

  function applyPose(): void {
    void player.setPose({ characterState, action });
    syncOneShotUi();
  }

  function playClickIfAllowed(): void {
    if (!canPlayStateOneShots()) {
      return;
    }
    if (characterState === "neutral") {
      void player.playNeutralClick();
    } else {
      void player.playOneShotAction({ characterState: "sad", action: "click" });
    }
  }

  function playCelebratingIfAllowed(): void {
    if (!canPlayStateOneShots()) {
      return;
    }
    void player.playOneShotAction({ characterState, action: "celebrating" });
  }

  document.querySelectorAll<HTMLButtonElement>("button[data-character-state]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cs = btn.getAttribute("data-character-state");
      if (cs === "neutral" || cs === "sad") {
        characterState = cs;
        applyPose();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-action");
      if (a === "idle" || a === "talk" || a === "thinking") {
        action = a;
        applyPose();
      }
    });
  });

  clickBtn?.addEventListener("click", () => {
    playClickIfAllowed();
  });

  oneShotButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-play-one-shot");
      if (a === "celebrating") {
        playCelebratingIfAllowed();
      }
    });
  });

  wrap.addEventListener("click", () => {
    playClickIfAllowed();
  });

  syncOneShotUi();
}

void main();
