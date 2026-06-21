import { useState } from "react";
import {
  useListGoals,
  getListGoalsQueryKey,
  useUpdateGoal,
  useDeleteGoal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Target, CheckCircle2, Circle, Clock, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { GoalDueBadge } from "@/components/GoalDueBadge";

type GoalItem = {
  id: number;
  timeframe: string;
  status: string;
  comments?: string | null;
  dueDate?: string | null;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  "Completed": "bg-green-100 text-green-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "New": "bg-purple-100 text-purple-800",
  "Not Started": "bg-gray-100 text-gray-600",
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "In Progress": return <Clock className="h-4 w-4 text-blue-500" />;
    case "New": return <Target className="h-4 w-4 text-purple-500" />;
    default: return <Circle className="h-4 w-4 text-gray-300" />;
  }
};

export default function AdminGoals() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [editGoal, setEditGoal] = useState<GoalItem | null>(null);
  const queryClient = useQueryClient();

  const { data: goals = [], isLoading } = useListGoals({ query: { queryKey: getListGoalsQueryKey() } });
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editGoal) return;
    const formData = new FormData(e.currentTarget);
    const due = formData.get("dueDate") as string;
    updateGoal.mutate({
      id: editGoal.id,
      data: {
        timeframe: formData.get("timeframe") as string,
        status: formData.get("status") as string,
        comments: formData.get("comments") as string,
        dueDate: due ? due : null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
        setEditGoal(null);
      },
    });
  };

  const filtered = statusFilter === "all"
    ? goals
    : goals.filter((g) => g.status === statusFilter);

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, g) => {
    const key = (g as any).attendeeName ?? "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});

  const handleDelete = (id: number) => {
    if (!confirm("Delete this goal?")) return;
    deleteGoal.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() }),
    });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Goals</h1>
          <p className="text-muted-foreground mt-2">View and manage goals across all attendees.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Not Started">Not Started</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <Target className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No goals match the current filter.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([attendeeName, goals]) => (
            <div key={attendeeName}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-semibold">{attendeeName}</h2>
                {goals[0] && (goals[0] as any).attendeeCompany && (
                  <span className="text-sm text-muted-foreground">{(goals[0] as any).attendeeCompany}</span>
                )}
                <Badge variant="outline" className="ml-auto">{goals.length} goal{goals.length !== 1 ? "s" : ""}</Badge>
              </div>
              <div className="space-y-3">
                {goals.map((goal) => (
                  <Card key={goal.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(goal.status)}
                            <span className="font-medium">{goal.timeframe}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[goal.status] ?? "bg-gray-100"}`}>
                              {goal.status}
                            </span>
                          </div>
                          {goal.comments && (
                            <p className="text-sm text-muted-foreground ml-6">{goal.comments}</p>
                          )}
                          <div className="ml-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <GoalDueBadge dueDate={goal.dueDate} status={goal.status} />
                            <span>Updated {format(new Date(goal.updatedAt), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Select
                            value={goal.status}
                            onValueChange={(val) =>
                              updateGoal.mutate({ id: goal.id, data: { status: val } }, {
                                onSuccess: () => queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() }),
                              })
                            }
                          >
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="New">New</SelectItem>
                              <SelectItem value="Not Started">Not Started</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditGoal(goal as GoalItem)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(goal.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editGoal} onOpenChange={(open) => !open && setEditGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
          </DialogHeader>
          {editGoal && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-edit-timeframe">Timeframe / Objective</Label>
                <Input id="admin-edit-timeframe" name="timeframe" required defaultValue={editGoal.timeframe} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-edit-status">Status</Label>
                <Select name="status" defaultValue={editGoal.status}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-edit-dueDate">Due Date</Label>
                <Input
                  id="admin-edit-dueDate"
                  name="dueDate"
                  type="date"
                  defaultValue={editGoal.dueDate ? editGoal.dueDate.slice(0, 10) : ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-edit-comments">Comments</Label>
                <Textarea id="admin-edit-comments" name="comments" defaultValue={editGoal.comments ?? ""} placeholder="Optional notes..." />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateGoal.isPending}>Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
