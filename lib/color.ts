import "server-only";
import sharp from "sharp";

export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
  signal: AbortSignal.timeout(8000),
});
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { data } = await sharp(buffer)
      .resize(1, 1, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const [r, g, b] = data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}