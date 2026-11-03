import { describe, expect, it } from "vitest";

import {
  formatStoredHours,
  formatWeekHours,
  parseWeekHours,
  serializeWeekHours,
} from "./hours";

describe("business hours", () => {
  it("turns stored JSON into a readable schedule", () => {
    const raw =
      '{"mon":{"closed":false,"open":"09:00","close":"18:00"},"tue":{"closed":false,"open":"09:00","close":"18:00"},"wed":{"closed":true},"thu":{"closed":true},"fri":{"closed":true},"sat":{"closed":true},"sun":{"closed":true}}';

    expect(formatStoredHours(raw)).toBe("Lun–Mar 09:00–18:00\nMié–Dom cerrado");
  });

  it("keeps a round trip of open and closed days", () => {
    const week = parseWeekHours(null);
    week.fri = { closed: false, open: "11:00", close: "23:00" };
    const stored = serializeWeekHours(week);
    const again = parseWeekHours(stored);
    expect(again.fri).toEqual({
      closed: false,
      open: "11:00",
      close: "23:00",
    });
    expect(again.mon.closed).toBe(true);
    expect(formatWeekHours(again)).toContain("Vie 11:00–23:00");
  });
});
