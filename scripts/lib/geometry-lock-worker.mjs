import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { gridIntersectionArea } from "./spine.mjs";

const area = (p) => gridIntersectionArea({ a: p.a.placement, b: p.b.placement, cell: p.cell });

if (!isMainThread) {
  parentPort.on("message", ({ index, pair }) => parentPort.postMessage({ index, area: area(pair) }));
}

export async function computePairAreas(pairs, workers) {
  if (workers <= 1) return pairs.map(area);
  if (pairs.length === 0) return [];
  const pool = [];
  try {
    return await new Promise((resolve, reject) => {
      const results = new Array(pairs.length);
      let next = 0;
      let completed = 0;
      const dispatch = (worker) => {
        if (next < pairs.length) {
          const index = next++;
          worker.postMessage({ index, pair: pairs[index] });
        }
      };
      for (let i = 0; i < Math.min(workers, pairs.length); i++) {
        const worker = new Worker(new URL(import.meta.url));
        pool.push(worker);
        worker.on("error", reject);
        worker.on("exit", (code) => reject(new Error(`geometry lock worker exited unexpectedly (${code})`)));
        worker.on("message", ({ index, area: result }) => {
          results[index] = result;
          if (++completed === pairs.length) resolve(results);
          else dispatch(worker);
        });
        dispatch(worker);
      }
    });
  } finally {
    await Promise.all(pool.map((worker) => worker.terminate()));
  }
}
