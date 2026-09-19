import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deployProduction,
  PRODUCTION_ORIGIN,
} from "../../scripts/deploy-production";

afterEach(() => vi.restoreAllMocks());

describe("production deployment verification", () => {
  it("publishes once and checks the fixed production origin without rebuilding", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi.fn().mockResolvedValue(0);
    const wait = vi.fn().mockResolvedValue(undefined);
    const result = await deployProduction(run, wait, {
      APP_ORIGIN: "https://wrong.example",
    });
    expect(result).toBe(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][0].slice(1)).toEqual([
      "deploy",
      "--env",
      "production",
    ]);
    expect(run.mock.calls[1][0]).toEqual([
      "--import",
      "tsx",
      expect.stringContaining("scripts/verify-production.ts"),
    ]);
    expect(run.mock.calls[1][1].APP_ORIGIN).toBe(PRODUCTION_ORIGIN);
    expect(run.mock.calls[1][2]).toBe(90_000);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not verify or retry a failed publication", async () => {
    const run = vi.fn().mockResolvedValue(2);
    const wait = vi.fn();
    expect(await deployProduction(run, wait)).toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries only read-only smoke checks while deployment propagates", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const run = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await deployProduction(run, wait)).toBe(0);
    expect(run).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls).toEqual([[5_000], [15_000]]);
    expect(
      run.mock.calls.slice(1).every(([args]) => args[0] === "--import"),
    ).toBe(true);
  });

  it("fails the build after bounded checks and explains that the version remains live", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const run = vi.fn().mockResolvedValueOnce(0).mockResolvedValue(1);
    expect(
      await deployProduction(run, vi.fn().mockResolvedValue(undefined)),
    ).toBe(1);
    expect(run).toHaveBeenCalledTimes(4);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("The deployed version is still live"),
    );
    expect(run.mock.calls.some(([args]) => args.includes("rollback"))).toBe(
      false,
    );
  });
});
