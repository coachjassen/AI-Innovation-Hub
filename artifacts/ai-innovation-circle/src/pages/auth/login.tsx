import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useRequestMagicLink, useGetMe, getGetMeQueryKey, getGetMeQueryOptions } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KineticsLogo } from "@/components/KineticsLogo";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const requestMagicLink = useRequestMagicLink();
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Try to see if already logged in
  const { data: user, isLoading: isUserLoading } = useGetMe({ 
    query: { retry: false, staleTime: 0, queryKey: getGetMeQueryKey() } 
  });

  useEffect(() => {
    if (user) {
      setLocation(user.role === 'admin' ? '/admin/dashboard' : '/goals');
    }
  }, [user, setLocation]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" }
  });

  const onSubmit = (data: LoginForm) => {
    setIsSuccess(false);
    requestMagicLink.mutate({ data: { email: data.email } }, {
      onSuccess: async () => {
        setIsSuccess(true);
        // POC auto-logs them in. Poll the session a few times to absorb any
        // brief propagation delay before it becomes readable. A successful
        // fetch updates the useGetMe cache, and the redirect effect navigates.
        for (let attempt = 0; attempt < 5; attempt++) {
          const user = await queryClient
            .fetchQuery(getGetMeQueryOptions())
            .catch(() => null);
          if (user) return;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        // Session never became readable — let the user retry instead of
        // stranding them on the "Signing in…" panel.
        setIsSuccess(false);
        form.setError("email", {
          message: "Sign-in didn't complete. Please try again.",
        });
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
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Enter your email to sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="text-center space-y-4 py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-4">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Signing in...</h3>
                <p className="text-sm text-gray-500">Redirecting to your dashboard.</p>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    disabled={requestMagicLink.isPending}
                  >
                    {requestMagicLink.isPending ? "Signing in..." : "Sign in"}
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