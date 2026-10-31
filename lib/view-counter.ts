import "server-only";
import type { Prisma } from "@prisma/client";
import { redis, isRedisConfigured } from "./redis";
import { prisma } from "./prisma";

const PENDING_CHAPTERS_KEY = "viewcount:pending:chapters";
const PENDING_COMICS_KEY = "viewcount:pending:comics";
const FLUSH_CHUNK_SIZE = 200;

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
    const pipeline = redis.pipeline();
    pipeline.incr(chapterDeltaKey(chapterId));
    pipeline.incr(comicDeltaKey(comicId));
    pipeline.sadd(PENDING_CHAPTERS_KEY, chapterId);
    pipeline.sadd(PENDING_COMICS_KEY, comicId);
    await pipeline.exec();
  } catch {
  }
}

export interface FlushViewCountsResult {
  chaptersFlushed: number;
  comicsFlushed: number;
}

async function flushGroup(
  pendingKey: string,
  deltaKey: (id: string) => string,
  apply: (id: string, delta: number) => Prisma.PrismaPromise<unknown>
): Promise<number> {
  const ids = (await redis.smembers(pendingKey)) as string[];
  if (ids.length === 0) return 0;

  let applied = 0;

  for (let i = 0; i < ids.length; i += FLUSH_CHUNK_SIZE) {
    const chunkIds = ids.slice(i, i + FLUSH_CHUNK_SIZE);

    await redis.srem(pendingKey, ...chunkIds);

    const read = redis.pipeline();
    for (const id of chunkIds) read.getdel(deltaKey(id));
    const raw = (await read.exec()) as unknown[];

    const deltas: [string, number][] = [];
    chunkIds.forEach((id, index) => {
      const delta = Number(raw[index]);
      if (Number.isFinite(delta) && delta > 0) deltas.push([id, delta]);
    });
    if (deltas.length === 0) continue;

    try {
      await prisma.$transaction(deltas.map(([id, delta]) => apply(id, delta)));
      applied += deltas.length;
    } catch {
      const restore = redis.pipeline();
      for (const [id, delta] of deltas) {
        restore.incrby(deltaKey(id), delta);
        restore.sadd(pendingKey, id);
      }
      await restore.exec().catch(() => {});
    }
  }

  return applied;
}

export async function flushBufferedViewCounts(): Promise<FlushViewCountsResult> {
  if (!isRedisConfigured) {
    return { chaptersFlushed: 0, comicsFlushed: 0 };
  }

  const chaptersFlushed = await flushGroup(PENDING_CHAPTERS_KEY, chapterDeltaKey, (id, delta) =>
    prisma.chapter.updateMany({ where: { id }, data: { viewCount: { increment: delta } } })
  );

  const comicsFlushed = await flushGroup(PENDING_COMICS_KEY, comicDeltaKey, (id, delta) =>
    prisma.comic.updateMany({ where: { id }, data: { viewCount: { increment: delta } } })
  );

  return { chaptersFlushed, comicsFlushed };
}