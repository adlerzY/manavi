"use client";

import { useEffect, useRef, useState } from "react";
import { SkippableChapterAd } from "./skippable-chapter-ad";

export function ChapterAdSlot() {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [visible]);

  if (dismissed) return null;

  return (
    <div ref={containerRef} style={visible ? undefined : { height: "20vh" }}>
      {visible && <SkippableChapterAd onClose={() => setDismissed(true)} />}
    </div>
  );
}