import { useEffect, useRef, type CSSProperties } from "react";
import { CharacterPlayer } from "../core/CharacterPlayer.js";
import type { CharacterManifest, CharacterPlayerOptions } from "../types.js";

export interface CharacterViewProps {
  manifest: CharacterManifest;
  baseUrl: string;
  initialState?: string;
  transitionMs?: number;
  fitPadding?: number;
  queueStateUntilCycleEnd?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function CharacterView({
  manifest,
  baseUrl,
  initialState,
  transitionMs,
  fitPadding,
  queueStateUntilCycleEnd,
  className,
  style,
}: CharacterViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const options: CharacterPlayerOptions = {
      container: el,
      manifest,
      baseUrl,
    };
    if (initialState !== undefined) {
      options.initialState = initialState;
    }
    if (transitionMs !== undefined) {
      options.transitionMs = transitionMs;
    }
    if (fitPadding !== undefined) {
      options.fitPadding = fitPadding;
    }
    if (queueStateUntilCycleEnd !== undefined) {
      options.queueStateUntilCycleEnd = queueStateUntilCycleEnd;
    }
    const player = new CharacterPlayer(options);
    void player.init();
    return () => player.destroy();
  }, [manifest, baseUrl, initialState, transitionMs, fitPadding, queueStateUntilCycleEnd]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "240px",
        ...style,
      }}
    />
  );
}

export default CharacterView;
