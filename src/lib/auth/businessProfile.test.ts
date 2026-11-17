import { describe, expect, it } from "vitest";

import { requiresBusinessProfile } from "./businessProfile";

describe("requiresBusinessProfile", () => {
  it("asks a company without the completed mark to fill the profile", () => {
    expect(
      requiresBusinessProfile({
        type: "admin",
        business_profile_completed_at: null,
      })
    ).toBe(true);
  });

  it("does not ask again once the profile was completed", () => {
    expect(
      requiresBusinessProfile({
        type: "admin",
        business_profile_completed_at: new Date(),
      })
    ).toBe(false);
  });

  it("never asks a customer", () => {
    expect(
      requiresBusinessProfile({
        type: "user",
        business_profile_completed_at: null,
      })
    ).toBe(false);
  });
});
