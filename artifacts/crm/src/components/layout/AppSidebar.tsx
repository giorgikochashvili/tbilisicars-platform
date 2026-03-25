import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, CalendarDays, Car, Users, 
  MapPin, Package, BadgeDollarSign, Tag, 
  LogOut, CarFront, UserCog, Wrench, BookOpenText, GanttChart, BarChart3, Bell, Activity, PlaneTakeoff, Bot
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Bookings", url: "/bookings", icon: CalendarDays },
  { title: "Fleet", url: "/fleet", icon: Car },
  { title: "Fleet Calendar", url: "/fleet-calendar", icon: GanttChart },
  { title: "Service", url: "/service", icon: Wrench },
  { title: "Accounting", url: "/accounting", icon: BookOpenText },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Locations", url: "/locations", icon: MapPin },
  { title: "Extras", url: "/extras", icon: Package },
  { title: "Rates", url: "/rates", icon: BadgeDollarSign },
  { title: "Promotions", url: "/promotions", icon: Tag },
  { title: "Team", url: "/team", icon: UserCog },
  { title: "Audit Log", url: "/audit-logs", icon: Activity },
  { title: "TBS AIR PARKING", url: "/tbs-parking", icon: PlaneTakeoff },
  { title: "Admin AI", url: "/admin-ai", icon: Bot },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { data: alertSummary } = useQuery<{ total: number }>({
    queryKey: ["alerts-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/alerts/summary", { credentials: "include" });
      if (!res.ok) return { total: 0 };
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const alertCount = alertSummary?.total ?? 0;

  return (
    <Sidebar variant="inset" collapsible="offcanvas" className="border-r border-border/40 bg-card/80 backdrop-blur-xl">
      <SidebarHeader className="border-b border-border/40 py-5 px-4 flex flex-row items-center gap-3">
        <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-lg shadow-primary/20 hover-elevate">
          <CarFront className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base leading-tight text-foreground tracking-tight font-display">Tbilisi Cars</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold">CRM Admin</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2 px-4">
            Modules
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (location === "/" && item.url === "/dashboard");
                const showBadge = item.url === "/alerts" && alertCount > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive} 
                      tooltip={item.title} 
                      className="data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold transition-all duration-200 mx-2 rounded-lg py-5"
                    >
                      <Link href={item.url} className="hover-elevate group flex items-center justify-between w-full">
                        <span className="flex items-center gap-0">
                          <item.icon className="w-5 h-5 mr-2 text-muted-foreground group-data-[active=true]:text-primary transition-colors" />
                          <span className="text-sm">{item.title}</span>
                        </span>
                        {showBadge && (
                          <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                            {alertCount > 99 ? "99+" : alertCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 bg-background/50 p-2.5 rounded-xl border border-border/40 hover-elevate cursor-default">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-bold text-sm shadow-md">
              {user?.fullName?.charAt(0) || "A"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold truncate text-foreground tracking-tight">{user?.fullName}</span>
              <span className="text-[11px] text-muted-foreground truncate">{user?.email}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 active-elevate-2 font-medium" 
            onClick={() => logout()} 
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout Session
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
