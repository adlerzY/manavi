"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useMotionValue, useSpring, type MotionValue } from "framer-motion";

interface PointerParallaxContextValue {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

const PointerParallaxContext = createContext<PointerParallaxContextValue | null>(null);

export function usePointerParallax(): PointerParallaxContextValue {
  const ctx = useContext(PointerParallaxContext);
  if (!ctx) {
    throw new Error("usePointerParallax must be used within PointerParallaxProvider");
  }
  return ctx;
}

export function PointerParallaxProvider({ children }: { children: ReactNode }) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 40, damping: 18, mass: 0.6 });
  const y = useSpring(rawY, { stiffness: 40, damping: 18, mass: 0.6 });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (!isFinePointer) return;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const nx = (event.clientX / window.innerWidth) * 2 - 1;
        const ny = (event.clientY / window.innerHeight) * 2 - 1;
        rawX.set(nx);
        rawY.set(ny);
      });
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [rawX, rawY]);

  return (
    <PointerParallaxContext.Provider value={{ x, y }}>
      {children}
    </PointerParallaxContext.Provider>
  );
}
