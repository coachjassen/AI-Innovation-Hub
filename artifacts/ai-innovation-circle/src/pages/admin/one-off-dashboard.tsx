import { useState, useEffect } from "react";
import {
  useListMeetings,
  useListMeetingInvitees, 
  useListMeetingResponses,
  getListMeetingsQueryKey,
  getListMeetingInviteesQueryKey,
  getListMeetingResponsesQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Link } from "wouter";
import { Users, Mail, Check, X, Clock, AlertCircle, CheckCircle2, ExternalLink, Calendar, FileText, Activity, ArrowRight } from "lucide-react";

type OneOffCircle = {
  id: number;
  name: string;
};

export function OneOffDashboard({ activeCircle }: { activeCircle: OneOffCircle }) {
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);

  const { data: meetings = [], isLoading: meetingsLoading } = useListMeetings(
    { circleId: activeCircle.id },
    { query: { enabled: !!activeCircle.id, queryKey: getListMeetingsQueryKey({ circleId: activeCircle.id }) } }
  );

  useEffect(() => {
    const hasSelectedMeeting = selectedMeetingId !== null && meetings.some((meeting) => meeting.id === selectedMeetingId);
    if (meetings.length > 0 && !hasSelectedMeeting) {
      const sorted = [...meetings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const now = new Date();
      const upcoming = sorted.filter(m => new Date(m.date) >= now);
      const defaultMeeting = upcoming.length > 0 ? upcoming[0] : sorted[sorted.length - 1];
      setSelectedMeetingId(defaultMeeting.id);
    } else if (meetings.length === 0 && selectedMeetingId !== null) {
      setSelectedMeetingId(null);
    }
  }, [meetings, selectedMeetingId]);

  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId);

  const { data: invitees = [], isLoading: inviteesLoading, isError: inviteesError } = useListMeetingInvitees(
    selectedMeetingId ?? 0,
    { query: { enabled: !!selectedMeetingId, queryKey: getListMeetingInviteesQueryKey(selectedMeetingId ?? 0) } }
  );

  const { data: responses = [], isLoading: responsesLoading, isError: responsesError } = useListMeetingResponses(
    selectedMeetingId ?? 0,
    { query: { enabled: !!selectedMeetingId, queryKey: getListMeetingResponsesQueryKey(selectedMeetingId ?? 0) } }
  );

  if (meetingsLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient w-fit">
            {activeCircle.name}
          </h1>
          <p className="text-muted-foreground mt-2">
            No events have been created for this Hub yet.
          </p>
        </div>
        <Card className="border-dashed shadow-none bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No Event Planned</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Head to the Meetings tab to create the one-off event and prepare invitations.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invitedList = invitees.filter(i => i.invited);
  const totalInvited = invitedList.length;
  const sent = invitedList.filter(i => i.invitationSentAt).length;

  const getResponseStatus = (attendeeId: number) => {
    const res = responses.find(r => r.attendeeId === attendeeId);
    return res ? res.status : "no_response";
  };

  const attending = invitedList.filter(i => getResponseStatus(i.attendeeId) === "attending").length;
  const notAttending = invitedList.filter(i => getResponseStatus(i.attendeeId) === "not_attending").length;
  const awaiting = Math.max(totalInvited - attending - notAttending, 0);

  const stats = [
    { label: "Invited", value: totalInvited, icon: Users, color: "text-blue-600" },
    { label: "Sent", value: sent, icon: Mail, color: "text-purple-600" },
    { label: "Attending", value: attending, icon: Check, color: "text-green-600" },
    { label: "Awaiting RSVP", value: awaiting, icon: Clock, color: "text-amber-600" },
    { label: "Declined", value: notAttending, icon: X, color: "text-gray-500" },
  ];

  const isLoadingData = inviteesLoading || responsesLoading;
  const attachmentHref = selectedMeeting?.invitationAttachmentPath
    ? selectedMeeting.invitationAttachmentPath.startsWith("/objects/")
      ? `/api/storage/objects/${selectedMeeting.invitationAttachmentPath.slice("/objects/".length)}`
      : selectedMeeting.invitationAttachmentPath
    : null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient w-fit">
            {activeCircle.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <p className="text-muted-foreground">Event dashboard and RSVP status.</p>
            <span className="text-muted-foreground/40">·</span>
            <Link href="/admin/meetings" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
              Manage event <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {meetings.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Select event:</span>
            <Select 
              value={selectedMeetingId?.toString() ?? ""} 
              onValueChange={(v) => setSelectedMeetingId(Number(v))}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meetings.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {format(new Date(m.date), "MMM d, yyyy")} {m.keyInsight ? `- ${m.keyInsight}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {selectedMeeting && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-brand overflow-hidden card-accent">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Event Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Date</p>
                <p className="text-lg font-medium">{format(new Date(selectedMeeting.date), "EEEE, MMMM d, yyyy")}</p>
              </div>
              {selectedMeeting.keyInsight && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Event Focus</p>
                  <p className="text-base text-foreground">{selectedMeeting.keyInsight}</p>
                </div>
              )}
              {selectedMeeting.notes && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                  <div className="text-sm bg-muted/40 p-3 rounded-md border text-foreground whitespace-pre-wrap">
                    {selectedMeeting.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-600" />
                Invitation Document
              </CardTitle>
              <CardDescription>
                The secure file link delivered to recipients.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attachmentHref ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                    <FileText className="h-8 w-8 text-blue-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={selectedMeeting.invitationAttachmentName || "Document"}>
                        {selectedMeeting.invitationAttachmentName || "Invitation Document"}
                      </p>
                      <a 
                        href={attachmentHref}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        View Attachment <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed text-center">
                  <p className="text-sm text-muted-foreground">No attachment provided</p>
                </div>
              )}

              {selectedMeeting.invitationBody ? (
                <div className="mt-6">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Invitation Message</p>
                  <div className="text-sm text-foreground whitespace-pre-wrap rounded-md border-l-2 border-primary/30 bg-muted/20 p-3">
                    {selectedMeeting.invitationBody}
                  </div>
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">No invitation message has been added.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover-lift shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                {isLoadingData ? (
                  <div className="h-8 w-12 bg-muted animate-pulse rounded" />
                ) : (
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                )}
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Roster Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Invitation & RSVP Roster
          </CardTitle>
          <CardDescription>
            Real-time delivery status and responses from invited guests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingData ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
            </div>
          ) : inviteesError || responsesError ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              Unable to load the invitation roster. Please refresh and try again.
            </p>
          ) : invitedList.length === 0 ? (
            <div className="text-center p-8 bg-muted/20 rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">No one has been invited to this event yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Delivery Status</th>
                    <th className="px-4 py-3 font-medium">RSVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invitedList.map((invitee) => {
                    const status = getResponseStatus(invitee.attendeeId);
                    return (
                      <tr key={invitee.attendeeId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {invitee.attendeeName}
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">{invitee.attendeeEmail}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {invitee.attendeeCompany || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {invitee.invitationSentAt ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                              <CheckCircle2 className="h-3.5 w-3.5" /> 
                              Sent {format(new Date(invitee.invitationSentAt), "MMM d")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertCircle className="h-3.5 w-3.5" /> Unsent
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {status === "attending" ? (
                            <span className="inline-flex items-center gap-1.5 text-green-600 font-medium">
                              <Check className="h-4 w-4" /> Attending
                            </span>
                          ) : status === "not_attending" ? (
                            <span className="inline-flex items-center gap-1.5 text-gray-500">
                              <X className="h-4 w-4" /> Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-600">
                              <Clock className="h-4 w-4" /> No Response
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
