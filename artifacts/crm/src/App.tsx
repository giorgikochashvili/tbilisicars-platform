import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

import { AuthProvider, useAuth } from "@/hooks/use-auth";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Do not retry on authentication failures
        if (error?.status === 401) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: any }) {
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
      
      {/* Root redirect to dashboard */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      {/* Protected CRM Modules */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/bookings"><ProtectedRoute component={BookingsPage} /></Route>
      <Route path="/fleet"><ProtectedRoute component={FleetPage} /></Route>
      <Route path="/customers"><ProtectedRoute component={CustomersPage} /></Route>
      <Route path="/locations"><ProtectedRoute component={LocationsPage} /></Route>
      <Route path="/extras"><ProtectedRoute component={ExtrasPage} /></Route>
      <Route path="/rates"><ProtectedRoute component={RatesPage} /></Route>
      <Route path="/promotions"><ProtectedRoute component={PromotionsPage} /></Route>
      <Route path="/service"><ProtectedRoute component={ServicePage} /></Route>
      <Route path="/accounting"><ProtectedRoute component={AccountingPage} /></Route>
      <Route path="/team"><ProtectedRoute component={TeamPage} /></Route>
      <Route path="/fleet-calendar"><ProtectedRoute component={FleetCalendarPage} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/alerts"><ProtectedRoute component={AlertsPage} /></Route>
      <Route path="/audit-logs"><ProtectedRoute component={AuditLogs} /></Route>

      {/* Booking Documents — no sidebar layout */}
      <Route path="/document/:id/:type"><DocumentRoute component={BookingDocument} /></Route>

      {/* Payment Documents — no sidebar layout */}
      <Route path="/payment-doc/:bookingId/:paymentId/:type"><DocumentRoute component={PaymentDocument} /></Route>

      {/* Handover / Return Sheets — no sidebar layout */}
      <Route path="/handover/:id/:type"><DocumentRoute component={HandoverDocument} /></Route>
      
      {/* Fallback */}
      <Route><ProtectedRoute component={NotFound} /></Route>
    </Switch>
  );
}

function App() {
  // Always enforce dark mode for the CRM
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
  }

  return (
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
  );
}

export default App;
