import { createHmac } from "node:crypto";

import { expect, it } from "vitest";

import { cutterBridgeMac } from "./cutterBridgeMac.js";

const TOKEN = "bridge-token-0123456789abcdef";
const SESSION = "00000000-0000-4000-8000-000000000001";
const NONCE = "a".repeat(64);

it("matches one update of the joined client and response preimages", () => {
  const request = JSON.stringify({ command: "雪" });
  const clientPrefix = `rea-cutter-client-v2:${SESSION}:${NONCE}:${NONCE}:`;
  const responsePrefix = `rea-cutter-response-v2:${SESSION}:${NONCE}:${NONCE}:`;
  expect(clientPrefix).toHaveLength(188);
  expect(responsePrefix).toHaveLength(190);
  expect(cutterBridgeMac(TOKEN, [clientPrefix, request]).toString("hex")).toBe(
    createHmac("sha256", TOKEN)
      .update(`${clientPrefix}${request}`)
      .digest("hex"),
  );
  expect(
    cutterBridgeMac(TOKEN, [responsePrefix, request]).toString("hex"),
  ).toBe(
    createHmac("sha256", TOKEN)
      .update(`${responsePrefix}${request}`)
      .digest("hex"),
  );
});

it("hashes a preimage that does not fit in one Node string", () => {
  const prefix = `rea-cutter-client-v2:${SESSION}:${NONCE}:${NONCE}:`;
  const stringCeiling = 536_870_888;
  const body = "x".repeat(stringCeiling - prefix.length + 1);
  expect(prefix.length + body.length).toBe(stringCeiling + 1);
  expect(cutterBridgeMac(TOKEN, [prefix, body])).toHaveLength(32);
});
