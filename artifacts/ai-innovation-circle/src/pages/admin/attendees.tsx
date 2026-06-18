import { useListAttendees } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Target, ClipboardList } from "lucide-react";

export default function AdminAttendees() {
  const { data: attendees = [], isLoading } = useListAttendees();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Attendees</h1>
        <p className="text-muted-foreground mt-2">
          {attendees.length} member{attendees.length !== 1 ? "s" : ""} in the circle.
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
        <div className="grid gap-4">
          {attendees.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-sm text-muted-foreground">{a.email}</p>
                      </div>
                      {a.role === "admin" && (
                        <Badge variant="secondary">Admin</Badge>
                      )}
                    </div>
                    {a.company && (
                      <p className="text-sm text-muted-foreground ml-12">{a.company}</p>
                    )}
                    <p className="text-xs text-muted-foreground ml-12">
                      Joined {format(new Date(a.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex gap-6 text-center">
                    <div>
                      <div className="flex items-center gap-1 justify-center text-muted-foreground mb-1">
                        <Target className="h-3.5 w-3.5" />
                        <span className="text-xs">Goals</span>
                      </div>
                      <p className="text-xl font-bold">{(a as any).goalCount ?? 0}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 justify-center text-muted-foreground mb-1">
                        <ClipboardList className="h-3.5 w-3.5" />
                        <span className="text-xs">Surveys</span>
                      </div>
                      <p className="text-xl font-bold">{(a as any).surveyResponseCount ?? 0}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
