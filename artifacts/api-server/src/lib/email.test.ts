import { describe, expect, it } from "vitest";
import { buildMeetingIcs } from "./email";

describe("buildMeetingIcs", () => {
  it("interprets an admin-entered winter meeting time in Pacific/Auckland", async () => {
    const value = await buildMeetingIcs({
      meetingId: 1,
      circleName: "Test Hub",
      dateIso: "2026-07-15T09:00",
      agenda: [],
    });

    expect(value).toContain("DTSTART:20260714T210000Z");
  });

  it("automatically applies New Zealand daylight saving time", async () => {
    const value = await buildMeetingIcs({
      meetingId: 2,
      circleName: "Test Hub",
      dateIso: "2026-01-15T09:00",
      agenda: [],
    });

    expect(value).toContain("DTSTART:20260114T200000Z");
  });

  it("preserves explicitly offset timestamps", async () => {
    const value = await buildMeetingIcs({
      meetingId: 3,
      circleName: "Test Hub",
      dateIso: "2026-07-15T09:00:00+12:00",
      agenda: [],
    });

    expect(value).toContain("DTSTART:20260714T210000Z");
  });
});