import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

export default defineConfig({
  root: __dirname,
  publicDir: resolve(projectRoot, "assets"),
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
});
