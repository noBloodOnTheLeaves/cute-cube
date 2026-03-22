import { AnimatedSprite, Application, Assets, Container, Texture } from "pixi.js";
import type { CharacterManifest, CharacterPlayerOptions } from "../types.js";

function joinBase(baseUrl: string, frame: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(frame, base).href;
}

export class CharacterPlayer {
  readonly container: HTMLElement;
  private readonly manifest: CharacterManifest;
  private readonly baseUrl: string;
  private readonly transitionMs: number;
  private readonly fitPadding: number;
  private readonly queueStateUntilCycleEnd: boolean;

  private app: Application | null = null;
  private root: Container | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private currentStateName: string | null = null;
  private currentSprite: AnimatedSprite | null = null;

  private transitioning = false;
  private fromSprite: AnimatedSprite | null = null;
  private toSprite: AnimatedSprite | null = null;
  private transitionProgress = 0;
  private transitionTargetState: string | null = null;
  private pendingState: string | null = null;
  private transitionUpdateBound = this.onTransitionTick.bind(this);

  private deferredTargetState: string | null = null;
  private waitingForCycleEnd = false;

  private textureWidth = 512;
  private textureHeight = 512;

  constructor(options: CharacterPlayerOptions) {
    this.container = options.container;
    this.manifest = options.manifest;
    this.baseUrl = options.baseUrl;
    this.transitionMs = options.transitionMs ?? 200;
    this.fitPadding = options.fitPadding ?? 1;
    this.queueStateUntilCycleEnd = options.queueStateUntilCycleEnd ?? true;

    const keys = Object.keys(this.manifest.states);
    if (keys.length === 0) {
      throw new Error("CharacterPlayer: manifest.states must not be empty");
    }
    const def = options.initialState ?? this.manifest.defaultState ?? keys[0];
    if (!this.manifest.states[def]) {
      throw new Error(`CharacterPlayer: unknown initial state "${def}"`);
    }
    this.currentStateName = def;
  }

  /** Create Pixi app, load first state, append canvas. Call once. */
  async init(): Promise<void> {
    if (this.app) {
      return;
    }

    const app = new Application();
    await app.init({
      resizeTo: this.container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: typeof window !== "undefined" ? window.devicePixelRatio : 1,
      preference: "webgl",
    });

    this.app = app;
    this.container.appendChild(app.canvas as HTMLCanvasElement);

    this.resizeObserver = new ResizeObserver(() => {
      const resize = (app as unknown as { resize?: () => void }).resize;
      resize?.call(app);
      this.layout();
    });
    this.resizeObserver.observe(this.container);

    app.renderer.on("resize", () => this.layout());

    const root = new Container();
    this.root = root;
    app.stage.addChild(root);

    const start = this.currentStateName!;
    await this.mountState(start);
  }

  getState(): string | null {
    return this.currentStateName;
  }

  /** Switch animation state; crossfades when `transitionMs` > 0. */
  async setState(name: string): Promise<void> {
    if (!this.manifest.states[name]) {
      throw new Error(`CharacterPlayer: unknown state "${name}"`);
    }
    if (!this.app || !this.root) {
      this.currentStateName = name;
      return;
    }

    if (this.transitioning) {
      this.pendingState = name;
      return;
    }

    if (this.waitingForCycleEnd) {
      if (name === this.currentStateName) {
        this.clearCycleWait();
        return;
      }
      this.deferredTargetState = name;
      return;
    }

    if (name === this.currentStateName) {
      return;
    }

    if (!this.queueStateUntilCycleEnd) {
      await this.applyTransitionNow(name);
      return;
    }

    this.deferredTargetState = name;
    this.waitingForCycleEnd = true;
    this.attachCycleEndListener();
  }

  private async applyTransitionNow(name: string): Promise<void> {
    if (this.transitionMs <= 0) {
      await this.swapInstant(name);
    } else {
      await this.beginCrossfade(name);
    }
  }

  private clearCycleWait(): void {
    const sprite = this.currentSprite;
    if (sprite) {
      sprite.onLoop = undefined;
      sprite.onComplete = undefined;
    }
    this.deferredTargetState = null;
    this.waitingForCycleEnd = false;
  }

  private attachCycleEndListener(): void {
    const sprite = this.currentSprite;
    if (!sprite) {
      void this.finishDeferredAndTransition();
      return;
    }
    const stateName = this.currentStateName;
    if (!stateName) {
      void this.finishDeferredAndTransition();
      return;
    }
    const cfg = this.manifest.states[stateName];
    if (sprite.totalFrames <= 1) {
      void this.finishDeferredAndTransition();
      return;
    }
    if (!cfg.loop && !sprite.playing) {
      void this.finishDeferredAndTransition();
      return;
    }

    const done = (): void => {
      if (!this.waitingForCycleEnd) {
        return;
      }
      void this.finishDeferredAndTransition();
    };

    if (cfg.loop) {
      sprite.onLoop = done;
      sprite.onComplete = undefined;
    } else {
      sprite.onComplete = done;
      sprite.onLoop = undefined;
    }
  }

