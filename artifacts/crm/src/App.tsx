import { Switch, Route, Router as WouterRouter, Redirect, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2, ShieldOff, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import FleetPage from "@/pages/Fleet";
import LocationsPage from "@/pages/Locations";
import CustomersPage from "@/pages/Customers";
import BookingsPage from "@/pages/Bookings";
import ExtrasPage from "@/pages/Extras";
import RatesPage from "@/pages/Rates";
import PromotionsPage from "@/pages/Promotions";
import ServicePage from "@/pages/Service";
import AccountingPage from "@/pages/Accounting";
import TeamPage from "@/pages/Team";
import FleetCalendarPage from "@/pages/FleetCalendar";
import ReportsPage from "@/pages/Reports";
import AlertsPage from "@/pages/Alerts";
import BookingDocument from "@/pages/BookingDocument";
import PaymentDocument from "@/pages/PaymentDocument";
import HandoverDocument from "@/pages/HandoverDocument";
import AuditLogs from "@/pages/AuditLogs";
import TbsAirParking from "@/pages/TbsAirParking";
import AdminAI from "@/pages/AdminAI";
import NotFound from "@/pages/not-found";
import type { AdminProfile } from "@workspace/api-zod";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <ShieldOff className="w-8 h-8 text-red-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold font-display tracking-tight mb-1">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">
          You don't have permission to access this section. Contact your administrator to request access.
        </p>
      </div>
      <Link href="/dashboard">
        <Button variant="outline">
          <LayoutDashboard className="w-4 h-4 mr-2" />
          Go to Dashboard
        </Button>
      </Link>
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  permissionKey,
}: {
  component: any;
  permissionKey?: keyof AdminProfile;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (permissionKey && user[permissionKey] === false) {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function DocumentRoute({ component: Component }: { component: any }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/bookings"><ProtectedRoute component={BookingsPage} permissionKey="canManageBookings" /></Route>
      <Route path="/fleet"><ProtectedRoute component={FleetPage} permissionKey="canManageVehicles" /></Route>
      <Route path="/customers"><ProtectedRoute component={CustomersPage} permissionKey="canManageUsers" /></Route>
      <Route path="/locations"><ProtectedRoute component={LocationsPage} permissionKey="canManageLocations" /></Route>
      <Route path="/extras"><ProtectedRoute component={ExtrasPage} permissionKey="canManageExtras" /></Route>
      <Route path="/rates"><ProtectedRoute component={RatesPage} permissionKey="canManageRates" /></Route>
      <Route path="/promotions"><ProtectedRoute component={PromotionsPage} permissionKey="canManagePromotions" /></Route>
      <Route path="/service"><ProtectedRoute component={ServicePage} permissionKey="canManageService" /></Route>
      <Route path="/accounting"><ProtectedRoute component={AccountingPage} permissionKey="canViewAccounting" /></Route>
      <Route path="/team"><ProtectedRoute component={TeamPage} permissionKey="canManageUsers" /></Route>
      <Route path="/fleet-calendar"><ProtectedRoute component={FleetCalendarPage} permissionKey="canViewCalendar" /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} permissionKey="canViewReports" /></Route>
      <Route path="/alerts"><ProtectedRoute component={AlertsPage} permissionKey="canViewAlerts" /></Route>
      <Route path="/audit-logs"><ProtectedRoute component={AuditLogs} permissionKey="canViewAuditLog" /></Route>
      <Route path="/tbs-parking"><ProtectedRoute component={TbsAirParking} permissionKey="canManageParking" /></Route>
      <Route path="/admin-ai"><ProtectedRoute component={AdminAI} permissionKey="canUseAdminAI" /></Route>

      <Route path="/document/:id/:type"><DocumentRoute component={BookingDocument} /></Route>
      <Route path="/payment-doc/:bookingId/:paymentId/:type"><DocumentRoute component={PaymentDocument} /></Route>
      <Route path="/handover/:id/:type"><DocumentRoute component={HandoverDocument} /></Route>

      <Route><ProtectedRoute component={NotFound} /></Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
