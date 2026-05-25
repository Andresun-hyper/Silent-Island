"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HealingMotif, HealingPhase } from "./ink-poles-canvas";

const InkPolesCanvas = dynamic(
  () => import("@/components/ink-poles-canvas"),
  { ssr: false }
);

const MOTIFS: { id: HealingMotif; label: string; mark: string }[] = [
  { id: "bird", label: "手写鸟", mark: "b" },
  { id: "moon", label: "字迹月", mark: "c" },
  { id: "island", label: "孤岛", mark: "i" },
];

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Visible chrome around the canvas — full demo UI, or none for embedded use. */
export type InkPolesChrome = "full" | "none";

/** Layout mode of the wrapper:
 *  - "fullscreen" — fixed to the viewport (default, used by `app/page.tsx`).
 *  - "inline"     — absolutely fills its (positioned) parent. Use this when
 *                   embedding into another React project / route. */
export type InkPolesLayout = "fullscreen" | "inline";

export interface InkPolesWrapperProps {
  /** Initial motif to display. Default "bird". */
  initialMotif?: HealingMotif;
  /** Whether the scene auto-cycles entering → idle → leaving → entering after
   *  a reset. Set to false if the host project wants to drive the lifecycle. */
  autoCycle?: boolean;
  /** Show the demo chrome (title, session counter, motif buttons, tension
   *  indicator) or hide everything except the canvas. Default "full". */
  chrome?: InkPolesChrome;
  /** Position the stage as a fullscreen surface or fill its parent. */
  layout?: InkPolesLayout;
  /** Optional class name appended to the stage element. */
  className?: string;
}

export default function InkPolesWrapper({
  initialMotif = "bird",
  autoCycle = true,
  chrome = "full",
  layout = "fullscreen",
  className,
}: InkPolesWrapperProps = {}) {
  const [phase, setPhase] = useState<HealingPhase>("entering");
  const [motif, setMotif] = useState<HealingMotif>(initialMotif);
  const [sceneKey, setSceneKey] = useState(0);
  const [pullCount, setPullCount] = useState(0);
  const [tension, setTension] = useState(0);
  const tensionRef = useRef(0);
  const tensionRafRef = useRef<number | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    if (phase === "entering") {
      const timer = window.setTimeout(() => setPhase("idle"), 4200);
      return () => window.clearTimeout(timer);
    }

    if (phase === "revealing") {
      const timer = window.setTimeout(() => setPhase("idle"), 8600);
      return () => window.clearTimeout(timer);
    }

    if (phase === "leaving") {
      const timer = window.setTimeout(() => {
        setSceneKey((value) => value + 1);
        setPhase(autoCycle ? "entering" : "idle");
      }, 1900);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [phase, sceneKey, autoCycle]);

  const triggerMotif = useCallback((nextMotif?: HealingMotif) => {
    if (nextMotif) setMotif(nextMotif);
    setSceneKey((value) => value + 1);
    setPhase("revealing");
  }, []);

  const handleWireRelease = useCallback((releasedTension: number) => {
    if (releasedTension < 0.12) return;
    setPullCount((value) => value + 1);
    triggerMotif();
  }, [triggerMotif]);

  const handleWireTensionChange = useCallback((value: number) => {
    tensionRef.current = value;
    if (tensionRafRef.current !== null) return;
    tensionRafRef.current = window.requestAnimationFrame(() => {
      setTension(tensionRef.current);
      tensionRafRef.current = null;
    });
  }, []);

  const resetScene = useCallback(() => {
    setTension(0);
    setPhase("leaving");
  }, []);

  const tensionStyle = useMemo(
    () => ({ transform: `scaleX(${Math.max(0.035, tension).toFixed(3)})` }),
    [tension]
  );

  const stageClass = [
    "ink-stage",
    layout === "inline" ? "ink-stage--inline" : null,
    className,
  ].filter(Boolean).join(" ");

  return (
    <main className={stageClass} data-phase={phase}>
      <InkPolesCanvas
        motif={motif}
        phase={phase}
        sceneKey={sceneKey}
        onWireRelease={handleWireRelease}
        onWireTensionChange={handleWireTensionChange}
      />

      {chrome === "full" && (
        <>
          <section className="app-mark" aria-label="孤岛疗愈">
            <div className="app-title">孤岛疗愈</div>
            <div className="app-session">
              <span>{formatTime(elapsed)}</span>
              <span>{pullCount.toString().padStart(2, "0")}</span>
            </div>
          </section>

          <nav className="motif-dock" aria-label="造景切换">
            {MOTIFS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === motif ? "motif-button is-active" : "motif-button"}
                aria-label={item.label}
                onClick={() => triggerMotif(item.id)}
              >
                <span aria-hidden="true">{item.mark}</span>
              </button>
            ))}
            <button
              type="button"
              className="motif-button"
              aria-label="重置场景"
              onClick={resetScene}
            >
              <span aria-hidden="true">r</span>
            </button>
          </nav>

          <div className="tension-thread" aria-hidden="true">
            <div style={tensionStyle} />
          </div>
        </>
      )}
    </main>
  );
}
