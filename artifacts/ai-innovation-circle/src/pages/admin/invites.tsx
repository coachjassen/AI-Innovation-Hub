import { useListInvites, useUpdateInvite } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, XCircle, Clock } from "lucide-react";

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "accepted") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
};

export default function AdminInvites() {
  const queryClient = useQueryClient();
  const { data: invites = [], isLoading } = useListInvites();
  const updateInvite = useUpdateInvite();

  const pending = invites.filter((i) => i.status === "pending");
  const resolved = invites.filter((i) => i.status !== "pending");

  const setStatus = (id: number, status: string) => {
    updateInvite.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/invites"] }),
    });
  };

  const InviteRow = ({ inv }: { inv: (typeof invites)[0] }) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-medium">{inv.email}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {(inv as any).invitedByName && <span>Invited by {(inv as any).invitedByName}</span>}
              {(inv as any).circleName && <><span>·</span><span>{(inv as any).circleName}</span></>}
              <span>·</span>
              <span>{format(new Date(inv.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inv.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => setStatus(inv.id, "accepted")}
                  disabled={updateInvite.isPending}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setStatus(inv.id, "declined")}
                  disabled={updateInvite.isPending}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" /> Decline
                </Button>
              </>
            ) : (
              <Badge variant={statusVariant(inv.status ?? "pending")} className="capitalize">
                {inv.status}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        <p className="text-muted-foreground mt-2">Review and manage member invitations.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2].map(i=><div key={i} className="h-20 bg-muted animate-pulse rounded-lg"/>)}</div>
      ) : invites.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <UserPlus className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No invitations yet.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending ({pending.length})
              </h2>
              {pending.map((inv) => <InviteRow key={inv.id} inv={inv} />)}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground">Resolved</h2>
              {resolved.map((inv) => <InviteRow key={inv.id} inv={inv} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
