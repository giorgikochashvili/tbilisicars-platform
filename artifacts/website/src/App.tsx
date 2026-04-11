import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Fleet from "./pages/Fleet";
import About from "./pages/About";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Locations from "./pages/Locations";
import Services from "./pages/Services";
import Booking from "./pages/Booking";
import Login from "./pages/Login";
import NotFound from "./pages/not-found";
import ChatbotWidget from "./components/ChatbotWidget";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "/";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={base}>
          <div className="flex flex-col min-h-screen bg-background">
            <Header />
            <main className="flex-1">
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/fleet" component={Fleet} />
                <Route path="/about" component={About} />
                <Route path="/terms" component={Terms} />
                <Route path="/privacy" component={Privacy} />
                <Route path="/locations" component={Locations} />
                <Route path="/services" component={Services} />
                <Route path="/booking" component={Booking} />
                <Route path="/login" component={Login} />
                <Route component={NotFound} />
              </Switch>
            </main>
            <Footer />
            <ChatbotWidget />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
