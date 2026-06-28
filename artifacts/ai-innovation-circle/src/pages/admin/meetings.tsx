import { useState } from "react";
import {
  useListMeetings,
  useCreateMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useListCircles,
  useListMeetingResponses,
  getListMeetingsQueryKey,
} from "@workspace/api-client-react";
import { useActiveCircle } from "@/contexts/CircleContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Plus, MoreHorizontal, Trash2, FileText, ChevronDown, Check, X, Clock, Users, ListChecks } from "lucide-react";
import { AgendaEditor } from "@/components/AgendaEditor";

export default function AdminMeetings() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [agendaMeeting, setAgendaMeeting] = useState<{ id: number; date: string } | null>(null);
  const [rosterMeeting, setRosterMeeting] = useState<{ id: number; date: string } | null>(null);
  const queryClient = useQueryClient();

  const { activeCircleId } = useActiveCircle();
  const params = activeCircleId !== null ? { circleId: activeCircleId } : undefined;
  const { data: meetings = [], isLoading } = useListMeetings(params, {
    query: { enabled: activeCircleId !== null, queryKey: getListMeetingsQueryKey(params) },
  });
  const { data: circles = [] } = useListCircles();
  const createMeeting = useCreateMeeting();
  const deleteMeeting = useDeleteMeeting();

  const sorted = [...meetings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const now = new Date();
  const upcoming = sorted.filter((m) => new Date(m.date) > now);
  const past = sorted.filter((m) => new Date(m.date) <= now);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMeeting.mutate(
      {
        data: {
          circleId: parseInt(fd.get("circleId") as string, 10),
          date: fd.get("date") as string,
          notes: (fd.get("notes") as string) || undefined,
          keyInsight: (fd.get("keyInsight") as string) || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
          setIsCreateOpen(false);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this meeting?")) return;
    deleteMeeting.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }),
    });
  };

  const MeetingRow = ({ m }: { m: (typeof meetings)[0] }) => {
    const isOpen = expandedId === m.id;
    const attending = m.attendingCount ?? 0;
    const declined = m.notAttendingCount ?? 0;
    const invited = m.totalInvited ?? 0;
    const noResponse = Math.max(invited - attending - declined, 0);
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(new Date(m.date), "MMMM d, yyyy")}
              </div>
              {m.keyInsight && (
                <p className="text-sm text-muted-foreground ml-6 italic">"{m.keyInsight}"</p>
              )}
              <div className="flex flex-wrap items-center gap-3 ml-6 pt-1 text-xs">
                <span className="inline-flex items-center gap-1 text-green-700">
                  <Check className="h-3.5 w-3.5" /> {attending} attending
                </span>
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <X className="h-3.5 w-3.5" /> {declined} declined
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Clock className="h-3.5 w-3.5" /> {noResponse} no response
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRosterMeeting({ id: m.id, date: m.date })}>
                <Users className="h-4 w-4 mr-1" />
                RSVPs
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAgendaMeeting({ id: m.id, date: m.date })}>
                <ListChecks className="h-4 w-4 mr-1" />
                Agenda
              </Button>
              {m.notes && (
                <Button variant="ghost" size="sm" onClick={() => setExpandedId(isOpen ? null : m.id)}>
                  <FileText className="h-4 w-4 mr-1" />
                  Notes
                  <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(m.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {isOpen && m.notes && (
            <div className="mt-4 pt-4 border-t text-sm text-gray-600 bg-gray-50 p-4 rounded-md whitespace-pre-wrap">
              {m.notes}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meetings</h1>
          <p className="text-muted-foreground mt-2">Schedule and manage circle sessions.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Meeting</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="circleId">Circle</Label>
                <select name="circleId" id="circleId" required className="w-full border rounded-md px-3 py-2 text-sm">
                  {circles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input type="date" name="date" id="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keyInsight">Key Insight (optional)</Label>
                <Input name="keyInsight" id="keyInsight" placeholder="One memorable takeaway..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Meeting Notes (optional)</Label>
                <Textarea name="notes" id="notes" rows={4} placeholder="Summary of discussion..." />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMeeting.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i=><div key={i} className="h-20 bg-muted animate-pulse rounded-lg"/>)}</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-primary">Upcoming</h2>
              {upcoming.map((m) => <MeetingRow key={m.id} m={m} />)}
            </div>
          )}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Past Meetings</h2>
            {past.length === 0
              ? <p className="text-muted-foreground text-sm">No past meetings yet.</p>
              : past.map((m) => <MeetingRow key={m.id} m={m} />)
            }
          </div>
        </>
      )}

      <Dialog open={agendaMeeting !== null} onOpenChange={(o) => !o && setAgendaMeeting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Agenda{agendaMeeting ? ` — ${format(new Date(agendaMeeting.date), "MMMM d, yyyy")}` : ""}
            </DialogTitle>
          </DialogHeader>
          {agendaMeeting && <AgendaEditor meetingId={agendaMeeting.id} />}
        </DialogContent>
      </Dialog>

      <Dialog open={rosterMeeting !== null} onOpenChange={(o) => !o && setRosterMeeting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              RSVPs{rosterMeeting ? ` — ${format(new Date(rosterMeeting.date), "MMMM d, yyyy")}` : ""}
            </DialogTitle>
          </DialogHeader>
          {rosterMeeting && <RosterList meetingId={rosterMeeting.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RosterList({ meetingId }: { meetingId: number }) {
  const { data: responses = [], isLoading } = useListMeetingResponses(meetingId);

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>;
  }
  if (responses.length === 0) {
    return <p className="text-sm text-muted-foreground">No members in this circle.</p>;
  }

  const badge = (status: string) => {
    if (status === "attending") return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><Check className="h-3.5 w-3.5" /> Attending</span>;
    if (status === "not_attending") return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><X className="h-3.5 w-3.5" /> Not attending</span>;
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Clock className="h-3.5 w-3.5" /> No response</span>;
  };

  return (
    <div className="divide-y max-h-[60vh] overflow-y-auto">
      {responses.map((r) => (
        <div key={r.attendeeId} className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">{r.attendeeName}</p>
            {r.attendeeCompany && <p className="text-xs text-muted-foreground">{r.attendeeCompany}</p>}
          </div>
          {badge(r.status)}
        </div>
      ))}
    </div>
  );
}
