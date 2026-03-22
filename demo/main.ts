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
    transitionMs: 200,
    initialPose: { characterState: "neutral", action: "idle" },
  });

  await player.init();

  let characterState: CharacterPose["characterState"] = "neutral";
  let action: CharacterPose["action"] = "idle";

  const clickBtn = document.querySelector<HTMLButtonElement>(
    "button[data-play-neutral-click]",
  );

  function syncNeutralClickUi(): void {
    const neutral = characterState === "neutral";
    if (clickBtn) {
      clickBtn.disabled = !neutral;
    }
    wrap.style.cursor = neutral ? "pointer" : "default";
  }

  function applyPose(): void {
    void player.setPose({ characterState, action });
    syncNeutralClickUi();
  }

  function playNeutralClickIfAllowed(): void {
    if (characterState !== "neutral") {
      return;
    }
    void player.playNeutralClick();
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
      if (a === "idle" || a === "talk") {
        action = a;
        applyPose();
      }
    });
  });

  clickBtn?.addEventListener("click", () => {
    playNeutralClickIfAllowed();
  });

  wrap.addEventListener("click", () => {
    playNeutralClickIfAllowed();
  });

  syncNeutralClickUi();
}

void main();
