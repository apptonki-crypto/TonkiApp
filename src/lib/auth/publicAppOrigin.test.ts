import { afterEach, describe, expect, it } from "vitest";

import {
  getPublicAppOrigin,
  isUnusableHost,
} from "src/lib/auth/publicAppOrigin";

function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("getPublicAppOrigin", () => {
  const prevAppUrl = process.env.APP_URL;
  const prevPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
    if (prevPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevPublicAppUrl;
    setNodeEnv(prevNodeEnv);
  });

  it("falls back to tonki.io when Host is the 0.0.0.0 bind address", () => {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(
      getPublicAppOrigin(
        req("http://0.0.0.0:3000/api/auth/google/callback", {
          host: "0.0.0.0:3000",
        })
      )
    ).toBe("https://tonki.io");
  });

  it("ignores APP_URL that points at 0.0.0.0", () => {
    process.env.APP_URL = "https://0.0.0.0:3000";
    expect(
      getPublicAppOrigin(
        req("http://0.0.0.0:3000/callback", { host: "0.0.0.0:3000" })
      )
    ).toBe("https://tonki.io");
  });

  it("uses X-Forwarded-Host when the bind address is unusable", () => {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(
      getPublicAppOrigin(
        req("http://0.0.0.0:3000/callback", {
          host: "0.0.0.0:3000",
          "x-forwarded-host": "tonki.io",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://tonki.io");
  });

  it("prefers localhost in development even when APP_URL is production", () => {
    setNodeEnv("development");
    process.env.APP_URL = "https://tonki.io";
    expect(
      getPublicAppOrigin(
        req("http://localhost:3000/api/charges", { host: "localhost:3000" })
      )
    ).toBe("http://localhost:3000");
  });
});

describe("isUnusableHost", () => {
  it("treats 0.0.0.0 bind hosts as unusable", () => {
    expect(isUnusableHost("0.0.0.0")).toBe(true);
    expect(isUnusableHost("0.0.0.0:3000")).toBe(true);
    expect(isUnusableHost("tonki.io")).toBe(false);
  });
});

