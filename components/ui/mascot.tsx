"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

export type MascotPose =
  | "wave"
  | "reading"
  | "point"
  | "thinking"
  | "sad"
  | "celebrate"
  | "sleep"
  | "coin"
  | "gift";

const MASCOT_DIR = "/images/mascot";
const MASCOT_EXTENSION = "png";

export function mascotSrc(pose: MascotPose): string {
  return `${MASCOT_DIR}/${pose}.${MASCOT_EXTENSION}`;
}

interface MascotProps {
  pose: MascotPose;
  size?: number;
  fluid?: boolean;
  float?: boolean;
  priority?: boolean;
  className?: string;
  fallback?: ReactNode;
}

export function Mascot({
  pose,
  size = 160,
  fluid = false,
  float = false,
  priority = false,
  className,
  fallback = null,
}: MascotProps) {
  const [broken, setBroken] = useState(false);

  if (broken) return <>{fallback}</>;

  const floating = float && !fluid;

  return (
    <div
      className={
        fluid
          ? (className ?? "relative h-full w-full")
          : `relative flex-shrink-0 ${floating ? "mascot-float" : ""} ${className ?? ""}`
      }
      style={fluid ? undefined : { width: size, height: size }}
    >
      <Image
        src={mascotSrc(pose)}
        alt=""
        aria-hidden
        fill
        sizes={fluid ? "320px" : `${size * 2}px`}
        priority={priority}
        draggable={false}
        onError={() => setBroken(true)}
        className="pointer-events-none select-none object-contain"
      />
    </div>
  );
}