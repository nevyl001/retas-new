/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useVisiblePolling } from "./useVisiblePolling";

describe("useVisiblePolling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("ejecuta carga inicial y luego a intervalMs (no cada 4s)", async () => {
    const callback = jest.fn().mockResolvedValue(undefined);
    const POLL_INTERVAL_MS = 15_000;

    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: POLL_INTERVAL_MS,
        runImmediately: true,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(14_999);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("no ejecuta poll mientras document.hidden", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });

    const callback = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 10_000,
        runImmediately: true,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    hidden = true;
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("al volver a visible dispara una sola carga inmediata", async () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });

    const callback = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 60_000,
        runImmediately: true,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("no arranca dos solicitudes simultáneas", async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let calls = 0;
    const callback = jest.fn(() => {
      calls += 1;
      if (calls === 1) return first;
      return Promise.resolve();
    });

    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 5_000,
        runImmediately: true,
      })
    );

    // First call started but not finished
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    // Still blocked by in-flight
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("limpia interval y listener al desmontar", async () => {
    const clearIntervalSpy = jest.spyOn(window, "clearInterval");
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const callback = jest.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 10_000,
        runImmediately: false,
      })
    );

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
  });

  it("runImmediately:false no carga al montar pero sí en el intervalo", async () => {
    const callback = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 8_000,
        runImmediately: false,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(0);

    await act(async () => {
      jest.advanceTimersByTime(8_000);
      await Promise.resolve();
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("enabled:false no programa polls", async () => {
    const callback = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useVisiblePolling({
        callback,
        intervalMs: 5_000,
        enabled: false,
        runImmediately: true,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
