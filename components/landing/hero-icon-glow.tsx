"use client";

import { motion } from "framer-motion";
import { useStaticMotion } from "@/lib/client/use-static-motion";

export function HeroIconGlow() {
  const isStatic = useStaticMotion();

  return (
    <motion.div
      aria-hidden
      className="absolute -inset-4 rounded-2xl will-change-transform"
      style={{
        background: "radial-gradient(circle, rgba(0,220,100,0.55), transparent 70%)",
      }}
      animate={isStatic ? undefined : { scale: [1, 1.25, 1], opacity: [0.55, 0.9, 0.55] }}
      transition={isStatic ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}