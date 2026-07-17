import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips AES-256-GCM secrets", () => {
    const plain = "super-secret-token-ä";
    const enc = encryptSecret(plain);
    expect(enc.split(":")).toHaveLength(3);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("hello");
    const [iv, tag, data] = enc.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("nope").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret(`${iv}:${tag}`)).toThrow(/Invalid encrypted/);
  });

  it("signs and verifies OAuth state", () => {
    const state = signOAuthState({ org: "abc", provider: "meta" });
    expect(verifyOAuthState(state)).toEqual({ org: "abc", provider: "meta" });
  });

  it("rejects forged OAuth state", () => {
    const state = signOAuthState({ org: "abc" });
    const [body] = state.split(".");
    expect(() => verifyOAuthState(`${body}.forged`)).toThrow();
  });
});
