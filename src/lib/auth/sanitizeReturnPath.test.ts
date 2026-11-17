import { describe, expect, it } from "vitest";

import { sanitizeAuthReturnPath } from "./sanitizeReturnPath";

describe("sanitizeAuthReturnPath", () => {
  it("rejects empty, login, and protocol-relative paths", () => {
    expect(sanitizeAuthReturnPath(null, "user")).toBeNull();
    expect(sanitizeAuthReturnPath("/login", "user")).toBeNull();
    expect(sanitizeAuthReturnPath("//evil.example/phish", "user")).toBeNull();
  });

  it("allows in-app destinations and strips query/hash", () => {
    expect(sanitizeAuthReturnPath("/dashboard?x=1", "user")).toBe("/dashboard");
    expect(sanitizeAuthReturnPath("/onboarding/empresa", "user")).toBe(
      "/onboarding/empresa"
    );
    expect(sanitizeAuthReturnPath("/onboarding/wallet", "user")).toBeNull();
    expect(sanitizeAuthReturnPath("/account#tab", "user")).toBe("/account");
  });

  it("only allows /admin for admin roles", () => {
    expect(sanitizeAuthReturnPath("/admin/dashboard", "user")).toBeNull();
    expect(sanitizeAuthReturnPath("/admin/dashboard", "admin")).toBe(
      "/admin/dashboard"
    );
  });

  it("returns a one-time charge link for either role", () => {
    const token = "abcdefghijklmnopqrstuv";
    expect(sanitizeAuthReturnPath(`/cobro/${token}?x=1`, "user")).toBe(
      `/cobro/${token}`
    );
    expect(sanitizeAuthReturnPath(`/cobro/${token}`, "admin")).toBe(
      `/cobro/${token}`
    );
    expect(sanitizeAuthReturnPath("/cobro/../admin", "user")).toBeNull();
    expect(sanitizeAuthReturnPath("/cobro/short", "user")).toBeNull();
  });

  it("returns a dynamic QR link for either role", () => {
    const token = "abcdefghijklmnopqrstuv";
    expect(sanitizeAuthReturnPath(`/dinamica/${token}`, "user")).toBe(
      `/dinamica/${token}`
    );
    expect(sanitizeAuthReturnPath(`/dinamica/${token}?x=1`, "admin")).toBe(
      `/dinamica/${token}`
    );
    expect(sanitizeAuthReturnPath("/dinamica/short", "user")).toBeNull();
  });

  it("keeps staff inside /mesero and lets anyone open an invite link", () => {
    const invite = "abcdefghijklmnopqrstuvwxyz012345";
    expect(sanitizeAuthReturnPath("/mesero", "staff")).toBe("/mesero");
    expect(sanitizeAuthReturnPath("/mesero", "user")).toBeNull();
    expect(sanitizeAuthReturnPath("/mesero", "admin")).toBeNull();
    expect(sanitizeAuthReturnPath("/dashboard", "staff")).toBeNull();
    expect(sanitizeAuthReturnPath("/admin/cobrar", "staff")).toBeNull();
    expect(sanitizeAuthReturnPath(`/mesero/unirse/${invite}`, "user")).toBe(
      `/mesero/unirse/${invite}`
    );
    expect(sanitizeAuthReturnPath("/mesero/unirse/short", "user")).toBeNull();
  });
});
