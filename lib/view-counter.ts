import "server-only";
import { redis, isRedisConfigured } from "./redis";
import { prisma } from "./prisma";

const PENDING_CHAPTERS_KEY = "viewcount:pending:chapters";
const PENDING_COMICS_KEY = "viewcount:pending:comics";
const chapterDeltaKey = (id: string) => `viewcount:delta:chapter:${id}`;
const comicDeltaKey = (id: string) => `viewcount:delta:comic:${id}`;

export async function bumpViewCounts(chapterId: string, comicId: string): Promise<void> {
  if (!isRedisConfigured) {
    await prisma.$transaction([
      prisma.chapter.update({ where: { id: chapterId }, data: { viewCount: { increment: 1 } } }),
      prisma.comic.update({ where: { id: comicId }, data: { viewCount: { increment: 1 } } }),
    ]);
    return;
  }

  try {
    await Promise.all([
      redis.incr(chapterDeltaKey(chapterId)),
      redis.incr(comicDeltaKey(comicId)),
      redis.sadd(PENDING_CHAPTERS_KEY, chapterId),
      redis.sadd(PENDING_COMICS_KEY, comicId),
    ]);
  } catch {
  }
}

export interface FlushViewCountsResult {
  chaptersFlushed: number;
  comicsFlushed: number;
}

async function flushOne(
  pendingKey: string,
  id: string,
  deltaKeyFn: (id: string) => string,
  apply: (id: string, delta: number) => Promise<unknown>
): Promise<boolean> {
  const key = deltaKeyFn(id);
  const raw = await redis.getdel<number | string>(key).catch(() => null);
  await redis.srem(pendingKey, id).catch(() => {});

  const delta = Number(raw);
  if (!raw || !Number.isFinite(delta) || delta <= 0) return false;

  await apply(id, delta).catch(() => {});
  return true;
}

export async function flushBufferedViewCounts(): Promise<FlushViewCountsResult> {
  if (!isRedisConfigured) {
    return { chaptersFlushed: 0, comicsFlushed: 0 };
  }

  const [chapterIds, comicIds] = await Promise.all([
    redis.smembers(PENDING_CHAPTERS_KEY) as Promise<string[]>,
    redis.smembers(PENDING_COMICS_KEY) as Promise<string[]>,
  ]);

  let chaptersFlushed = 0;
  let comicsFlushed = 0;

  for (const chapterId of chapterIds) {
    const applied = await flushOne(PENDING_CHAPTERS_KEY, chapterId, chapterDeltaKey, (id, delta) =>
      prisma.chapter.update({ where: { id }, data: { viewCount: { increment: delta } } })
    );
    if (applied) chaptersFlushed += 1;
  }

  for (const comicId of comicIds) {
    const applied = await flushOne(PENDING_COMICS_KEY, comicId, comicDeltaKey, (id, delta) =>
      prisma.comic.update({ where: { id }, data: { viewCount: { increment: delta } } })
    );
    if (applied) comicsFlushed += 1;
  }

  return { chaptersFlushed, comicsFlushed };
}