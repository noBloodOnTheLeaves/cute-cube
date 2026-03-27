# cute-cube

Framework-agnostic sprite character with named animation states, built on [PixiJS](https://pixijs.com/). Optional Vue 3 and React bindings are published as subpath exports.

## Install

Install `cute-cube` and its required peer dependency `pixi.js`. Add Vue or React only if you use those bindings.

### npm

```bash
npm install cute-cube pixi.js
```

Optional peers:

```bash
npm install cute-cube pixi.js vue
# or
npm install cute-cube pixi.js react react-dom
```

### Yarn (Classic / Berry)

```bash
yarn add cute-cube pixi.js
```

Optional peers:

```bash
yarn add cute-cube pixi.js vue
# or
yarn add cute-cube pixi.js react react-dom
```

### pnpm

```bash
pnpm add cute-cube pixi.js
```

Optional peers:

```bash
pnpm add cute-cube pixi.js vue
# or
pnpm add cute-cube pixi.js react react-dom
```

### Bun

```bash
bun add cute-cube pixi.js
```

Optional peers:

```bash
bun add cute-cube pixi.js vue
# or
bun add cute-cube pixi.js react react-dom
```

## Usage

Core API:

```ts
import { CharacterPlayer, createDefaultManifest } from "cute-cube";
```

Vue (`CharacterView` component):

```ts
import { CharacterView } from "cute-cube/vue";
```

React (`CharacterView` component):

```ts
import { CharacterView } from "cute-cube/react";
```

See `src/index.ts` and the `demo/` app for concrete examples.

## Publishing (maintainers)

Public JavaScript packages are published to the **npm registry** (`https://registry.npmjs.org/`). Yarn, pnpm, and Bun all consume that same registry for public packages—there is no separate “Yarn package” registry for open-source libraries.

1. **Account** — Create an account on [npmjs.com](https://www.npmjs.com/) and verify your email.
2. **Login** — Run `npm login` (or `yarn npm login` in Yarn Berry) and follow the prompts.
3. **Build** — `npm run build` (or rely on `prepublishOnly`, which runs the build before publish).
4. **Name & version** — Ensure `package.json` `name` is available on npm and bump `version` per [semver](https://semver.org/).
5. **Publish** — From the package root:
   - **npm:** `npm publish` (use `npm publish --access public` for scoped packages like `@org/pkg`).
   - **Yarn (Berry):** `yarn npm publish` (same registry as npm).

After publish, users install with any client (`npm`, `yarn`, `pnpm`, `bun`) using the instructions above.
