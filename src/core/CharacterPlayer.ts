import { AnimatedSprite, Application, Assets, Container, Texture } from "pixi.js";
import type {
  AnimationStateConfig,
  CharacterManifest,
  CharacterPlayerOptions,
  CharacterPose,
  LayeredCharacterManifest,
  LegacyCharacterManifest,
} from "../types.js";
import { isLayeredManifest } from "../types.js";
import {
  defaultPoseForLayered,
  isTransitionFlatKey,
  keyToPose,
  manifestToFlatStates,
  POSE_KEY_SEPARATOR,
  poseToKey,
  transitionFlatKey,
} from "../manifest.js";

function joinBase(baseUrl: string, frame: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(frame, base).href;
}

export class CharacterPlayer {
  readonly container: HTMLElement;
  private readonly manifest: CharacterManifest;
  private readonly flatStates: Record<string, AnimationStateConfig>;
  private readonly layered: boolean;
  private readonly transitionMap: Record<string, Record<string, AnimationStateConfig>> | null;
  private readonly baseUrl: string;
  private readonly transitionMs: number;
  private readonly fitPadding: number;
  private readonly queueStateUntilCycleEnd: boolean;
  private readonly debug: boolean;

  private app: Application | null = null;
  private root: Container | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private currentSprite: AnimatedSprite | null = null;

  /** Current clip key: legacy `idle` / `talk`, layered `neutral/idle`, or internal `__tr__/a/b`. */
  private currentFlatKey: string | null = null;
  /** Logical pose when `layered`; unchanged while a transition clip plays. */
  private currentPose: CharacterPose | null = null;

  private transitioning = false;
  private fromSprite: AnimatedSprite | null = null;
  private toSprite: AnimatedSprite | null = null;
  private transitionProgress = 0;
  private transitionTargetFlatKey: string | null = null;
  private pendingFlatKey: string | null = null;
  private transitionUpdateBound = this.onTransitionTick.bind(this);

  private deferredTargetFlatKey: string | null = null;
  private waitingForCycleEnd = false;

  /** After a one-shot transition clip mounts, crossfade into this pose key. */
  private pendingAfterTransitionClip: { targetKey: string } | null = null;

  private textureWidth = 512;
  private textureHeight = 512;

  /** Invalidates in-flight `playNeutralClick` completion handlers after re-click or `destroy()`. */
  private clickCompletionToken = 0;
  private destroyed = false;

  constructor(options: CharacterPlayerOptions) {
    this.container = options.container;
    this.manifest = options.manifest;
    this.flatStates = manifestToFlatStates(options.manifest);
    this.layered = isLayeredManifest(options.manifest);
    this.transitionMap = isLayeredManifest(options.manifest)
      ? (options.manifest as LayeredCharacterManifest).transitions
      : null;
    this.baseUrl = options.baseUrl;
    this.transitionMs = options.transitionMs ?? 200;
    this.fitPadding = options.fitPadding ?? 1;
    this.queueStateUntilCycleEnd = options.queueStateUntilCycleEnd ?? true;
    this.debug = options.debug ?? false;

    const keys = Object.keys(this.flatStates);
    if (keys.length === 0) {
      throw new Error("CharacterPlayer: manifest must define at least one clip");
    }

    if (this.layered) {
      const pose =
        options.initialPose ??
        (options.manifest as LayeredCharacterManifest).defaultPose ??
        defaultPoseForLayered(options.manifest as LayeredCharacterManifest);
      const k = poseToKey(pose);
      if (!this.flatStates[k]) {
        throw new Error(`CharacterPlayer: unknown initial pose "${k}"`);
      }
      this.currentPose = pose;
      this.currentFlatKey = k;
    } else {
      if (options.initialPose !== undefined) {
        throw new Error("CharacterPlayer: initialPose is only valid with a layered manifest");
      }
      const legacy = options.manifest as LegacyCharacterManifest;
      const def =
        options.initialState ?? legacy.defaultState ?? Object.keys(legacy.states)[0];
      if (!this.flatStates[def]) {
        throw new Error(`CharacterPlayer: unknown initial state "${def}"`);
      }
      this.currentFlatKey = def;
    }

    this.logDebug("constructor", { layered: this.layered, initial: this.currentFlatKey });
  }

