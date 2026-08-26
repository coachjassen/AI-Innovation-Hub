import { useState, type FormEvent } from "react";
import {
  getListAdminAccountsQueryKey,
  useCreateAdminAccount,
  useListAdminAccounts,
  useListCircles,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Mail,
  Plus,
  ShieldCheck,
  UserCog,
} from "lucide-react";

export default function AdminAccounts() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading, isError } = useListAdminAccounts();
  const { data: circles = [], isLoading: circlesLoading } = useListCircles();
  const createAccount = useCreateAdminAccount();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setCreateError(null);
    setSuccessMessage(null);

    createAccount.mutate(
      {
        data: {
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          company: String(formData.get("company") ?? "").trim() || undefined,
          circleId: Number(formData.get("circleId")),
        },
      },
      {
        onSuccess: (account) => {
          queryClient.invalidateQueries({ queryKey: getListAdminAccountsQueryKey() });
          form.reset();
          setIsCreateOpen(false);
          setSuccessMessage(
            account.onboardingEmailStatus === "sent"
              ? `${account.name} was added. Their secure sign-in email has been sent.`
              : `${account.name} was added, but the onboarding email could not be sent. They can request a link once email is configured.`,
          );
        },
        onError: (error) => {
          setCreateError(error.message || "Unable to create administrator account.");
        },
      },
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserCog className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Administrator accounts</h1>
              <p className="text-muted-foreground mt-1">
                Manage the people who can configure Hubs and support members.
              </p>
            </div>
          </div>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setCreateError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-open-create-admin">
              <Plus className="mr-2 h-4 w-4" /> Add administrator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add administrator</DialogTitle>
              <DialogDescription>
                The new administrator will receive a secure, one-time sign-in email.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Name</Label>
                <Input id="admin-name" name="name" required maxLength={200} autoComplete="name" data-testid="input-admin-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" name="email" type="email" required autoComplete="email" data-testid="input-admin-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-company">
                  Company <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="admin-company" name="company" autoComplete="organization" data-testid="input-admin-company" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-circle">Hub assignment</Label>
                <select
                  id="admin-circle"
                  name="circleId"
                  required
                  disabled={circlesLoading || circles.length === 0}
                  defaultValue=""
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  data-testid="select-admin-circle"
                >
                  <option value="" disabled>Select a Hub</option>
                  {circles.map((circle) => (
                    <option key={circle.id} value={circle.id}>{circle.name}</option>
                  ))}
                </select>
                {circles.length === 0 && !circlesLoading && (
                  <p className="text-sm text-destructive">Create a Hub before adding an administrator.</p>
                )}
              </div>
              {createError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="alert-create-admin-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createAccount.isPending || circlesLoading || circles.length === 0} data-testid="button-submit-create-admin">
                  {createAccount.isPending ? "Creating..." : "Create administrator"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {successMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900" role="status" data-testid="alert-create-admin-success">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <Card className="border-primary/10 bg-primary/[0.03]">
        <CardContent className="flex items-start gap-4 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-semibold">Secure access by email</p>
            <p className="text-sm text-muted-foreground">
              Administrator accounts never expose passwords or sign-in tokens here. Each person activates access through the same expiring email link as Hub members.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current administrators</CardTitle>
          <CardDescription>{accounts.length} administrator{accounts.length === 1 ? "" : "s"} with access to the Hub workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-md bg-muted" />)}</div>
          ) : isError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              Unable to load administrator accounts. Refresh and try again.
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <UserCog className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p>No administrator accounts found.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {accounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/30" data-testid={`card-admin-account-${account.id}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{account.name}</p>
                        <Badge variant="secondary">Administrator</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                      {account.company && <p className="truncate text-xs text-muted-foreground">{account.company}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CircleDot className="h-3.5 w-3.5" />{account.circleName}</span>
                    <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Joined {format(new Date(account.createdAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}