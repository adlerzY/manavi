"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ZOOM_ALLOWED_PREFIX = "/app/read/";
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true'], [data-allow-select]";

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest(EDITABLE_SELECTOR));
}

export function NativeAppShell() {
  const pathname = usePathname();
  const zoomAllowed = pathname.startsWith(ZOOM_ALLOWED_PREFIX);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("native-app");

    function blockUnlessEditable(event: Event) {
      if (!isEditableTarget(event.target)) event.preventDefault();
    }
    function blockAlways(event: Event) {
      event.preventDefault();
    }

    document.addEventListener("contextmenu", blockUnlessEditable);
    document.addEventListener("selectstart", blockUnlessEditable);
    document.addEventListener("dragstart", blockAlways);

    return () => {
      root.classList.remove("native-app");
      document.removeEventListener("contextmenu", blockUnlessEditable);
      document.removeEventListener("selectstart", blockUnlessEditable);
      document.removeEventListener("dragstart", blockAlways);
    };
  }, []);

  useEffect(() => {
    if (zoomAllowed) return;

    const root = document.documentElement;
    root.classList.add("no-zoom");

    function blockEvent(event: Event) {
      event.preventDefault();
    }
    function blockCtrlWheel(event: WheelEvent) {
      if (event.ctrlKey) event.preventDefault();
    }

    const options = { passive: false } as const;
    document.addEventListener("gesturestart", blockEvent, options);
    document.addEventListener("gesturechange", blockEvent, options);
    document.addEventListener("gestureend", blockEvent, options);
    document.addEventListener("dblclick", blockEvent, options);
    document.addEventListener("wheel", blockCtrlWheel, options);

    return () => {
      root.classList.remove("no-zoom");
      document.removeEventListener("gesturestart", blockEvent);
      document.removeEventListener("gesturechange", blockEvent);
      document.removeEventListener("gestureend", blockEvent);
      document.removeEventListener("dblclick", blockEvent);
      document.removeEventListener("wheel", blockCtrlWheel);
    };
  }, [zoomAllowed]);

  return null;
}