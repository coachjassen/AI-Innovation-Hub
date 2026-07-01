import { useState } from "react";
import { useGetMeetingAgenda } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Clock, User, Pencil, Plus } from "lucide-react";
import { AgendaEditor } from "@/components/AgendaEditor";

/**
 * Admin-facing agenda surface for a single meeting. Shows a neat read-only list
 * of the current agenda items and lets the admin switch into the editor to add
 * or change items — all within the same modal.
 */
export function AgendaManager({ meetingId }: { meetingId: number }) {
  const { data: agenda = [], isLoading } = useGetMeetingAgenda(meetingId);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [startBlank, setStartBlank] = useState(false);

  if (mode === "edit") {
    return (
      <AgendaEditor
        meetingId={meetingId}
        startBlank={startBlank}
        onSaved={() => setMode("view")}
        onCancel={() => setMode("view")}
      />
    );
  }

  if (isLoading) {
    return <div className="h-24 bg-muted animate-pulse rounded-md" />;
  }

  const openEditor = (blank: boolean) => {
    setStartBlank(blank);
    setMode("edit");
  };

  if (agenda.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">No agenda items yet.</p>
        <Button size="sm" onClick={() => openEditor(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add agenda item
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {agenda.map((item) => (
          <li key={item.id} className="flex gap-3 rounded-md border bg-background p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {item.position}
            </span>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium">{item.title}</span>
                {item.durationMinutes != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {item.durationMinutes} min
                  </span>
                )}
                {item.presenter && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" /> {item.presenter}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground">{item.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => openEditor(false)}>
          <Pencil className="mr-1.5 h-4 w-4" /> Edit agenda
        </Button>
      </div>
    </div>
  );
}
