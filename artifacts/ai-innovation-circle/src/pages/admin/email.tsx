import { useState } from "react";
import { useSendPreMeetingReminder, useSendPostMeetingSurvey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Bell, ClipboardList, CheckCircle2, AlertCircle, CircleDot } from "lucide-react";
import { useActiveCircle } from "@/contexts/CircleContext";

function StatusMessage({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

export default function AdminEmail() {
  const { activeCircle, activeCircleId } = useActiveCircle();
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [surveyResult, setSurveyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendReminder = useSendPreMeetingReminder();
  const sendSurvey = useSendPostMeetingSurvey();

  const circleId = activeCircleId;

  const handleReminder = () => {
    if (!circleId) return;
    setReminderResult(null);
    sendReminder.mutate(
      { data: { circleId } },
      {
        onSuccess: (data) => setReminderResult({ ok: true, msg: (data as any).message ?? "Reminders sent!" }),
        onError: (err: any) => setReminderResult({ ok: false, msg: err?.message ?? "Failed to send reminders." }),
      }
    );
  };

  const handleSurvey = () => {
    if (!circleId) return;
    setSurveyResult(null);
    sendSurvey.mutate(
      { data: { circleId } },
      {
        onSuccess: (data) => setSurveyResult({ ok: true, msg: (data as any).message ?? "Survey sent!" }),
        onError: (err: any) => setSurveyResult({ ok: false, msg: err?.message ?? "Failed to send survey." }),
      }
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Triggers</h1>
        <p className="text-muted-foreground mt-2">
          Send batch emails to hub attendees. When SMTP is configured, emails will be delivered; otherwise they're suppressed gracefully.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-2 w-fit">
        <CircleDot className="h-4 w-4 text-primary" />
        <span>
          Sending to <strong className="text-foreground">{activeCircle?.name ?? "—"}</strong>. Switch hubs from the sidebar.
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-500" />
              Meeting Reminder
            </CardTitle>
            <CardDescription>
              Sends each attendee a reminder with their open goals and the next meeting date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleReminder}
              disabled={sendReminder.isPending || !circleId}
              className="w-full"
            >
              <Mail className="mr-2 h-4 w-4" />
              {sendReminder.isPending ? "Sending..." : "Send Reminder"}
            </Button>
            {reminderResult && <StatusMessage ok={reminderResult.ok} message={reminderResult.msg} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-500" />
              Post-Meeting Survey
            </CardTitle>
            <CardDescription>
              Sends each attendee a feedback form after a meeting has concluded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSurvey}
              disabled={sendSurvey.isPending || !circleId}
              variant="secondary"
              className="w-full"
            >
              <Mail className="mr-2 h-4 w-4" />
              {sendSurvey.isPending ? "Sending..." : "Send Survey"}
            </Button>
            {surveyResult && <StatusMessage ok={surveyResult.ok} message={surveyResult.msg} />}
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <p className="text-sm text-amber-800">
             <strong>Email delivery:</strong> Configure Microsoft Graph application permissions with <code className="bg-amber-100 px-1 rounded">EMAIL_PROVIDER=graph</code>, the Graph tenant/application settings, and <code className="bg-amber-100 px-1 rounded">GRAPH_SENDER_EMAIL</code>. SMTP remains supported as an alternative.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
