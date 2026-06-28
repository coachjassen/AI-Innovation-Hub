import { useEffect, useState } from "react";
import {
  useGetMeetingAgenda,
  useSetMeetingAgenda,
  getGetMeetingAgendaQueryKey,
  getListMeetingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Clock, User } from "lucide-react";

type DraftItem = {
  title: string;
  durationMinutes: string;
  presenter: string;
  description: string;
};

const emptyItem = (): DraftItem => ({ title: "", durationMinutes: "", presenter: "", description: "" });

export function AgendaEditor({ meetingId }: { meetingId: number }) {
  const queryClient = useQueryClient();
  const { data: agenda, isLoading, isSuccess } = useGetMeetingAgenda(meetingId);
  const setAgenda = useSetMeetingAgenda();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isSuccess || hydrated || !agenda) return;
    setItems(
      agenda.map((a) => ({
        title: a.title,
        durationMinutes: a.durationMinutes != null ? String(a.durationMinutes) : "",
        presenter: a.presenter ?? "",
        description: a.description ?? "",
      })),
    );
    setHydrated(true);
  }, [isSuccess, agenda, hydrated]);

  const update = (idx: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const remove = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const add = () => setItems((prev) => [...prev, emptyItem()]);

  const save = () => {
    const payload = items
      .filter((it) => it.title.trim() !== "")
      .map((it) => {
        const dur = parseInt(it.durationMinutes, 10);
        return {
          title: it.title.trim(),
          durationMinutes: !isNaN(dur) && dur > 0 ? dur : null,
          presenter: it.presenter.trim() || null,
          description: it.description.trim() || null,
        };
      });

    setAgenda.mutate(
      { id: meetingId, data: { items: payload } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeetingAgendaQueryKey(meetingId) });
          queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="h-24 bg-muted animate-pulse rounded-md" />;
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No agenda items yet. Add the first topic below.</p>
      )}

      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-md border bg-background p-3 space-y-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-xs font-semibold text-muted-foreground w-5 text-center">{idx + 1}</span>
              <div className="flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={it.title}
                    onChange={(e) => update(idx, { title: e.target.value })}
                    placeholder="Agenda item title"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Minutes</Label>
                    <Input
                      type="number"
                      min={0}
                      value={it.durationMinutes}
                      onChange={(e) => update(idx, { durationMinutes: e.target.value })}
                      placeholder="e.g. 15"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Presenter</Label>
                    <Input
                      value={it.presenter}
                      onChange={(e) => update(idx, { presenter: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    rows={2}
                    value={it.description}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    placeholder="Optional short description"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" /> Add item
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={setAgenda.isPending}>
          <Save className="mr-1.5 h-4 w-4" /> {setAgenda.isPending ? "Saving..." : "Save agenda"}
        </Button>
      </div>
    </div>
  );
}
