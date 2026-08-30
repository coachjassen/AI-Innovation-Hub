import { useState } from "react";
import {
  useGetPublicHubRegistration,
  getGetPublicHubRegistrationQueryKey,
  useSubmitHubRegistration,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Sparkles, CheckCircle2, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  company: z.string(),
});

export default function RegisterPage({ token }: { token: string }) {
  const { data: registration, isLoading, isError } = useGetPublicHubRegistration(token, {
    query: { retry: false, queryKey: getGetPublicHubRegistrationQueryKey(token) }
  });
  const submitRegistration = useSubmitHubRegistration();
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full mt-6" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !registration) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 pb-8">
            <Lock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Link Invalid</h1>
            <p className="text-muted-foreground">This registration link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!registration.registrationOpen) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 pb-8">
            <Lock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Registration Closed</h1>
            <p className="text-muted-foreground">Registration for {registration.circleName} is currently closed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
        <Card className="w-full max-w-md text-center border-primary/20">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Interest Registered</h1>
            <p className="text-muted-foreground text-sm">
              Thank you for your interest in {registration.circleName}. We have received your details and will be in touch when the next round of invitations is sent out.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setSubmitError(null);
    submitRegistration.mutate(
      {
        token,
        data: values,
      },
      {
        onSuccess: () => {
          setIsSuccess(true);
        },
        onError: (error) => {
          setSubmitError(error.message || "We couldn’t register your interest. Please try again.");
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-6">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <CardTitle className="text-2xl">{registration.circleName}</CardTitle>
            <CardDescription className="text-sm font-medium text-primary uppercase tracking-wider">
              {registration.cadence} Hub Registration
            </CardDescription>
          </div>
          {registration.description && (
            <p className="text-sm text-center text-muted-foreground pt-2">
              {registration.description}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" data-testid="registration-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane@example.com" data-testid="registration-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corp" data-testid="registration-company" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {submitError && (
                <p role="alert" className="text-sm text-destructive" data-testid="alert-registration-error">
                  {submitError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full mt-6"
                disabled={submitRegistration.isPending}
                data-testid="registration-submit"
              >
                {submitRegistration.isPending ? "Submitting..." : "Register Interest"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
