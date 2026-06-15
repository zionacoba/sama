import { describe, expect, it } from "vitest";
import { sendInChunks } from "@/lib/send-in-chunks";

// Fake async sender, no real emails. Items >= 0 resolve to `sent:<item>`; the
// sentinel negative items reject, so we can assert per-item alignment. delayMs 0
// keeps the suite fast (no real waiting between chunks).
const opts = { chunkSize: 2, delayMs: 0 };

const sender = async (n: number): Promise<string> => {
  if (n < 0) throw new Error(`fail:${n}`);
  return `sent:${n}`;
};

describe("sendInChunks", () => {
  it("all-success returns fulfilled results in input order", async () => {
    const results = await sendInChunks([1, 2, 3, 4, 5], sender, opts);
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([
      "sent:1",
      "sent:2",
      "sent:3",
      "sent:4",
      "sent:5",
    ]);
  });

  it("a failure does not abort the rest; statuses align to input order", async () => {
    const items = [1, -2, 3, -4, 5];
    const results = await sendInChunks(items, sender, opts);
    expect(results).toHaveLength(items.length);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    // Rejected reasons line up with the exact failing item.
    const r1 = results[1];
    expect(r1.status === "rejected" && (r1.reason as Error).message).toBe("fail:-2");
    const r3 = results[3];
    expect(r3.status === "rejected" && (r3.reason as Error).message).toBe("fail:-4");
  });

  it("an empty array returns an empty result set", async () => {
    const results = await sendInChunks([], sender, opts);
    expect(results).toEqual([]);
  });

  it("result length always equals input length across chunk boundaries", async () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    const results = await sendInChunks(items, sender, { chunkSize: 3, delayMs: 0 });
    expect(results).toHaveLength(7);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});
