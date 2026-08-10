/**
 * @jest-environment node
 */
import { dedupeInflight } from "./dedupeInflight";

describe("dedupeInflight", () => {
  it("reusa la misma Promise mientras está in-flight", async () => {
    let calls = 0;
    const factory = () => {
      calls += 1;
      return new Promise<number>((resolve) => setTimeout(() => resolve(calls), 20));
    };
    const a = dedupeInflight("k", factory);
    const b = dedupeInflight("k", factory);
    const [ra, rb] = await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(ra).toBe(1);
    expect(rb).toBe(1);
  });

  it("permite una nueva llamada tras resolver", async () => {
    let calls = 0;
    const factory = async () => {
      calls += 1;
      return calls;
    };
    await dedupeInflight("k2", factory);
    await dedupeInflight("k2", factory);
    expect(calls).toBe(2);
  });
});
