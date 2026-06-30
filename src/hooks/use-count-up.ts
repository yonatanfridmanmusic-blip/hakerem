import { useState, useEffect, useRef } from "react";

/**
 * Animates a number from 0 to `target` over `duration` ms using an ease-out-quart curve.
 * Resets to 0 and re-animates whenever `target` changes.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }

    startRef.current = null;
    setValue(0);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min((now - startRef.current) / duration, 1);
      // Ease out quart: fast start, gentle deceleration
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

/**
 * Returns a percentage that starts at 0, then transitions to `target` after `delay` ms.
 * Pair with a CSS `transition: width Xs ease` on the element to get a smooth bar animation.
 */
export function useAnimatedPct(target: number, delay = 60): number {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    setPct(0);
    const id = setTimeout(() => setPct(target), delay);
    return () => clearTimeout(id);
  }, [target, delay]);

  return pct;
}
