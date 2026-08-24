import { useGetAdminDashboard, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, Target, UserPlus, TrendingUp, Activity } from "lucide-react";
import { format } from "date-fns";
import { useActiveCircle } from "@/contexts/CircleContext";

export default function AdminDashboard() {
  const { activeCircleId, circles } = useActiveCircle();
  const activeCircle = circles.find((c) => c.id === activeCircleId);
  const params = activeCircleId !== null ? { circleId: activeCircleId } : undefined;
  const { data, isLoading } = useGetAdminDashboard(params, {
    query: { enabled: activeCircleId !== null, queryKey: getGetAdminDashboardQueryKey(params) },
  });

  if (isLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Total Attendees", value: data?.totalAttendees ?? 0, icon: Users, color: "text-blue-600" },
    { label: "Meetings Held", value: data?.totalMeetings ?? 0, icon: Calendar, color: "text-purple-600" },
    { label: "Total Goals", value: data?.totalGoals ?? 0, icon: Target, color: "text-orange-600" },
    { label: "Pending Invites", value: data?.pendingInvites ?? 0, icon: UserPlus, color: "text-amber-600" },
  ];

  const goalsByStatus = data?.goalsByStatus;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gradient w-fit">
          {activeCircle ? `AI Innovation Circles — ${activeCircle.name}` : "AI Innovation Circles"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {activeCircle
            ? "Dashboard overview for this Innovation Hub."
            : "Select a hub to see its overview."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="card-accent hover-lift shadow-brand overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </span>
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {goalsByStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Goal Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{goalsByStatus.new}</div>
                <div className="text-sm text-muted-foreground mt-1">New</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-400">{goalsByStatus.notStarted}</div>
                <div className="text-sm text-muted-foreground mt-1">Not Started</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{goalsByStatus.inProgress}</div>
                <div className="text-sm text-muted-foreground mt-1">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{goalsByStatus.completed}</div>
                <div className="text-sm text-muted-foreground mt-1">Completed</div>
              </div>
            </div>
            {data && data.totalGoals > 0 && (
              <div className="mt-6">
                <div className="flex rounded-full overflow-hidden h-3 bg-gray-100">
                  <div
                    className="bg-purple-500 transition-all"
                    style={{ width: `${((goalsByStatus.new ?? 0) / data.totalGoals) * 100}%` }}
                  />
                  <div
                    className="bg-gray-300 transition-all"
                    style={{ width: `${((goalsByStatus.notStarted ?? 0) / data.totalGoals) * 100}%` }}
                  />
                  <div
                    className="bg-blue-500 transition-all"
                    style={{ width: `${((goalsByStatus.inProgress ?? 0) / data.totalGoals) * 100}%` }}
                  />
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${((goalsByStatus.completed ?? 0) / data.totalGoals) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />New</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Not Started</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />In Progress</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Completed</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.recentActivity?.length ? (
            <p className="text-muted-foreground text-sm">No recent activity.</p>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.description}</p>
                    {item.attendeeName && (
                      <p className="text-xs text-muted-foreground">{item.attendeeName}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {format(new Date(item.createdAt), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
