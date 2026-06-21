import { useState } from "react";
import {
  useListCircles,
  useCreateCircle,
  useUpdateCircle,
  getListCirclesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CircleDot, Plus, MoreHorizontal, Pencil, Users, Power, PowerOff } from "lucide-react";

type Circle = {
  id: number;
  name: string;
  cadence: string;
  status: string;
  memberCount?: number;
};

const CADENCES = ["monthly", "quarterly"];

export default function AdminCircles() {
  const queryClient = useQueryClient();
  const { data: circles = [], isLoading } = useListCircles();
  const createCircle = useCreateCircle();
  const updateCircle = useUpdateCircle();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Circle | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createCircle.mutate(
      {
        data: {
          name: (fd.get("name") as string).trim(),
          cadence: fd.get("cadence") as string,
          status: fd.get("status") as string,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setIsCreateOpen(false);
        },
      }
    );
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    updateCircle.mutate(
      {
        id: editing.id,
        data: {
          name: (fd.get("name") as string).trim(),
          cadence: fd.get("cadence") as string,
          status: fd.get("status") as string,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setEditing(null);
        },
      }
    );
  };

  const toggleStatus = (c: Circle) => {
    updateCircle.mutate(
      { id: c.id, data: { status: c.status === "active" ? "inactive" : "active" } },
      { onSuccess: invalidate }
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Circles</h1>
          <p className="text-muted-foreground mt-2">
            Each circle is a self-contained forum group with its own members, meetings, and goals.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Circle</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Circle</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input name="name" id="name" required placeholder="e.g. FinTech Founders Circle" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cadence">Cadence</Label>
                <select name="cadence" id="cadence" defaultValue="quarterly" className="w-full border rounded-md px-3 py-2 text-sm capitalize">
                  {CADENCES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select name="status" id="status" defaultValue="active" className="w-full border rounded-md px-3 py-2 text-sm capitalize">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createCircle.isPending}>Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : circles.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <CircleDot className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No circles yet. Create your first one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {circles.map((c) => (
            <Card key={c.id} className={c.status !== "active" ? "opacity-70" : ""}>
              <CardContent className="p-6 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <CircleDot className="h-5 w-5" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg">{c.name}</p>
                      <Badge variant={c.status === "active" ? "default" : "secondary"} className="capitalize">{c.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="capitalize">{c.cadence}</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {c.memberCount ?? 0} member{(c.memberCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(c)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleStatus(c)}>
                      {c.status === "active"
                        ? <><PowerOff className="mr-2 h-4 w-4" /> Deactivate</>
                        : <><Power className="mr-2 h-4 w-4" /> Activate</>}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Circle</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input name="name" id="edit-name" required defaultValue={editing.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cadence">Cadence</Label>
                <select name="cadence" id="edit-cadence" defaultValue={editing.cadence} className="w-full border rounded-md px-3 py-2 text-sm capitalize">
                  {CADENCES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <select name="status" id="edit-status" defaultValue={editing.status} className="w-full border rounded-md px-3 py-2 text-sm capitalize">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateCircle.isPending}>Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
