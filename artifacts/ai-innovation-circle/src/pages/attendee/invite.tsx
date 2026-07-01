import { useState } from "react";
import { useListInvites, useCreateInvite } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Clock, CheckCircle2, XCircle } from "lucide-react";

const statusIcon = (status: string) => {
  if (status === "accepted") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "declined") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Clock className="h-3.5 w-3.5 text-amber-500" />;
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "accepted") return "default";
  if (status === "declined") return "destructive";
  return "secondary";
};

export default function AttendeeInvite() {
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();

  const { data: invites = [], isLoading } = useListInvites();
  const createInvite = useCreateInvite();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    createInvite.mutate(
      { data: { email: email.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
          setEmail("");
        },
      }
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invite a Colleague</h1>
        <p className="text-muted-foreground mt-2">
          Recommend someone to join your hub.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Send an Invitation
          </CardTitle>
          <CardDescription>
            Enter their email address and we'll let the admin know.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="email" className="sr-only">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={createInvite.isPending}>
              {createInvite.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Invitations</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">You haven't sent any invitations yet.</p>
        ) : (
          <div className="space-y-3">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-white"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Sent {format(new Date(inv.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                <Badge variant={statusVariant(inv.status ?? "pending")} className="flex items-center gap-1.5">
                  {statusIcon(inv.status ?? "pending")}
                  <span className="capitalize">{inv.status ?? "pending"}</span>
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
