export type PoolResult<T> =
  | { item: T; status: "fulfilled" }
  | { item: T; status: "rejected"; reason: unknown };

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<PoolResult<T>[]> {
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results = new Array<PoolResult<T>>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await worker(items[index]);
        results[index] = { item: items[index], status: "fulfilled" };
      } catch (reason) {
        results[index] = { item: items[index], status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
