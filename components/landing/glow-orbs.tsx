"use client";

import { motion, useReducedMotion, useTransform } from "framer-motion";
import { usePointerParallax } from "./pointer-parallax-provider";

interface OrbConfig {
  id: string;
  size: number;
  top: string;
  left: string;
  color: string;
  blur: number;
  floatRange: number;
  duration: number;
  parallaxStrength: number;
}

const ORBS: OrbConfig[] = [
  { id: "mint", size: 520, top: "-8%", left: "8%", color: "rgba(0,220,100,0.35)", blur: 120, floatRange: 26, duration: 16, parallaxStrength: 18 },
  { id: "pink", size: 420, top: "38%", left: "72%", color: "rgba(236,72,153,0.28)", blur: 130, floatRange: 34, duration: 20, parallaxStrength: 26 },
  { id: "ghost", size: 620, top: "68%", left: "-6%", color: "rgba(0,220,100,0.14)", blur: 150, floatRange: 20, duration: 24, parallaxStrength: 12 },
];

function Orb({ config }: { config: OrbConfig }) {
  const shouldReduceMotion = useReducedMotion();
  const { x, y } = usePointerParallax();
  const translateX = useTransform(x, (value) => value * config.parallaxStrength);
  const translateY = useTransform(y, (value) => value * config.parallaxStrength);

  return (
    <motion.div
      aria-hidden
      className="absolute will-change-transform"
      style={{ top: config.top, left: config.left, x: translateX, y: translateY }}
    >
      <motion.div
        className="rounded-full will-change-transform"
        style={{
          width: config.size + config.blur * 2,
          height: config.size + config.blur * 2,
          marginTop: -config.blur,
          marginLeft: -config.blur,
          backgroundImage: `radial-gradient(circle closest-side, ${config.color}, transparent)`,
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                y: [0, -config.floatRange, 0, config.floatRange, 0],
                x: [0, config.floatRange * 0.6, 0, -config.floatRange * 0.6, 0],
              }
        }
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: config.duration, repeat: Infinity, ease: "easeInOut" }
        }
      />
    </motion.div>
  );
}

export function GlowOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ORBS.map((orb) => (
        <Orb key={orb.id} config={orb} />
      ))}
    </div>
  );
}