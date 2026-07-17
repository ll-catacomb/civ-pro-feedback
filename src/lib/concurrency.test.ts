import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "@/lib/concurrency";

describe("bounded calibration concurrency", () => {
  it("never exceeds the requested parallelism and preserves failures", async () => {
    let active = 0;
    let maximumActive = 0;
    const results = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (item === 5) throw new Error("fixture failed");
    });

    expect(maximumActive).toBe(3);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(7);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
