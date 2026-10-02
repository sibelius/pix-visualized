"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives a simulation with requestAnimationFrame. `step` is called `speed`
 * times per frame while running. Returns play/pause state and a frame counter
 * you can use to trigger re-renders when your sim state lives in a ref.
 */
export function useTicker(step: () => void, { speed = 1, autoplay = false }: { speed?: number; autoplay?: boolean } = {}) {
  const [running, setRunning] = useState(autoplay);
  const [frame, setFrame] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let acc = 0;
    const loop = () => {
      acc += speedRef.current;
      while (acc >= 1) {
        stepRef.current();
        acc -= 1;
      }
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return {
    running,
    play: () => setRunning(true),
    pause: () => setRunning(false),
    toggle: () => setRunning((r) => !r),
    /** advance once and re-render */
    tick: () => {
      stepRef.current();
      setFrame((f) => f + 1);
    },
    /** force a re-render (e.g. after reset) */
    refresh: () => setFrame((f) => f + 1),
    frame,
  };
}
