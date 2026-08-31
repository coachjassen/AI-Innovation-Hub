import { useState } from "react";
import {
  useListCircles,
  useCreateCircle,
  useUpdateCircle,
  useGetHubRegistrationLink,
  useCreateHubRegistrationLink,
  getGetHubRegistrationLinkQueryKey,
  getListCirclesQueryKey,
  type CircleInputCadence,
  type CircleUpdateCadence,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CircleDot, Plus, MoreHorizontal, Pencil, Users, Power, PowerOff, Sparkles, Link2, AlertTriangle, RefreshCw, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Circle = {
  id: number;
  name: string;
  cadence: string;
  status: string;
  memberCount?: number;
  registrationDescription?: string | null;
  registrationOpen?: boolean;
  hasRegistrationLink?: boolean;
};

const CADENCES = ["monthly", "quarterly", "one-off"] as const;

const cadenceLabel = (cadence: string) =>
  cadence === "one-off" ? "One-off event" : cadence.charAt(0).toUpperCase() + cadence.slice(1);

export default function AdminCircles() {
  const queryClient = useQueryClient();
  const { data: circles = [], isLoading } = useListCircles();
  const createCircle = useCreateCircle();
  const updateCircle = useUpdateCircle();
  const createRegistrationLink = useCreateHubRegistrationLink();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Circle | null>(null);
  const registrationLinkHubId = editing && editing.cadence !== "one-off" ? editing.id : 0;
  const {
    data: registrationLink,
    isLoading: isRegistrationLinkLoading,
    isError: isRegistrationLinkError,
  } = useGetHubRegistrationLink(registrationLinkHubId, {
    query: {
      enabled: registrationLinkHubId > 0,
      queryKey: getGetHubRegistrationLinkQueryKey(registrationLinkHubId),
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createCircle.mutate(
      {
        data: {
          name: (fd.get("name") as string).trim(),
          cadence: fd.get("cadence") as CircleInputCadence,
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
          cadence: fd.get("cadence") as CircleUpdateCadence,
          status: fd.get("status") as string,
          ...(editing.cadence !== "one-off" ? {
            registrationOpen: fd.get("registrationOpen") === "on",
            registrationDescription: fd.get("registrationDescription") as string,
          } : {})
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

  const handleGenerateLink = () => {
    if (!editing) return;
    const isRotation = Boolean(editing.hasRegistrationLink);
    createRegistrationLink.mutate({ id: editing.id }, {
      onSuccess: (data) => {
        queryClient.setQueryData(
          getGetHubRegistrationLinkQueryKey(editing.id),
          { url: data.url, needsRotation: false },
        );
        toast({
          title: isRotation ? "Registration link rotated" : "Registration link generated",
          description: isRotation
            ? "The previous public URL is no longer valid."
            : "The link is saved and ready to copy.",
        });
        invalidate();
        setEditing({ ...editing, hasRegistrationLink: true });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not generate link.",
        });
      }
    });
  };

  const handleCopyLink = async () => {
    if (!registrationLink?.url) return;
    try {
      await navigator.clipboard.writeText(registrationLink.url);
      toast({
        title: "Link copied",
        description: "Registration link has been copied to clipboard.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not copy automatically",
        description: "Select the registration link and copy it manually.",
      });
    }
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
          <h1 className="text-3xl font-bold tracking-tight">Hubs</h1>
          <p className="text-muted-foreground mt-2">
            Each hub is a self-contained forum group with its own members, meetings, and goals.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-hub-trigger"><Plus className="mr-2 h-4 w-4" /> New Hub</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Hub</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input name="name" id="name" required placeholder="e.g. FinTech Founders Hub" data-testid="create-hub-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cadence">Hub type</Label>
                <select name="cadence" id="cadence" defaultValue="quarterly" className="w-full border rounded-md px-3 py-2 text-sm capitalize" data-testid="create-hub-cadence">
                  {CADENCES.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">
                  Choose <span className="font-medium text-foreground">One-off event</span> for a dedicated event Hub. Its events use invitation files and public RSVP links instead of meeting agendas.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select name="status" id="status" defaultValue="active" className="w-full border rounded-md px-3 py-2 text-sm capitalize" data-testid="create-hub-status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createCircle.isPending} data-testid="create-hub-submit">Create</Button>
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
          <p className="text-gray-500">No hubs yet. Create your first one to get started.</p>
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
                      {c.cadence === "one-off" && (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                          <Sparkles className="h-3 w-3" /> One-off event Hub
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{cadenceLabel(c.cadence)}</span>
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
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Hub</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-6">
              <form id="edit-hub-form" onSubmit={handleEdit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input name="name" id="edit-name" required defaultValue={editing.name} data-testid="edit-hub-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cadence">Cadence</Label>
                  <select name="cadence" id="edit-cadence" defaultValue={editing.cadence} className="w-full border rounded-md px-3 py-2 text-sm capitalize" data-testid="edit-hub-cadence">
                    {CADENCES.map((c) => <option key={c} value={c}>{cadenceLabel(c)}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <select name="status" id="edit-status" defaultValue={editing.status} className="w-full border rounded-md px-3 py-2 text-sm capitalize" data-testid="edit-hub-status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {editing.cadence !== "one-off" && (
                  <div className="pt-4 border-t space-y-4">
                    <h3 className="font-semibold text-lg">Public Registration</h3>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Accept Registrations</Label>
                        <p className="text-sm text-muted-foreground">Allow public users to register interest.</p>
                      </div>
                      <Switch
                        name="registrationOpen"
                        defaultChecked={editing.registrationOpen}
                        data-testid="edit-hub-registration-open"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="registrationDescription">Public Description</Label>
                      <Textarea
                        name="registrationDescription"
                        id="registrationDescription"
                        defaultValue={editing.registrationDescription || ""}
                        placeholder="Describe the hub for public registrants..."
                        className="resize-none"
                        data-testid="edit-hub-registration-desc"
                      />
                    </div>
                  </div>
                )}
              </form>

              {editing.cadence !== "one-off" && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">Registration Link</h4>
                    <p className="text-sm text-muted-foreground">
                      Share this saved link to invite users to register interest.
                    </p>
                  </div>

                  {isRegistrationLinkLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="registration-link-loading">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading registration link...
                    </div>
                  ) : isRegistrationLinkError ? (
                    <p className="text-sm text-destructive" role="alert">
                      Could not load the saved registration link. Close this window and try again.
                    </p>
                  ) : registrationLink?.url ? (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          readOnly
                          value={registrationLink.url}
                          aria-label="Saved registration link"
                          data-testid="edit-hub-registration-link"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCopyLink}
                          data-testid="edit-hub-copy-link"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-muted-foreground"
                            disabled={createRegistrationLink.isPending}
                            data-testid="edit-hub-rotate-link"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Rotate link
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rotate registration link?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The current public URL will stop working immediately. Anyone using the old link will need the replacement URL.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleGenerateLink}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid="edit-hub-confirm-rotate-link"
                            >
                              Rotate link
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : registrationLink?.needsRotation ? (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        This link was created before saved links were supported. Generate a replacement once to save and display it here.
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No public registration link has been generated yet.</p>
                  )}

                  {!registrationLink?.url && !isRegistrationLinkLoading && !isRegistrationLinkError && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateLink}
                      disabled={createRegistrationLink.isPending}
                      data-testid="edit-hub-generate-link"
                    >
                      {createRegistrationLink.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="mr-2 h-4 w-4" />
                      )}
                      {registrationLink?.needsRotation ? "Generate & save replacement" : "Generate link"}
                    </Button>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button type="submit" form="edit-hub-form" disabled={updateCircle.isPending} data-testid="edit-hub-submit">Save</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
