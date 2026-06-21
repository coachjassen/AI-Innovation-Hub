import { useState } from "react";
import { 
  useListGoals, 
  getListGoalsQueryKey,
  useCreateGoal, 
  useUpdateGoal, 
  useDeleteGoal, 
  useGetGoalsSummary 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Plus, Target, CheckCircle2, Circle, Clock, MoreHorizontal, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { GoalDueBadge, getDueState } from "@/components/GoalDueBadge";

type GoalItem = {
  id: number;
  timeframe: string;
  status: string;
  comments?: string | null;
  dueDate?: string | null;
  createdAt: string;
};

export default function AttendeeGoals() {
  const [showCompleted, setShowCompleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalItem | null>(null);
  
  const queryClient = useQueryClient();
  
  const { data: goals = [], isLoading } = useListGoals({
    query: {
      queryKey: getListGoalsQueryKey(),
    }
  });

  const { data: summary } = useGetGoalsSummary({
    query: {
      queryKey: ["/api/goals/summary"]
    }
  });

  const filteredGoals = goals.filter(goal => {
    if (!showCompleted && goal.status === "Completed") return false;
    if (statusFilter !== "all" && goal.status !== statusFilter) return false;
    return true;
  });

  const overdueCount = goals.filter(
    (g) => getDueState(g.dueDate, g.status).state === "overdue",
  ).length;

  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/goals/summary"] });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const due = formData.get("dueDate") as string;
    createGoal.mutate({
      data: {
        timeframe: formData.get("timeframe") as string,
        status: formData.get("status") as string,
        comments: formData.get("comments") as string,
        dueDate: due ? due : null,
      }
    }, {
      onSuccess: () => {
        invalidate();
        setIsCreateOpen(false);
      }
    });
  };

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
      }
    }, {
      onSuccess: () => {
        invalidate();
        setEditGoal(null);
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      deleteGoal.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/goals/summary"] });
        }
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'In Progress': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'Not Started': return <Circle className="h-4 w-4 text-gray-300" />;
      case 'New': return <Target className="h-4 w-4 text-purple-500" />;
      default: return <Circle className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Goals</h1>
          <p className="text-muted-foreground mt-2">Track your progress and alignment with your circle.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Goal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Goal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe / Objective</Label>
                <Input id="timeframe" name="timeframe" required placeholder="e.g. Q3: Launch new AI product" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue="New">
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
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comments">Comments</Label>
                <Textarea id="comments" name="comments" placeholder="Optional notes..." />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createGoal.isPending}>Save Goal</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{summary?.byStatus.inProgress || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.byStatus.completed || 0}</div>
          </CardContent>
        </Card>
        <Card className={overdueCount > 0 ? "border-red-200" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              {overdueCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-600" : ""}`}>{overdueCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between bg-white p-4 rounded-lg border">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
            <Label htmlFor="show-completed">Show Completed</Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Filter by Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
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
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-gray-50/50">
          <Target className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No goals found</h3>
          <p className="text-gray-500 mt-1">Create a new goal to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGoals.map((goal) => (
            <Card key={goal.id} className="group">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(goal.status)}
                      <h3 className="font-semibold text-lg">{goal.timeframe}</h3>
                    </div>
                    {goal.comments && (
                      <p className="text-muted-foreground ml-7">{goal.comments}</p>
                    )}
                    <div className="ml-7 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <GoalDueBadge dueDate={goal.dueDate} status={goal.status} />
                      <span>Created {format(new Date(goal.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select 
                      value={goal.status} 
                      onValueChange={(val) => {
                        updateGoal.mutate({ id: goal.id, data: { status: val } }, {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
                            queryClient.invalidateQueries({ queryKey: ["/api/goals/summary"] });
                          }
                        });
                      }}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
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
                        <DropdownMenuItem onClick={() => setEditGoal(goal)}>
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
      )}

      <Dialog open={!!editGoal} onOpenChange={(open) => !open && setEditGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Goal</DialogTitle>
          </DialogHeader>
          {editGoal && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-timeframe">Timeframe / Objective</Label>
                <Input id="edit-timeframe" name="timeframe" required defaultValue={editGoal.timeframe} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
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
                <Label htmlFor="edit-dueDate">Due Date</Label>
                <Input
                  id="edit-dueDate"
                  name="dueDate"
                  type="date"
                  defaultValue={editGoal.dueDate ? editGoal.dueDate.slice(0, 10) : ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-comments">Comments</Label>
                <Textarea id="edit-comments" name="comments" defaultValue={editGoal.comments ?? ""} placeholder="Optional notes..." />
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