import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vue: "src/vue/index.ts",
    react: "src/react/index.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ["pixi.js", "vue", "react", "react-dom"],
});
