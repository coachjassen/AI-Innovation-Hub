import {
  getGetMeetingRsvpQueryKey,
  useGetMeetingRsvp,
  useSetMeetingRsvp,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { KineticsLogo } from "@/components/KineticsLogo";

export default function MeetingRsvpPage({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: rsvp, isLoading, isError, error } = useGetMeetingRsvp(token, {
    query: {
      enabled: !!token,
      queryKey: getGetMeetingRsvpQueryKey(token),
    },
  });
  const setRsvp = useSetMeetingRsvp();
  const invitationErrorMessage = error?.message ?? "";
  const isTemporaryServiceError = /(?:HTTP\s*)?5\d{2}|bad gateway|<html/i.test(invitationErrorMessage);

  if (isLoading) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden brand-gradient brand-glow p-4 sm:p-8">
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[hsl(var(--brand-lime)/0.12)] blur-3xl" />
        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col items-center justify-center gap-6 sm:min-h-[calc(100dvh-4rem)]">
          <div className="rounded-xl bg-white px-4 py-2.5 shadow-lg">
            <KineticsLogo className="h-8 w-auto" />
          </div>
          <Card className="w-full overflow-hidden border-white/20 shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-[hsl(var(--brand-forest))] to-[hsl(var(--brand-lime))]" />
            <CardContent className="flex flex-col items-center gap-4 py-14">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="space-y-1 text-center">
                <p className="font-semibold text-foreground">Loading your invitation</p>
                <p className="text-sm text-muted-foreground">Just a moment...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isError || !rsvp) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden brand-gradient brand-glow p-4 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[hsl(var(--brand-lime)/0.14)] blur-3xl" />
        <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col items-center justify-center gap-6 sm:min-h-[calc(100dvh-4rem)]">
          <div className="rounded-xl bg-white px-4 py-2.5 shadow-lg">
            <KineticsLogo className="h-8 w-auto" />
          </div>
          <Card className="w-full overflow-hidden border-white/20 text-center shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-[hsl(var(--brand-forest))] to-[hsl(var(--brand-lime))]" />
            <CardContent className="space-y-5 px-6 py-12 sm:px-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <LockKeyhole className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl">
                  {isTemporaryServiceError ? "Invitation temporarily unavailable" : "Invitation unavailable"}
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  {isTemporaryServiceError
                    ? "We couldn’t load this invitation right now. Please try again shortly."
                    : "This invitation link is invalid or no longer available."}
                </CardDescription>
              </div>
              {isTemporaryServiceError && (
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                  Try again
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleResponse = (status: "attending" | "not_attending") => {
    setRsvp.mutate(
      { token, data: { status } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetMeetingRsvpQueryKey(token), updated);
          toast({ title: "RSVP received", description: "Your response has been saved in the Hubs app." });
        },
        onError: (mutationError) => {
          toast({
            title: "Unable to save RSVP",
            description: mutationError.message || "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden brand-gradient brand-glow p-4 sm:p-8">
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-[hsl(var(--brand-lime)/0.12)] blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-[hsl(var(--brand-forest)/0.35)] blur-3xl" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col items-center justify-center gap-5 sm:min-h-[calc(100dvh-4rem)]">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white px-4 py-2.5 shadow-lg">
            <KineticsLogo className="h-8 w-auto" />
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-semibold text-white">Innovation Hubs</p>
            <p className="text-xs text-[hsl(var(--brand-lime))]">Kinetics Group</p>
          </div>
        </div>

        <Card className="w-full overflow-hidden border-white/20 shadow-2xl">
          <div className="h-1.5 bg-gradient-to-r from-[hsl(var(--brand-forest))] via-[hsl(var(--brand-lime))] to-[hsl(var(--brand-forest))]" />
          <CardHeader className="space-y-6 px-6 pb-5 pt-8 sm:px-10 sm:pt-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" />
              Meeting invitation
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-tight text-foreground sm:text-4xl">
                {rsvp.circleName}
              </CardTitle>
              <CardDescription className="text-base leading-6">
                Hi {rsvp.attendeeName}, we’d love to have you there. Please let us know if you can attend.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-accent/50 p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-foreground">
                    {format(new Date(rsvp.date), "EEEE, MMMM do, yyyy")}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {format(new Date(rsvp.date), "h:mm a")}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-6 pb-8 sm:px-10 sm:pb-10">
          {rsvp.status !== "no_response" && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  rsvp.status === "attending" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                }`}>
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Your response: {rsvp.status === "attending" ? "Attending" : "Not attending"}
                  </p>
                  <p className="text-xs text-muted-foreground">You can change your response below.</p>
                </div>
              </div>
          )}

            <div className="space-y-3 border-t pt-6">
              <p className="text-sm font-semibold text-foreground">Will you be joining us?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  variant={rsvp.status === "attending" ? "default" : "outline"}
                  className={`h-12 ${
                    rsvp.status === "attending"
                      ? "bg-green-700 text-white hover:bg-green-800"
                      : "border-primary/25 hover:border-primary hover:bg-accent"
                  }`}
                  onClick={() => handleResponse("attending")}
                  disabled={setRsvp.isPending}
                >
                  <Check className="mr-2 h-5 w-5" />
                  I’ll be there
                </Button>
                <Button
                  size="lg"
                  variant={rsvp.status === "not_attending" ? "secondary" : "outline"}
                  className={`h-12 ${
                    rsvp.status === "not_attending"
                      ? "bg-slate-800 text-white hover:bg-slate-900"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                  onClick={() => handleResponse("not_attending")}
                  disabled={setRsvp.isPending}
                >
                  <X className="mr-2 h-5 w-5" />
                  Can’t make it
                </Button>
              </div>
              {setRsvp.isPending && (
                <p className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving your response...
                </p>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5" />
              Your response is saved securely in the Hubs app.
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-white/60">Powered by Kinetics Group Innovation Hubs</p>
      </div>
    </div>
  );
}