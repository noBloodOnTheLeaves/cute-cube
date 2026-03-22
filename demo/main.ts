import { CharacterPlayer, createDefaultManifest } from "../src/index.ts";

async function main(): Promise<void> {
  const wrap = document.querySelector<HTMLDivElement>("#stage-wrap");
  if (!wrap) {
    throw new Error("#stage-wrap missing");
  }

  const manifest = createDefaultManifest();
  const baseUrl = new URL("./", window.location.origin + import.meta.env.BASE_URL)
    .href;

  const player = new CharacterPlayer({
    container: wrap,
    manifest,
    baseUrl,
    transitionMs: 200,
    initialState: "idle",
  });

  await player.init();

  document.querySelectorAll("button[data-state]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-state");
      if (name) {
        void player.setState(name);
      }
    });
  });
}

void main();
