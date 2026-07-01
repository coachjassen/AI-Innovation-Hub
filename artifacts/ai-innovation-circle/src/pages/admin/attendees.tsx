import { useListAttendees, getListAttendeesQueryKey } from "@workspace/api-client-react";
import { useActiveCircle } from "@/contexts/CircleContext";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Target, ClipboardList } from "lucide-react";

export default function AdminAttendees() {
  const { activeCircleId } = useActiveCircle();
  const params = activeCircleId !== null ? { circleId: activeCircleId } : undefined;
  const { data: attendees = [], isLoading } = useListAttendees(params, {
    query: { enabled: activeCircleId !== null, queryKey: getListAttendeesQueryKey(params) },
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendees</h1>
        <p className="text-muted-foreground mt-2">
          {attendees.length} member{attendees.length !== 1 ? "s" : ""} in the hub.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No attendees yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {attendees.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{a.name}</p>
                      {a.role === "admin" && (
                        <Badge variant="secondary" className="shrink-0">Admin</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                  </div>
                </div>

                {a.company && (
                  <p className="text-xs text-muted-foreground truncate">{a.company}</p>
                )}

                <div className="flex items-center justify-between border-t pt-3 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground">{(a as any).goalCount ?? 0}</span> Goals
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground">{(a as any).surveyResponseCount ?? 0}</span> Surveys
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Joined {format(new Date(a.createdAt), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
