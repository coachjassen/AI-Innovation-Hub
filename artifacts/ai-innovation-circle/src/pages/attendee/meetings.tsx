import { useListMeetings, getListMeetingsQueryKey, useSetMeetingResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Download, FileText, ChevronDown, Check, X, Users } from "lucide-react";
import { useState } from "react";

type Meeting = {
  id: number;
  date: string;
  notes?: string | null;
  slidesPath?: string | null;
  keyInsight?: string | null;
  myResponse?: string | null;
  attendingCount?: number;
  notAttendingCount?: number;
  totalInvited?: number;
};

export default function AttendeeMeetings() {
  const { data: meetings = [], isLoading } = useListMeetings({
    query: {
      queryKey: getListMeetingsQueryKey(),
    }
  });

  const sortedMeetings = [...meetings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const now = new Date();
  const upcomingMeetings = sortedMeetings.filter(m => new Date(m.date) > now).reverse();
  const pastMeetings = sortedMeetings.filter(m => new Date(m.date) <= now);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground mt-2">Review meeting details, RSVP, and access materials.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Upcoming Meetings
        </h2>
        {isLoading ? (
          <div className="h-32 bg-muted animate-pulse rounded-lg" />
        ) : upcomingMeetings.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-gray-50/50">
            <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No upcoming meetings</h3>
            <p className="text-gray-500 mt-1">You'll be invited here when a new session is scheduled.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingMeetings.map((meeting) => (
              <UpcomingMeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold border-b pb-2">Past Meetings</h2>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : pastMeetings.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-gray-50/50">
            <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No past meetings</h3>
            <p className="text-gray-500 mt-1">Previous meeting records will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pastMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UpcomingMeetingCard({ meeting }: { meeting: Meeting }) {
  const queryClient = useQueryClient();
  const setResponse = useSetMeetingResponse();

  const respond = (status: "attending" | "not_attending") => {
    setResponse.mutate(
      { id: meeting.id, data: { status } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }) },
    );
  };

  const attending = meeting.myResponse === "attending";
  const declined = meeting.myResponse === "not_attending";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-4 flex-wrap">
          <span className="text-2xl font-bold">{format(new Date(meeting.date), "MMMM d, yyyy")}</span>
          {meeting.myResponse ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                attending ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
              }`}
            >
              {attending ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {attending ? "You're attending" : "You're not attending"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-medium">
              Awaiting your RSVP
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-muted-foreground">{format(new Date(meeting.date), "h:mm a")}</div>
        {meeting.keyInsight && (
          <p className="text-sm">
            <span className="font-medium">Focus:</span> {meeting.keyInsight}
          </p>
        )}
        {meeting.notes && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{meeting.notes}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant={attending ? "default" : "outline"}
            onClick={() => respond("attending")}
            disabled={setResponse.isPending}
          >
            <Check className="mr-1.5 h-4 w-4" /> I'll attend
          </Button>
          <Button
            size="sm"
            variant={declined ? "default" : "outline"}
            onClick={() => respond("not_attending")}
            disabled={setResponse.isPending}
          >
            <X className="mr-1.5 h-4 w-4" /> Can't make it
          </Button>
          {typeof meeting.attendingCount === "number" && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {meeting.attendingCount} attending
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Calendar className="h-4 w-4" />
              {format(new Date(meeting.date), "MMMM d, yyyy")}
            </div>
            {meeting.keyInsight && (
              <h3 className="text-lg font-medium">Insight: {meeting.keyInsight}</h3>
            )}
          </div>

          {meeting.slidesPath && (
            <Button variant="outline" size="sm" asChild>
              <a href={meeting.slidesPath} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Download Slides
              </a>
            </Button>
          )}
        </div>

        {meeting.notes && (
          <div className="mt-6 border-t pt-4">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center"><FileText className="mr-2 h-4 w-4" /> Meeting Notes</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-md mt-2 whitespace-pre-wrap">
                {meeting.notes}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
