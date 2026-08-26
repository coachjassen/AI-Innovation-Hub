import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { meetingsTable } from "./meetings";
import { attendeesTable } from "./attendees";

export const meetingInviteesTable = pgTable(
  "meeting_invitees",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id")
      .references(() => meetingsTable.id, { onDelete: "cascade" })
      .notNull(),
    attendeeId: integer("attendee_id")
      .references(() => attendeesTable.id, { onDelete: "cascade" })
      .notNull(),
    invitationTokenHash: text("invitation_token_hash").unique(),
    invitationSentAt: timestamp("invitation_sent_at"),
    invitationSendCount: integer("invitation_send_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqMeetingInvitee: unique().on(t.meetingId, t.attendeeId),
  }),
);

export const insertMeetingInviteeSchema = createInsertSchema(meetingInviteesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMeetingInvitee = z.infer<typeof insertMeetingInviteeSchema>;
export type MeetingInvitee = typeof meetingInviteesTable.$inferSelect;