import { useListMeetings, getListMeetingsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Download, FileText, ChevronDown } from "lucide-react";
import { useState } from "react";

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
  const nextMeeting = upcomingMeetings[0];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground mt-2">Review past meeting insights and materials.</p>
      </div>

      {nextMeeting && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Calendar className="h-5 w-5" />
              Upcoming Meeting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{format(new Date(nextMeeting.date), "MMMM d, yyyy")}</div>
            <div className="text-muted-foreground mt-1">{format(new Date(nextMeeting.date), "h:mm a")}</div>
          </CardContent>
        </Card>
      )}

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

function MeetingCard({ meeting }: { meeting: any }) {
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