/**
 * Runs `worker(item)` for every item in `items`, but never lets more
 * than `limit` calls be in flight at once. Returns results in the
 * same order as `items`, regardless of completion order.
 *
 * Simple "worker pool" pattern: spin up `limit` workers, each one
 * pulls the next unclaimed item off a shared cursor and processes it,
 * repeating until the cursor runs out.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, runWorker);
  await Promise.all(workers);

  return results;
}