  /** Create Pixi app, load first clip, append canvas. Call once. */
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

    const start = this.currentFlatKey!;
    await this.mountState(start);
  }

  /**
   * Current clip key. Layered manifests use `characterState/action` (e.g. `neutral/idle`);
   * during a character-state transition the internal `__tr__/from/to` key may be returned.
   */
  getState(): string | null {
    return this.currentFlatKey;
  }

  /** Logical pose for layered manifests; `null` for legacy flat manifests. */
  getPose(): CharacterPose | null {
    return this.currentPose;
  }

  /** Switch pose (layered manifests only). */
  async setPose(pose: CharacterPose): Promise<void> {
    if (!this.layered) {
      throw new Error("CharacterPlayer: setPose requires a layered manifest");
    }
    this.validatePose(pose);
    const key = poseToKey(pose);
    await this.applySetFlatKey(key);
  }

  /** Switch animation clip; crossfades when `transitionMs` > 0. */
  async setState(name: string): Promise<void> {
    const key = this.resolveSetStateName(name);
    await this.applySetFlatKey(key);
  }

  /**
   * Play the neutral `click` clip immediately: aborts crossfades, cycle queues, and transition clips,
   * then returns to `neutral/idle` from the start when the click clip ends. Layered manifests only;
   * requires a `neutral/click` clip and a neutral playback context (see `playNeutralClick` errors).
   */
  async playNeutralClick(): Promise<void> {
    if (!this.layered) {
      throw new Error("CharacterPlayer: playNeutralClick requires a layered manifest");
    }
    const clickKey = poseToKey({ characterState: "neutral", action: "click" });
    if (!this.flatStates[clickKey]) {
      throw new Error(`CharacterPlayer: manifest has no "${clickKey}" clip`);
    }
    if (!this.isNeutralPlaybackContext()) {
      throw new Error(
        "CharacterPlayer: playNeutralClick only applies in neutral (including a neutral→… transition clip)",
      );
    }
    if (!this.app || !this.root) {
      throw new Error("CharacterPlayer: playNeutralClick requires init() first");
    }

    this.abortImmediatePlayback();
    const token = ++this.clickCompletionToken;
    this.logDebug("playNeutralClick: start", { token, clickKey });

    await this.swapInstant(clickKey);

    if (this.destroyed || token !== this.clickCompletionToken) {
      return;
    }

    const sprite = this.currentSprite;
    if (!sprite) {
      return;
    }
    const cfg = this.flatStates[clickKey]!;
    const idleKey = poseToKey({ characterState: "neutral", action: "idle" });

    const done = (): void => {
      sprite.onComplete = undefined;
      sprite.onLoop = undefined;
      if (this.destroyed) {
        return;
      }
      if (token !== this.clickCompletionToken) {
        this.logDebug("playNeutralClick: completion ignored (superseded)", { token });
        return;
      }
      this.logDebug("playNeutralClick: click complete -> idle", { token });
      void this.swapInstant(idleKey);
    };

    if (!cfg.loop) {
      sprite.onComplete = done;
      sprite.onLoop = undefined;
    } else {
      done();
    }
  }

  private resolveSetStateName(name: string): string {
    if (this.layered && (name === "idle" || name === "talk" || name === "click")) {
      return poseToKey({ characterState: "neutral", action: name });
    }
    return name;
  }

  /** True when the current clip is neutral-side or a transition clip leaving `neutral`. */
  private isNeutralPlaybackContext(): boolean {
    const k = this.currentFlatKey;
    if (!k) {
      return false;
    }
    if (k.startsWith("neutral/")) {
      return true;
    }
    if (isTransitionFlatKey(k)) {
      const rest = k.slice(`__tr__${POSE_KEY_SEPARATOR}`.length);
      const i = rest.indexOf(POSE_KEY_SEPARATOR);
      if (i <= 0) {
        return false;
      }
      return rest.slice(0, i) === "neutral";
    }
    return false;
  }

  /**
   * Stops and tears down active playback so a one-shot (e.g. click) can start immediately.
   * Clears crossfade ticker, transition sprites, cycle/queue state, and the current sprite.
   */
  private abortImmediatePlayback(): void {
    if (this.app) {
      this.app.ticker.remove(this.transitionUpdateBound);
    }
    this.transitioning = false;
    this.transitionProgress = 0;
    this.transitionTargetFlatKey = null;

    this.fromSprite?.stop();
    this.fromSprite?.destroy({ texture: false, textureSource: false });
    this.fromSprite = null;
    this.toSprite?.stop();
    this.toSprite?.destroy({ texture: false, textureSource: false });
    this.toSprite = null;

    this.clearCycleWait();
    this.deferredTargetFlatKey = null;
    this.waitingForCycleEnd = false;
    this.pendingFlatKey = null;
    this.pendingAfterTransitionClip = null;

    this.currentSprite?.stop();
    this.currentSprite?.destroy({ texture: false, textureSource: false });
    this.currentSprite = null;
    if (this.root) {
      this.root.removeChildren();
    }
    this.logDebug("abortImmediatePlayback");
  }

  private validatePose(pose: CharacterPose): void {
    if (!isLayeredManifest(this.manifest)) {
      return;
    }
    const m = this.manifest as LayeredCharacterManifest;
    const block = m.characterStates[pose.characterState];
    if (!block?.actions[pose.action]) {
      throw new Error(
        `CharacterPlayer: unknown pose "${pose.characterState}/${pose.action}"`,
      );
    }
  }

  private logDebug(message: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[CharacterPlayer] ${message}`, data ?? "");
    }
  }

  private logWarn(message: string, data?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(`[CharacterPlayer] ${message}`, data ?? "");
  }

  /** True while a one-shot character-state transition clip is playing (after crossfade onto it). */
  private isPlayingTransitionClip(): boolean {
    return this.currentFlatKey !== null && isTransitionFlatKey(this.currentFlatKey);
  }

  private async applySetFlatKey(targetKey: string): Promise<void> {
    if (!this.flatStates[targetKey]) {
      throw new Error(`CharacterPlayer: unknown state "${targetKey}"`);
    }
    if (!this.app || !this.root) {
      this.currentFlatKey = targetKey;
      this.syncPoseFromFlatKey();
      this.logDebug("applySetFlatKey (no app)", { targetKey });
      return;
    }

    if (this.isPlayingTransitionClip()) {
      this.pendingFlatKey = targetKey;
      this.logDebug("queue: pending while transition clip plays", { targetKey });
      return;
    }

    if (this.transitioning) {
      this.pendingFlatKey = targetKey;
      this.logDebug("queue: pending while crossfading", { targetKey });
      return;
    }

    if (this.waitingForCycleEnd) {
      if (targetKey === this.currentFlatKey) {
        this.clearCycleWait();
        return;
      }
      this.deferredTargetFlatKey = targetKey;
      this.logDebug("queue: deferred until cycle end", { targetKey });
      return;
    }

    if (targetKey === this.currentFlatKey) {
      return;
    }

    if (!this.queueStateUntilCycleEnd) {
      await this.applyTransitionNow(targetKey);
      return;
    }

    this.deferredTargetFlatKey = targetKey;
    this.waitingForCycleEnd = true;
    this.attachCycleEndListener();
  }

  private syncPoseFromFlatKey(): void {
    if (!this.layered) {
      return;
    }
    const p = this.currentFlatKey ? keyToPose(this.currentFlatKey) : null;
    if (p) {
      this.currentPose = p;
    }
  }

  private async applyTransitionNow(targetFlatKey: string): Promise<void> {
    const fromPose = this.currentPose;
    const toPose = keyToPose(targetFlatKey);
    if (
      this.layered &&
      fromPose &&
      toPose &&
      fromPose.characterState !== toPose.characterState
    ) {
      this.logDebug("applyTransitionNow: character-state change", {
        from: fromPose.characterState,
        to: toPose.characterState,
      });
      await this.applyCharacterStateChange(toPose, targetFlatKey);
      return;
    }
    if (this.transitionMs <= 0) {
      await this.swapInstant(targetFlatKey);
    } else {
      await this.beginCrossfade(targetFlatKey);
    }
  }

  private async applyCharacterStateChange(
    targetPose: CharacterPose,
    targetKey: string,
  ): Promise<void> {
    const from = this.currentPose!.characterState;
    const to = targetPose.characterState;
    const tr = this.transitionMap?.[from]?.[to];
    if (!tr) {
      this.logWarn(`no transition clip for character state "${from}" -> "${to}"; crossfading`, {
        from,
        to,
      });
      if (this.transitionMs <= 0) {
        await this.swapInstant(targetKey);
        this.syncPoseFromFlatKey();
      } else {
        await this.beginCrossfade(targetKey);
      }
      return;
    }
    const trKey = transitionFlatKey(from, to);
    this.logDebug("play transition clip then target", { trKey, targetKey });
    this.pendingAfterTransitionClip = { targetKey };
    await this.applyTransitionNow(trKey);
  }

  private clearCycleWait(): void {
    const sprite = this.currentSprite;
    if (sprite) {
      sprite.onLoop = undefined;
      sprite.onComplete = undefined;
    }
    this.deferredTargetFlatKey = null;
    this.waitingForCycleEnd = false;
  }

  private attachCycleEndListener(): void {
    const sprite = this.currentSprite;
    if (!sprite) {
      void this.finishDeferredAndTransition();
      return;
    }
    const stateName = this.currentFlatKey;
    if (!stateName) {
      void this.finishDeferredAndTransition();
      return;
    }
    const cfg = this.flatStates[stateName];
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
    const target = this.deferredTargetFlatKey;
    this.deferredTargetFlatKey = null;
    this.waitingForCycleEnd = false;
    if (!target || target === this.currentFlatKey) {
      return;
    }
    await this.applyTransitionNow(target);
  }

  /** Returns true if we scheduled waiting for a transition clip to finish (skip processing crossfade queue). */
  private maybeAttachTransitionClipCompletion(): boolean {
    if (
      !this.pendingAfterTransitionClip ||
      !this.currentFlatKey ||
      !isTransitionFlatKey(this.currentFlatKey)
    ) {
      return false;
    }
    const { targetKey } = this.pendingAfterTransitionClip;
    this.pendingAfterTransitionClip = null;
    this.attachTransitionClipCompletion(targetKey);
    return true;
  }

  private attachTransitionClipCompletion(targetKey: string): void {
    const sprite = this.currentSprite;
    if (!sprite) {
      void this.finishCharacterTransitionChain(targetKey);
      return;
    }
    const cfg = this.flatStates[this.currentFlatKey!];
    if (!cfg) {
      void this.finishCharacterTransitionChain(targetKey);
      return;
    }
    this.logDebug("attachTransitionClipCompletion", { targetKey, loop: cfg.loop });
    const done = (): void => {
      sprite.onComplete = undefined;
      sprite.onLoop = undefined;
      void this.finishCharacterTransitionChain(targetKey);
    };
    if (!cfg.loop) {
      sprite.onComplete = done;
    } else {
      done();
    }
  }

  private async finishCharacterTransitionChain(targetKey: string): Promise<void> {
    const use = this.pendingFlatKey ?? targetKey;
    this.pendingFlatKey = null;
    this.logDebug("transition clip complete -> target pose", { targetKey, use });
    await this.applyTransitionNow(use);
  }

  private async swapInstant(name: string): Promise<void> {
    this.currentSprite?.stop();
    this.currentSprite?.destroy({ texture: false, textureSource: false });
    this.currentSprite = null;
    if (this.root) {
      this.root.removeChildren();
    }
    await this.mountState(name);
    this.currentFlatKey = name;
    this.syncPoseFromFlatKey();
    this.maybeAttachTransitionClipCompletion();
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
    this.transitionTargetFlatKey = name;
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

    if (this.transitionTargetFlatKey) {
      this.currentFlatKey = this.transitionTargetFlatKey;
      this.syncPoseFromFlatKey();
    }
    this.transitionTargetFlatKey = null;

    const waitingOnTransitionClip = this.maybeAttachTransitionClipCompletion();

    if (!waitingOnTransitionClip) {
      const queued = this.pendingFlatKey;
      this.pendingFlatKey = null;

      if (queued && queued !== this.currentFlatKey) {
        void this.applySetFlatKey(queued);
      }
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
    const cfg = this.flatStates[name];
    const urls = cfg.frames.map((f) => joinBase(this.baseUrl, f));
    const textures = await Promise.all(urls.map((url) => Assets.load<Texture>(url)));
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
    this.destroyed = true;
    this.clickCompletionToken += 1;
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
    this.currentFlatKey = null;
    this.currentPose = null;
    this.pendingAfterTransitionClip = null;
  }
}
