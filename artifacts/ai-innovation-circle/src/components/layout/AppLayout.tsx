import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { 
  useGetMe, 
  useLogout 
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
  SidebarFooter
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Target, Users, Calendar, Mail, Lightbulb, UserPlus, LogOut, LayoutDashboard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KineticsLogo } from "@/components/KineticsLogo";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe({ query: { retry: false } });
  const [location, setLocation] = useLocation();
  const logout = useLogout();

  // Redirect to login when unauthenticated — use effect to avoid setState-during-render
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

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

  const isAdmin = user.role === "admin";

  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/goals", label: "All Goals", icon: Target },
    { href: "/admin/attendees", label: "Attendees", icon: Users },
    { href: "/admin/meetings", label: "Meetings", icon: Calendar },
    { href: "/admin/suggestions", label: "Suggestions", icon: Lightbulb },
    { href: "/admin/invites", label: "Invites", icon: UserPlus },
    { href: "/admin/email", label: "Email Triggers", icon: Mail },
  ];

  const attendeeLinks = [
    { href: "/goals", label: "My Goals", icon: Target },
    { href: "/meetings", label: "Meetings", icon: Calendar },
    { href: "/suggestions", label: "Suggestions", icon: Lightbulb },
    { href: "/invite", label: "Invite Colleague", icon: UserPlus },
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
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <KineticsLogo className="h-8 w-8 shrink-0" />
                <div className="leading-tight">
                  <h1 className="text-base font-bold tracking-tight">Kinetics</h1>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">AI Innovation Circle</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.role === 'admin' ? 'Administrator' : 'Consulting Client'}</p>
              </div>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => {
                    const isActive = location.startsWith(link.href);
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
            <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </SidebarFooter>
        </Sidebar>
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
