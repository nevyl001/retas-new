import { isAmericanoPublicInitialLoadPending } from "./americanoPublicLoadState";

describe("americanoPublicLoadState", () => {
  it("initial load pending sin fetch ni snapshot", () => {
    expect(isAmericanoPublicInitialLoadPending(null, null)).toBe(true);
  });

  it("no pending tras fetch vacío", () => {
    expect(isAmericanoPublicInitialLoadPending({ status: "empty" }, null)).toBe(
      false
    );
  });

  it("no pending si ya hay snapshot en memoria", () => {
    expect(
      isAmericanoPublicInitialLoadPending(null, {
        version: 1,
        rounds: [],
        ranking: [],
      } as never)
    ).toBe(false);
  });
});
