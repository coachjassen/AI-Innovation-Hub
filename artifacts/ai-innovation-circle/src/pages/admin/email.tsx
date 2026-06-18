import { useState } from "react";
import { useSendPreMeetingReminder, useSendPostMeetingSurvey, useListCircles } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Bell, ClipboardList, CheckCircle2, AlertCircle } from "lucide-react";

function StatusMessage({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

export default function AdminEmail() {
  const { data: circles = [] } = useListCircles();
  const [selectedCircle, setSelectedCircle] = useState<number | "">("");
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [surveyResult, setSurveyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendReminder = useSendPreMeetingReminder();
  const sendSurvey = useSendPostMeetingSurvey();

  const firstCircleId = circles[0]?.id;
  const circleId = selectedCircle !== "" ? Number(selectedCircle) : (firstCircleId ?? null);

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
          Send batch emails to circle attendees. When SMTP is configured, emails will be delivered; otherwise they're suppressed gracefully.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="circle-select">Select Circle</Label>
        <select
          id="circle-select"
          value={selectedCircle !== "" ? selectedCircle : (firstCircleId ?? "")}
          onChange={(e) => setSelectedCircle(Number(e.target.value))}
          className="w-full max-w-xs border rounded-md px-3 py-2 text-sm"
        >
          {circles.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
            <strong>POC mode:</strong> Email is suppressed when SMTP is not configured. To enable real delivery, set <code className="bg-amber-100 px-1 rounded">SMTP_HOST</code>, <code className="bg-amber-100 px-1 rounded">SMTP_USER</code>, <code className="bg-amber-100 px-1 rounded">SMTP_PASS</code>, <code className="bg-amber-100 px-1 rounded">SMTP_PORT</code>, and <code className="bg-amber-100 px-1 rounded">SMTP_FROM</code> as environment secrets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
