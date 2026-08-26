import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  useRequestMagicLink,
  useVerifyMagicLink,
  useGetMe,
  useGetAuthConfig,
  useDirectAdminLogin,
  getGetAuthConfigQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KineticsLogo } from "@/components/KineticsLogo";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const requestMagicLink = useRequestMagicLink();
  const verifyMagicLink = useVerifyMagicLink();
  const directAdminLogin = useDirectAdminLogin();
  const [requestSent, setRequestSent] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const handledToken = useRef<string | null>(null);

  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;
  const returnTo = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("returnTo")
    : null;
  const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const artifactBasePath = configuredBasePath || "/ai-innovation-circle";
  const normalizedReturnTo = returnTo && artifactBasePath && returnTo.startsWith(`${artifactBasePath}/`)
    ? returnTo.slice(artifactBasePath.length)
    : returnTo;
  const safeReturnTo = normalizedReturnTo?.startsWith("/") && !normalizedReturnTo.startsWith("//")
    ? normalizedReturnTo
    : null;

  // Try to see if already logged in
  const { data: user, isLoading: isUserLoading } = useGetMe({ 
    query: { retry: false, staleTime: 0, queryKey: getGetMeQueryKey() }
  });
  const { data: authConfig } = useGetAuthConfig({
    query: { retry: false, staleTime: Infinity, queryKey: getGetAuthConfigQueryKey() },
  });
  const isDirectAdminMode = authConfig?.mode === "direct_admin";

  useEffect(() => {
    if (user && !token) {
      setLocation(safeReturnTo ?? (user.role === 'admin' ? '/admin/dashboard' : '/goals'));
    }
  }, [user, token, safeReturnTo, setLocation]);

  useEffect(() => {
    if (!token || isUserLoading || user || handledToken.current === token) return;
    handledToken.current = token;
    setVerificationError(null);

    verifyMagicLink.mutate(
      { data: { token } },
      {
        onSuccess: (attendee) => {
          window.history.replaceState(null, "", window.location.pathname);
          queryClient.setQueryData(getGetMeQueryKey(), attendee);
          setLocation(safeReturnTo ?? (attendee.role === "admin" ? "/admin/dashboard" : "/goals"));
        },
        onError: () => {
          window.history.replaceState(null, "", window.location.pathname);
          setVerificationError("This sign-in link is invalid or has expired. Request a new link below.");
        },
      },
    );
  }, [token, isUserLoading, user, queryClient, safeReturnTo, setLocation, verifyMagicLink]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" }
  });

  const onSubmit = (data: LoginForm) => {
    setRequestError(null);
    setRequestSent(false);
    if (isDirectAdminMode) {
      directAdminLogin.mutate({ data: { email: data.email } }, {
        onSuccess: (attendee) => {
          queryClient.setQueryData(getGetMeQueryKey(), attendee);
          setLocation(safeReturnTo ?? "/admin/dashboard");
        },
        onError: (error) => {
          const status = (error as { status?: number }).status;
          setRequestError(
            status === 401 || status === 403
              ? "This email does not have administrator access."
              : "We couldn't sign you in. Please try again.",
          );
        },
      });
      return;
    }

    requestMagicLink.mutate({ data: { email: data.email } }, {
      onSuccess: () => {
        setRequestSent(true);
      },
      onError: (error) => {
        const status = (error as { status?: number }).status;
        setRequestError(
          status === 503
            ? "Email delivery is not configured yet. Please contact your facilitator."
            : "We couldn't send a sign-in email. Please try again.",
        );
      },
    });
  };

  if (isUserLoading) return <div className="h-screen w-full brand-gradient" />;

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center brand-gradient brand-glow p-4">
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[hsl(var(--brand-lime)/0.12)] blur-3xl" />
      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="rounded-xl bg-white px-5 py-3 shadow-lg">
              <KineticsLogo className="h-10 w-auto" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Innovation Hubs
            </h1>
            <p className="text-[hsl(var(--brand-lime))]">Where great teams do more, be more.</p>
          </div>
        </div>

        <Card className="border-white/10 shadow-2xl">
          <CardHeader>
            <CardTitle>{isDirectAdminMode ? "Administrator sign in" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isDirectAdminMode
                ? "Enter the email address for an administrator account."
                : "We'll email you a secure, one-time sign-in link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verifyMagicLink.isPending ? (
              <div className="text-center space-y-4 py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-4">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Verifying your link...</h3>
                <p className="text-sm text-gray-500">You’ll be redirected to your dashboard shortly.</p>
              </div>
            ) : requestSent ? (
              <div className="space-y-4 py-4">
                <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
                  Check your inbox for a sign-in link. It expires in 1 hour.
                </div>
                <p className="text-sm text-muted-foreground">
                  If the link expires, return here and request a fresh one. Only the newest link will work.
                </p>
                <Button type="button" variant="outline" className="w-full" onClick={() => setRequestSent(false)}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {verificationError && (
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                      {verificationError}
                    </div>
                  )}
                  {requestError && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                      {requestError}
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@company.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={requestMagicLink.isPending || directAdminLogin.isPending}
                  >
                    {isDirectAdminMode
                      ? (directAdminLogin.isPending ? "Signing in..." : "Sign in")
                      : (requestMagicLink.isPending ? "Sending link..." : "Email me a sign-in link")}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}