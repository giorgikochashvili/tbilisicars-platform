import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, CalendarDays, Car, Users, 
  MapPin, Package, BadgeDollarSign, Tag, 
  LogOut, CarFront, UserCog, Wrench, BookOpenText, GanttChart, BarChart3, Bell, Activity, PlaneTakeoff, Bot, ClipboardList, Star
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
import type { AdminProfile } from "@workspace/api-zod";

type PermKey = keyof AdminProfile | null;

const navItems: Array<{ title: string; url: string; icon: React.ElementType; permissionKey: PermKey }> = [
  { title: "Dashboard",       url: "/dashboard",      icon: LayoutDashboard,  permissionKey: null },
  { title: "Tasks",           url: "/tasks",           icon: ClipboardList,    permissionKey: "canManageTasks" },
  { title: "Bookings",        url: "/bookings",        icon: CalendarDays,     permissionKey: "canManageBookings" },
  { title: "Fleet",           url: "/fleet",           icon: Car,              permissionKey: "canManageVehicles" },
  { title: "Featured Cars",   url: "/featured-cars",   icon: Star,             permissionKey: "canManageVehicles" },
  { title: "Fleet Calendar",  url: "/fleet-calendar",  icon: GanttChart,       permissionKey: "canViewCalendar" },
  { title: "Service",         url: "/service",         icon: Wrench,           permissionKey: "canManageService" },
  { title: "Accounting",      url: "/accounting",      icon: BookOpenText,     permissionKey: "canViewAccounting" },
  { title: "Reports",         url: "/reports",         icon: BarChart3,        permissionKey: "canViewReports" },
  { title: "Alerts",          url: "/alerts",          icon: Bell,             permissionKey: "canViewAlerts" },
  { title: "Customers",       url: "/customers",       icon: Users,            permissionKey: "canManageUsers" },
  { title: "Locations",       url: "/locations",       icon: MapPin,           permissionKey: "canManageLocations" },
  { title: "Extras",          url: "/extras",          icon: Package,          permissionKey: "canManageExtras" },
  { title: "Rates",           url: "/rates",           icon: BadgeDollarSign,  permissionKey: "canManageRates" },
  { title: "Promotions",      url: "/promotions",      icon: Tag,              permissionKey: "canManagePromotions" },
  { title: "Team",            url: "/team",            icon: UserCog,          permissionKey: "canManageUsers" },
  { title: "Audit Log",       url: "/audit-logs",      icon: Activity,         permissionKey: "canViewAuditLog" },
  { title: "TBS AIR PARKING", url: "/tbs-parking",     icon: PlaneTakeoff,     permissionKey: "canManageParking" },
  { title: "Admin AI",        url: "/admin-ai",        icon: Bot,              permissionKey: "canUseAdminAI" },
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

  const visibleItems = navItems.filter((item) => {
    if (!item.permissionKey) return true;
    if (!user) return false;
    const val = user[item.permissionKey as keyof typeof user];
    return val === true;
  });

  return (
    <Sidebar variant="inset" collapsible="offcanvas" className="border-r border-border/40 bg-card/80 backdrop-blur-xl">
      <SidebarHeader className="border-b border-border/40 py-3 px-4 flex flex-row items-center gap-3">
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
              {visibleItems.map((item) => {
                const isActive = location === item.url || (location === "/" && item.url === "/dashboard");
                const showBadge = item.url === "/alerts" && alertCount > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive} 
                      tooltip={item.title} 
                      className="data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold transition-all duration-200 mx-2 rounded-lg py-2"
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

      <SidebarFooter className="border-t border-border/40 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-background/50 px-2 py-1.5 rounded-lg border border-border/40 cursor-default">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-bold text-xs shadow-md flex-shrink-0">
              {user?.fullName?.charAt(0) || "A"}
            </div>
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="text-xs font-semibold truncate text-foreground tracking-tight">{user?.fullName}</span>
              <span className="text-[10px] text-muted-foreground truncate">{user?.email}</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-medium h-8 text-xs" 
            onClick={() => logout()} 
            data-testid="button-logout"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Logout Session
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
