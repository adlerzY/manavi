export type GuideId = "app-tour" | "reader";

export const GUIDE_EVENT = "manavi:open-guide";

const GUIDE_VERSIONS: Record<GuideId, number> = { "app-tour": 1, reader: 2 };
const seenInMemory = new Set<string>();

function storageKey(id: GuideId): string {
  return `manavi-guide:${id}:v${GUIDE_VERSIONS[id]}`;
}

export function hasSeenGuide(id: GuideId): boolean {
  const key = storageKey(id);
  if (seenInMemory.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(id: GuideId): void {
  const key = storageKey(id);
  seenInMemory.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {}
}

export function openGuide(id: GuideId): void {
  window.dispatchEvent(new CustomEvent<GuideId>(GUIDE_EVENT, { detail: id }));
}