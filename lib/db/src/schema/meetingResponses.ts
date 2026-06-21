import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { meetingsTable } from "./meetings";
import { attendeesTable } from "./attendees";

export const meetingResponsesTable = pgTable(
  "meeting_responses",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id")
      .references(() => meetingsTable.id, { onDelete: "cascade" })
      .notNull(),
    attendeeId: integer("attendee_id")
      .references(() => attendeesTable.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull(), // attending | not_attending
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqMeetingAttendee: unique().on(t.meetingId, t.attendeeId),
  }),
);

export type MeetingResponse = typeof meetingResponsesTable.$inferSelect;
