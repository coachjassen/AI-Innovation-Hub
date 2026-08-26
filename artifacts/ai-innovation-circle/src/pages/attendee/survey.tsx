import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useGetSurvey, useSubmitSurveyResponse } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ClipboardList } from "lucide-react";

export default function AttendeeSurvey() {
  const [, params] = useRoute("/survey/:id");
  const surveyId = Number(params?.id);
  const { data: survey, isLoading, isError } = useGetSurvey(Number.isInteger(surveyId) ? surveyId : 0);
  const submitSurvey = useSubmitSurveyResponse();
  const [answers, setAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (survey) {
      setAnswers(survey.questions.map(() => ""));
      setSubmitted(false);
    }
  }, [survey]);

  if (!Number.isInteger(surveyId) || surveyId <= 0 || isError) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Survey unavailable</CardTitle>
            <CardDescription>This survey does not exist or is not available to your account.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading || !survey) {
    return <div className="p-8 max-w-2xl mx-auto"><div className="h-64 animate-pulse rounded-lg bg-muted" /></div>;
  }

  const updateAnswer = (index: number, value: string) => {
    setAnswers((current) => current.map((answer, answerIndex) => (answerIndex === index ? value : answer)));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (answers.some((answer) => answer.trim() === "")) return;
    submitSurvey.mutate(
      { id: survey.id, data: { answers: answers.map((answer) => answer.trim()) } },
      { onSuccess: () => setSubmitted(true) },
    );
  };

  if (submitted) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
            <h1 className="text-2xl font-semibold">Thanks for your feedback</h1>
            <p className="text-muted-foreground">Your survey response has been recorded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" /> Meeting Feedback
        </h1>
        <p className="text-muted-foreground mt-2">Share your thoughts to help shape future Hub sessions.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Post-meeting survey</CardTitle>
          <CardDescription>Please answer each question before submitting.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            {survey.questions.map((question, index) => (
              <div className="space-y-2" key={`${survey.id}-${index}`}>
                <Label htmlFor={`survey-answer-${index}`}>{index + 1}. {question}</Label>
                <Textarea
                  id={`survey-answer-${index}`}
                  value={answers[index] ?? ""}
                  onChange={(event) => updateAnswer(index, event.target.value)}
                  required
                  rows={3}
                />
              </div>
            ))}
            {submitSurvey.isError && (
              <p className="text-sm text-destructive">
                {(submitSurvey.error as Error).message || "Your response could not be submitted. Please try again."}
              </p>
            )}
            <Button type="submit" disabled={submitSurvey.isPending || answers.some((answer) => answer.trim() === "")}>
              {submitSurvey.isPending ? "Sending feedback..." : "Submit feedback"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}