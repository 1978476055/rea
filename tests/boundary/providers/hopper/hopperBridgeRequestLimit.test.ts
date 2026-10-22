import { expect, it, vi } from "vitest";

import { AnalysisResourceConstraintError } from "../../../../src/domain/analysisErrorCore.js";
import { HopperClient } from "../../../../src/hopper/HopperClient.js";
import {
  HopperFixtureLauncher,
  trackHopperClient,
} from "./hopperClient.fixture.js";

const limit = (maximumBytes: number) =>
  ({ maximumBytes, source: "setting" }) as const;

it("reports a Hopper ceiling mismatch and releases the fixture", async () => {
  const launcher = new HopperFixtureLauncher();
  const client = trackHopperClient(
    new HopperClient({
      launcher,
      startupTimeoutMs: 10_000,
      bridgeMaxRequestBytes: limit(1_048_576),
    }),
  );
  const started = await client.start();
  expect(started.ok).toBe(false);
  if (started.ok) return;
  expect(started.error).toBeInstanceOf(AnalysisResourceConstraintError);
  if (!(started.error instanceof AnalysisResourceConstraintError)) return;
  expect(started.error.reason).toContain("REA_BRIDGE_MAX_REQUEST_BYTES");
  expect(started.error.reason).toContain("1048576");
  expect(started.error.reason).toContain("16777216");
  expect(started.error.reason).toContain("source setting");
  expect(started.error.remediationAction).toContain(
    "Set REA_BRIDGE_MAX_REQUEST_BYTES",
  );
  expect(started.error.reason).not.toContain("no runtime override");
  const process = launcher.processes[0];
  expect(process?.exitCode !== null || process?.signalCode !== null).toBe(true);
});

it("refuses an oversized Hopper request before the fixture receives it", async () => {
  const launcher = new HopperFixtureLauncher(
    undefined,
    "quiet",
    "ready",
    "acknowledge",
    "none",
    8192,
  );
  const client = trackHopperClient(
    new HopperClient({
      launcher,
      startupTimeoutMs: 10_000,
      bridgeMaxRequestBytes: limit(8192),
    }),
  );
  expect((await client.start()).ok).toBe(true);
  const refused = await client.callTool("set_address_name", {
    address: "0x1",
    name: "n".repeat(9000),
  });
  expect(refused.ok).toBe(false);
  if (refused.ok) return;
  expect(refused.error).toBeInstanceOf(AnalysisResourceConstraintError);
  if (!(refused.error instanceof AnalysisResourceConstraintError)) return;
  expect(refused.error.reason).toContain("8192");
  expect(refused.error.reason).toContain("no request was sent");
  expect(refused.error.reason).toContain("REA_BRIDGE_MAX_REQUEST_BYTES");
  expect(launcher.requests.map(({ method }) => method)).not.toContain(
    "set_address_name",
  );
});

it("refuses a Hopper payload whose JSON expansion exceeds the ceiling before serializing it", async () => {
  const launcher = new HopperFixtureLauncher(
    undefined,
    "quiet",
    "ready",
    "acknowledge",
    "none",
    8192,
  );
  const client = trackHopperClient(
    new HopperClient({
      launcher,
      startupTimeoutMs: 10_000,
      bridgeMaxRequestBytes: limit(8192),
    }),
  );
  expect((await client.start()).ok).toBe(true);
  const name = "\u0001".repeat(2000);
  const stringify = vi.spyOn(JSON, "stringify");
  try {
    const refused = await client.callTool("set_address_name", {
      address: "0x1",
      name,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toBeInstanceOf(AnalysisResourceConstraintError);
    if (!(refused.error instanceof AnalysisResourceConstraintError)) return;
    expect(refused.error.reason).toContain("8192");
    expect(refused.error.reason).toContain("no request was sent");
    expect(refused.error.reason).toContain("REA_BRIDGE_MAX_REQUEST_BYTES");
    expect(launcher.requests.map(({ method }) => method)).not.toContain(
      "set_address_name",
    );
    expect(
      stringify.mock.calls.some((call) => {
        const value: unknown = call[0];
        if (typeof value !== "object" || value === null || !("params" in value))
          return false;
        const params = value.params;
        return (
          typeof params === "object" &&
          params !== null &&
          "name" in params &&
          params.name === name
        );
      }),
    ).toBe(false);
  } finally {
    stringify.mockRestore();
  }
});

it("sends a Hopper request above 16 MiB when both sides raise the ceiling", async () => {
  const ceiling = 17 * 1024 * 1024;
  const launcher = new HopperFixtureLauncher(
    undefined,
    "quiet",
    "ready",
    "acknowledge",
    "none",
    ceiling,
  );
  const client = trackHopperClient(
    new HopperClient({
      launcher,
      startupTimeoutMs: 10_000,
      bridgeMaxRequestBytes: limit(ceiling),
    }),
  );
  expect((await client.start()).ok).toBe(true);
  const value = "h".repeat(16 * 1024 * 1024);
  // The fixture echoes the payload. That reply is the proof the pre-dispatch
  // check admitted a request above the historical 16 MiB ceiling. The fixture's
  // IPC acknowledgement is not used here; a 16 MiB params object is not a
  // reliable control message.
  await expect(client.callTool("echo", { value })).resolves.toEqual({
    ok: true,
    value: { value },
  });
});
