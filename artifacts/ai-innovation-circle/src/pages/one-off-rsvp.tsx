import { useGetOneOffRsvp, useSetOneOffRsvp, getGetOneOffRsvpQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function OneOffRsvpPage({ token }: { token: string }) {
  const { data: rsvp, isLoading, isError, error } = useGetOneOffRsvp(token, {
    query: {
      enabled: !!token,
      queryKey: getGetOneOffRsvpQueryKey(token),
    }
  });
  
  const setRsvp = useSetOneOffRsvp();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !rsvp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invitation Unavailable</CardTitle>
            <CardDescription>
              {error?.message || "This invitation link may be invalid or has expired."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleResponse = (status: "attending" | "not_attending") => {
    setRsvp.mutate({ token, data: { status } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetOneOffRsvpQueryKey(token), updated);
        toast({ title: "RSVP Received", description: "Thank you for responding." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to submit RSVP", variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
      <Card className="max-w-xl w-full shadow-lg border-t-4 border-t-primary">
        <CardHeader className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{rsvp.circleName}</h1>
            <CardDescription className="text-base">You are invited to an upcoming event.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-slate-600 font-medium bg-slate-100 p-3 rounded-md border border-slate-200">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {format(new Date(rsvp.date), "EEEE, MMMM do, yyyy")}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {rsvp.invitationBody && (
            <div className="text-slate-700 whitespace-pre-wrap leading-relaxed text-[15px]">
              {rsvp.invitationBody}
            </div>
          )}

          {rsvp.status !== "no_response" && (
            <div className="rounded-md border p-4 bg-slate-50 flex items-center gap-3">
              <CheckCircle2 className={`h-5 w-5 ${rsvp.status === 'attending' ? 'text-green-600' : 'text-slate-400'}`} />
              <div>
                <p className="font-medium text-sm">
                  Your response: {rsvp.status === 'attending' ? 'Attending' : 'Not Attending'}
                </p>
                <p className="text-xs text-muted-foreground">You can change your response below.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t">
            <Button 
              size="lg"
              variant={rsvp.status === "attending" ? "default" : "outline"} 
              className={rsvp.status === "attending" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              onClick={() => handleResponse("attending")}
              disabled={setRsvp.isPending}
            >
              <Check className="mr-2 h-5 w-5" />
              I'll be there
            </Button>
            <Button 
              size="lg"
              variant={rsvp.status === "not_attending" ? "secondary" : "outline"}
              onClick={() => handleResponse("not_attending")}
              disabled={setRsvp.isPending}
            >
              <X className="mr-2 h-5 w-5" />
              Can't make it
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
