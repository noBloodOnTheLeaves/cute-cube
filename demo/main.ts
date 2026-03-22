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

  function applyPose(): void {
    void player.setPose({ characterState, action });
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
}

void main();
