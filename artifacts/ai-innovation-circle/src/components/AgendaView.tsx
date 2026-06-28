import { useGetMeetingAgenda } from "@workspace/api-client-react";
import { Clock, User } from "lucide-react";

export function AgendaView({ meetingId }: { meetingId: number }) {
  const { data: agenda = [], isLoading } = useGetMeetingAgenda(meetingId);

  if (isLoading) {
    return <div className="h-16 bg-muted animate-pulse rounded-md" />;
  }

  if (agenda.length === 0) {
    return <p className="text-sm text-muted-foreground">No agenda has been published yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {agenda.map((item) => (
        <li key={item.id} className="flex gap-3">
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
  );
}