  private async finishDeferredAndTransition(): Promise<void> {
    const sprite = this.currentSprite;
    if (sprite) {
      sprite.onLoop = undefined;
      sprite.onComplete = undefined;
    }
    const target = this.deferredTargetState;
    this.deferredTargetState = null;
    this.waitingForCycleEnd = false;
    if (!target || target === this.currentStateName) {
      return;
    }
    await this.applyTransitionNow(target);
  }

  private async swapInstant(name: string): Promise<void> {
    this.currentSprite?.stop();
    this.currentSprite?.destroy({ texture: false, textureSource: false });
    this.currentSprite = null;
    if (this.root) {
      this.root.removeChildren();
    }
    await this.mountState(name);
    this.currentStateName = name;
  }

  private async beginCrossfade(name: string): Promise<void> {
    const app = this.app!;
    const root = this.root!;

    const outgoing = this.currentSprite;
    if (!outgoing) {
      await this.swapInstant(name);
      return;
    }

    const incoming = await this.createSpriteForState(name);
    incoming.alpha = 0;
    root.addChild(incoming);

    this.fromSprite = outgoing;
    this.toSprite = incoming;
    this.transitionTargetState = name;
    this.transitioning = true;
    this.transitionProgress = 0;

    app.ticker.add(this.transitionUpdateBound);
  }

  private onTransitionTick(): void {
    if (!this.transitioning || !this.fromSprite || !this.toSprite || !this.app) {
      return;
    }
    const ms = this.app.ticker.deltaMS;
    this.transitionProgress += ms / this.transitionMs;
    const t = Math.min(1, this.transitionProgress);
    this.fromSprite.alpha = 1 - t;
    this.toSprite.alpha = t;

    if (t >= 1) {
      this.finishCrossfade();
    }
  }

  private finishCrossfade(): void {
    const app = this.app!;
    app.ticker.remove(this.transitionUpdateBound);

    this.fromSprite?.stop();
    this.fromSprite?.destroy({ texture: false, textureSource: false });
    this.fromSprite = null;

    const kept = this.toSprite!;
    this.toSprite = null;
    this.currentSprite = kept;
    this.transitioning = false;

    if (this.transitionTargetState) {
      this.currentStateName = this.transitionTargetState;
    }
    this.transitionTargetState = null;

    const queued = this.pendingState;
    this.pendingState = null;

    if (queued && queued !== this.currentStateName) {
      void this.setState(queued);
    }
  }

  private async mountState(name: string): Promise<void> {
    const sprite = await this.createSpriteForState(name);
    this.root!.addChild(sprite);
    this.currentSprite = sprite;
    const tex = sprite.texture;
    this.textureWidth = tex.width;
    this.textureHeight = tex.height;
    this.layout();
  }

  private async createSpriteForState(name: string): Promise<AnimatedSprite> {
    const cfg = this.manifest.states[name];
    const urls = cfg.frames.map((f) => joinBase(this.baseUrl, f));
    const textures = await Promise.all(
      urls.map((url) => Assets.load<Texture>(url)),
    );
    const sprite = new AnimatedSprite({
      textures,
      animationSpeed: cfg.fps / 60,
      loop: cfg.loop,
      autoPlay: false,
    });
    sprite.anchor.set(0.5);
    sprite.play();
    return sprite;
  }

  private layout(): void {
    if (!this.app || !this.root) {
      return;
    }
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.root.x = w / 2;
    this.root.y = h / 2;

    const tw = this.textureWidth;
    const th = this.textureHeight;
    if (tw <= 0 || th <= 0) {
      return;
    }
    const scale = Math.min(w / tw, h / th) * this.fitPadding;
    this.root.scale.set(scale);
  }

  destroy(): void {
    this.clearCycleWait();

    if (this.app) {
      this.app.ticker.remove(this.transitionUpdateBound);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.currentSprite?.destroy({ texture: false, textureSource: false });
    this.currentSprite = null;
    this.fromSprite?.destroy({ texture: false, textureSource: false });
    this.fromSprite = null;
    this.toSprite?.destroy({ texture: false, textureSource: false });
    this.toSprite = null;

    if (this.app) {
      this.app.destroy(true, { children: true, texture: false });
      this.app = null;
    }
    this.root = null;
    this.currentStateName = null;
  }
}
