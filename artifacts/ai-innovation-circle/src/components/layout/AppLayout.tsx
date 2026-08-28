import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { 
  useGetMe, 
  useLogout,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarFooter,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Target, Users, Calendar, Mail, Lightbulb, UserPlus, LogOut, LayoutDashboard, CircleDot, UserCog } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KineticsLogo } from "@/components/KineticsLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCircle } from "@/contexts/CircleContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { activeCircle, circles } = useActiveCircle();
  const configuredBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const artifactBasePath = configuredBasePath || "/ai-innovation-circle";
  const internalLocation = location.startsWith(`${artifactBasePath}/`)
    ? location.slice(artifactBasePath.length)
    : location;

  // Redirect to login when unauthenticated — use effect to avoid setState-during-render
  useEffect(() => {
    if (!isLoading && !user) {
      const returnTo = internalLocation.startsWith("/") && !internalLocation.startsWith("//")
        ? `?returnTo=${encodeURIComponent(internalLocation)}`
        : "";
      setLocation(`/login${returnTo}`);
    }
  }, [isLoading, user, internalLocation, setLocation]);

  // Guard admin-only routes: redirect non-admins away from /admin/* pages
  useEffect(() => {
    if (!isLoading && user && user.role !== "admin" && internalLocation.startsWith("/admin")) {
      setLocation("/goals");
    }
  }, [isLoading, user, internalLocation, setLocation]);

  const isAdmin = user?.role === "admin";
  const isOneOffHub = activeCircle?.cadence === "one-off";
  const restrictedOneOffPath = isAdmin
    ? ["/admin/goals", "/admin/suggestions", "/admin/invites"].some((path) => internalLocation.startsWith(path))
    : ["/goals", "/suggestions", "/invite"].some((path) => internalLocation.startsWith(path));

  useEffect(() => {
    if (user && isOneOffHub && restrictedOneOffPath) {
      setLocation(isAdmin ? "/admin/dashboard" : "/meetings");
    }
  }, [isAdmin, isOneOffHub, restrictedOneOffPath, setLocation, user]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(!isOneOffHub ? [{ href: "/admin/goals", label: "All Goals", icon: Target }] : []),
    { href: "/admin/attendees", label: "Attendees", icon: Users },
    { href: "/admin/meetings", label: "Meetings", icon: Calendar },
    ...(!isOneOffHub ? [
      { href: "/admin/suggestions", label: "Suggestions", icon: Lightbulb },
      { href: "/admin/invites", label: "Invites", icon: UserPlus },
    ] : []),
    { href: "/admin/accounts", label: "Administrators", icon: UserCog },
    { href: "/admin/email", label: "Email Triggers", icon: Mail },
  ];

  const attendeeLinks = [
    ...(!isOneOffHub ? [{ href: "/goals", label: "My Goals", icon: Target }] : []),
    { href: "/meetings", label: "Meetings", icon: Calendar },
    ...(!isOneOffHub ? [
      { href: "/suggestions", label: "Suggestions", icon: Lightbulb },
      { href: "/invite", label: "Invite Colleague", icon: UserPlus },
    ] : []),
  ];

  const links = isAdmin ? adminLinks : attendeeLinks;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/login")
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar>
          <SidebarContent>
            <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
              <div className="rounded-md bg-white px-3 py-1.5 shadow-sm">
                <KineticsLogo className="h-6 w-auto" />
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
                  {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate text-sidebar-foreground">{user.name}</p>
                  <p className="text-xs text-sidebar-foreground/60">{user.role === 'admin' ? 'Administrator' : 'Consulting Client'}</p>
                </div>
              </div>
              {(isAdmin || circles.length > 1) && (
                <div className="space-y-2">
                  <CircleSwitcher />
                  {isAdmin && (
                    <Link
                      href="/admin/hubs"
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        internalLocation.startsWith("/admin/hubs") || internalLocation.startsWith("/admin/circles")
                          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                      data-testid="link-hubs-setup"
                    >
                      <CircleDot className="h-4 w-4" />
                      <span>Hubs Setup</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => {
                    const isActive = internalLocation.startsWith(link.href);
                    return (
                      <SidebarMenuItem key={link.href}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={link.label}>
                          <Link href={link.href} className="flex items-center gap-3">
                            <link.icon className="h-4 w-4" />
                            <span>{link.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-4">
            <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="relative h-16 flex items-center gap-3 px-6 brand-gradient brand-glow text-sidebar-foreground border-b border-sidebar-border">
            <SidebarTrigger className="text-sidebar-foreground hover:text-white -ml-1 relative z-10" />
            <div className="relative z-10 flex items-baseline gap-2">
              <h1 className="text-base font-semibold tracking-tight text-white">Kinetics Group</h1>
              <span className="text-base font-light tracking-tight text-[hsl(var(--brand-lime))]">Innovation Hubs</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--brand-lime)/0.5)] to-transparent" />
          </header>
          <main className="flex-1 flex flex-col min-w-0 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function CircleSwitcher() {
  const { circles, activeCircleId, setActiveCircleId, isLoading } = useActiveCircle();

  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }
  if (circles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70 flex items-center gap-1.5">
        <CircleDot className="h-3 w-3 text-[hsl(var(--brand-lime))]" /> Active Hub
      </p>
      <Select
        value={activeCircleId !== null ? String(activeCircleId) : undefined}
        onValueChange={(v) => setActiveCircleId(parseInt(v, 10))}
      >
        <SelectTrigger
          className="h-9 border-sidebar-border bg-sidebar-accent text-sidebar-foreground data-[placeholder]:text-sidebar-foreground/60 focus:ring-sidebar-ring"
          data-testid="select-active-circle"
        >
          <SelectValue placeholder="Select a hub" />
        </SelectTrigger>
        <SelectContent>
          {circles.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
