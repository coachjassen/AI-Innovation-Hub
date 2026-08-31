import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleProvider } from "@/contexts/CircleContext";
import Login from "@/pages/auth/login";
import OneOffRsvpPage from "@/pages/one-off-rsvp";
import MeetingRsvpPage from "@/pages/meeting-rsvp";

import RegisterPage from "@/pages/register";

// Attendee pages
import AttendeeGoals from "@/pages/attendee/goals";
import AttendeeMeetings from "@/pages/attendee/meetings";
import AttendeeSuggestions from "@/pages/attendee/suggestions";
import AttendeeInvite from "@/pages/attendee/invite";
import AttendeeSurvey from "@/pages/attendee/survey";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminCircles from "@/pages/admin/circles";
import AdminGoals from "@/pages/admin/goals";
import AdminAttendees from "@/pages/admin/attendees";
import AdminMeetings from "@/pages/admin/meetings";
import AdminEmail from "@/pages/admin/email";
import AdminSuggestions from "@/pages/admin/suggestions";
import AdminInvites from "@/pages/admin/invites";
import AdminAccounts from "@/pages/admin/accounts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function DefaultRedirect() {
  const [, setLocation] = useLocation();
  // Redirect root to goals for attendees (AppLayout handles unauthenticated redirect)
  return (
    <div className="p-8 flex items-center justify-center text-muted-foreground">
      <button
        className="text-sm"
        onClick={() => setLocation("/goals")}
      >
        Redirecting...
      </button>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const artifactBasePath = configuredBasePath || "/ai-innovation-circle";
  const normalizedLocation = location.startsWith(`${artifactBasePath}/`)
    ? location.slice(artifactBasePath.length)
    : location;

  // The artifact preview proxy can expose the initial URL with its base path
  // included before Wouter normalizes it. Keep all route matching on internal
  // paths so protected pages and magic links work in both preview and root hosting.
  if (normalizedLocation === "/login") {
    return <Login />;
  }

  if (normalizedLocation.startsWith("/one-off-rsvp/")) {
    return (
      <Switch location={normalizedLocation}>
        <Route path="/one-off-rsvp/:token">
          {(params) => <OneOffRsvpPage token={params.token} />}
        </Route>
      </Switch>
    );
  }

  if (normalizedLocation.startsWith("/meeting-rsvp/")) {
    return (
      <Switch location={normalizedLocation}>
        <Route path="/meeting-rsvp/:token">
          {(params) => <MeetingRsvpPage token={params.token} />}
        </Route>
      </Switch>
    );
  }

  if (normalizedLocation.startsWith("/register/")) {
    return (
      <Switch location={normalizedLocation}>
        <Route path="/register/:token">
          {(params) => <RegisterPage token={params.token} />}
        </Route>
      </Switch>
    );
  }

  if (normalizedLocation === "/admin/accounts") {
    return (
      <CircleProvider>
        <AppLayout>
          <AdminAccounts />
        </AppLayout>
      </CircleProvider>
    );
  }

  return (
    <Switch location={normalizedLocation}>
      <Route path="/login" component={Login} />

      {/* Protected Routes */}
      <Route>
        <CircleProvider>
        <AppLayout>
          <Switch>
            {/* Attendee */}
            <Route path="/goals" component={AttendeeGoals} />
            <Route path="/meetings" component={AttendeeMeetings} />
            <Route path="/suggestions" component={AttendeeSuggestions} />
            <Route path="/invite" component={AttendeeInvite} />
            <Route path="/survey/:id" component={AttendeeSurvey} />

            {/* Admin */}
            <Route path="/admin/dashboard" component={AdminDashboard} />
            <Route path="/admin/hubs" component={AdminCircles} />
            <Route path="/admin/circles"><Redirect to="/admin/hubs" /></Route>
            <Route path="/admin/goals" component={AdminGoals} />
            <Route path="/admin/attendees" component={AdminAttendees} />
            <Route path="/admin/meetings" component={AdminMeetings} />
            <Route path="/admin/email" component={AdminEmail} />
            <Route path="/admin/suggestions" component={AdminSuggestions} />
            <Route path="/admin/invites" component={AdminInvites} />
            <Route path="/admin/accounts" component={AdminAccounts} />

            <Route path="/" component={DefaultRedirect} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
        </CircleProvider>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
