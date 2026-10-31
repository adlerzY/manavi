"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { HalftoneOverlay } from "./halftone-overlay";

const PANEL_TONES = [
  "linear-gradient(160deg, #0f2f1f, #00DC64)",
  "linear-gradient(160deg, #1c1030, #EC4899)",
  "linear-gradient(160deg, #101826, #22c55e)",
  "linear-gradient(160deg, #23101c, #f472b6)",
  "linear-gradient(160deg, #0d2418, #16a34a)",
];

function FallbackStrip() {
  return (
    <>
      {PANEL_TONES.map((tone, index) => (
        <div key={index} className="relative h-40 w-full flex-shrink-0 overflow-hidden" style={{ backgroundImage: tone }}>
          <HalftoneOverlay dotColor="255,255,255" opacity={0.14} gap={9} dotSize={1} />
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "repeating-linear-gradient(100deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 12px)",
            }}
          />
        </div>
      ))}
    </>
  );
}

interface ReaderPreviewMarqueeProps {
  panelImageSrc?: string;
}

export function ReaderPreviewMarquee({ panelImageSrc }: ReaderPreviewMarqueeProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="flex flex-col will-change-transform"
      animate={shouldReduceMotion ? undefined : { y: ["0%", "-50%"] }}
      transition={shouldReduceMotion ? undefined : { duration: 16, repeat: Infinity, ease: "linear" }}
    >
      {panelImageSrc ? (
        <>
          <div className="relative h-[1040px] w-full flex-shrink-0">
            <Image
              src={panelImageSrc}
              alt="پیش‌نمایش ریدر مانهوا"
              fill
              sizes="260px"
              className="object-cover object-top"
              priority
            />
          </div>
          <div className="relative h-[1040px] w-full flex-shrink-0">
            <Image
              src={panelImageSrc}
              alt="پیش‌نمایش ریدر مانهوا"
              fill
              unoptimized
              sizes="260px"
              className="object-cover object-top"
            />
          </div>
        </>
      ) : (
        <>
          <FallbackStrip />
          <FallbackStrip />
        </>
      )}
    </motion.div>
  );
}