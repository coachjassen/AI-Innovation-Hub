import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type DueState = "none" | "completed" | "overdue" | "soon" | "upcoming";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Parse a date-only string ("YYYY-MM-DD", possibly with a time suffix) as a
// LOCAL calendar date, avoiding the UTC-midnight shift of `new Date(string)`.
function parseLocalDate(dueDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function getDueState(dueDate: string | null | undefined, status: string): {
  state: DueState;
  days: number | null;
  date: Date | null;
} {
  if (!dueDate) return { state: "none", days: null, date: null };
  const date = parseLocalDate(dueDate);
  if (!date) return { state: "none", days: null, date: null };
  if (status === "Completed") return { state: "completed", days: null, date };

  const today = startOfDay(new Date());
  const due = startOfDay(date);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { state: "overdue", days, date };
  if (days <= 7) return { state: "soon", days, date };
  return { state: "upcoming", days, date };
}

export function GoalDueBadge({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null | undefined;
  status: string;
  className?: string;
}) {
  const { state, days, date } = getDueState(dueDate, status);
  if (state === "none" || !date) return null;

  const dateLabel = format(date, "MMM d, yyyy");

  const config: Record<
    Exclude<DueState, "none">,
    { label: string; classes: string; icon: typeof CalendarDays }
  > = {
    overdue: {
      label: days === -1 ? "Overdue by 1 day" : `Overdue by ${Math.abs(days ?? 0)} days`,
      classes: "bg-red-100 text-red-700 border-red-200",
      icon: AlertTriangle,
    },
    soon: {
      label: days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`,
      classes: "bg-amber-100 text-amber-800 border-amber-200",
      icon: CalendarClock,
    },
    upcoming: {
      label: `Due ${dateLabel}`,
      classes: "bg-muted text-muted-foreground border-transparent",
      icon: CalendarDays,
    },
    completed: {
      label: `Done · was due ${dateLabel}`,
      classes: "bg-green-100 text-green-700 border-green-200",
      icon: CheckCircle2,
    },
  };

  const { label, classes, icon: Icon } = config[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        classes,
        className,
      )}
      title={`Due ${dateLabel}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
