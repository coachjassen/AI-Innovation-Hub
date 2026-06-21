import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/auth/login";

// Attendee pages
import AttendeeGoals from "@/pages/attendee/goals";
import AttendeeMeetings from "@/pages/attendee/meetings";
import AttendeeSuggestions from "@/pages/attendee/suggestions";
import AttendeeInvite from "@/pages/attendee/invite";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminCircles from "@/pages/admin/circles";
import AdminGoals from "@/pages/admin/goals";
import AdminAttendees from "@/pages/admin/attendees";
import AdminMeetings from "@/pages/admin/meetings";
import AdminEmail from "@/pages/admin/email";
import AdminSuggestions from "@/pages/admin/suggestions";
import AdminInvites from "@/pages/admin/invites";

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
  return (
    <Switch>
      <Route path="/login" component={Login} />

      {/* Protected Routes */}
      <Route>
        <AppLayout>
          <Switch>
            {/* Attendee */}
            <Route path="/goals" component={AttendeeGoals} />
            <Route path="/meetings" component={AttendeeMeetings} />
            <Route path="/suggestions" component={AttendeeSuggestions} />
            <Route path="/invite" component={AttendeeInvite} />

            {/* Admin */}
            <Route path="/admin/dashboard" component={AdminDashboard} />
            <Route path="/admin/circles" component={AdminCircles} />
            <Route path="/admin/goals" component={AdminGoals} />
            <Route path="/admin/attendees" component={AdminAttendees} />
            <Route path="/admin/meetings" component={AdminMeetings} />
            <Route path="/admin/email" component={AdminEmail} />
            <Route path="/admin/suggestions" component={AdminSuggestions} />
            <Route path="/admin/invites" component={AdminInvites} />

            <Route path="/" component={DefaultRedirect} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
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
