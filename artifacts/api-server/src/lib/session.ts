// Augment express-session to include our attendee info
declare module "express-session" {
  interface SessionData {
    attendeeId: number;
    attendeeRole: string;
  }
}

export {};
