"use client";

import { useState } from "react";

const COLLAPSE_THRESHOLD = 180;

export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > COLLAPSE_THRESHOLD;

  return (
    <div>
      <p className={`text-sm leading-7 text-text-muted ${long && !expanded ? "line-clamp-4" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((prev) => !prev)} className="mt-1 text-xs text-primary">
          {expanded ? "کمتر" : "بیشتر"}
        </button>
      )}
    </div>
  );
}