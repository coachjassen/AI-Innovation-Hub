import { useState } from "react";
import {
  useListAttendees,
  useCreateAttendee,
  getListAttendeesQueryKey,
  getListCirclesQueryKey,
} from "@workspace/api-client-react";
import { useActiveCircle } from "@/contexts/CircleContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Users, Target, ClipboardList, Plus } from "lucide-react";

export default function AdminAttendees() {
  const queryClient = useQueryClient();
  const { activeCircleId, activeCircle } = useActiveCircle();
  const params = activeCircleId !== null ? { circleId: activeCircleId } : undefined;
  const { data: attendees = [], isLoading } = useListAttendees(params, {
    query: { enabled: activeCircleId !== null, queryKey: getListAttendeesQueryKey(params) },
  });
  const createAttendee = useCreateAttendee();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeCircleId === null) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const company = (formData.get("company") as string).trim();
    setCreateError(null);

    createAttendee.mutate(
      {
        data: {
          name: (formData.get("name") as string).trim(),
          email: (formData.get("email") as string).trim(),
          company: company || undefined,
          circleId: activeCircleId,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey(params) });
          queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() });
          form.reset();
          setIsAddOpen(false);
        },
        onError: (error) => setCreateError(error.message || "Unable to add attendee."),
      },
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendees</h1>
          <p className="text-muted-foreground mt-2">
            {attendees.length} member{attendees.length !== 1 ? "s" : ""} in the hub.
          </p>
        </div>
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open);
            if (!open) setCreateError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={activeCircleId === null}>
              <Plus className="mr-2 h-4 w-4" />
              Add Attendee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Attendee</DialogTitle>
              <DialogDescription>
                {activeCircle
                  ? `This attendee will be added to ${activeCircle.name}.`
                  : "Select a Hub before adding an attendee."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="attendee-name">Name</Label>
                <Input id="attendee-name" name="name" required autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendee-email">Email</Label>
                <Input id="attendee-email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendee-company">Company <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="attendee-company" name="company" autoComplete="organization" />
              </div>
              {createError && (
                <p role="alert" className="text-sm text-destructive">{createError}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAttendee.isPending}>
                  {createAttendee.isPending ? "Adding..." : "Add Attendee"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
