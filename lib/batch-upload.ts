export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processFn: (item: T, index: number) => Promise<R>,
  delayMs = 0
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((item, index) => processFn(item, i + index))
    );

    results.push(...batchResults);

    if (delayMs > 0 && i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}