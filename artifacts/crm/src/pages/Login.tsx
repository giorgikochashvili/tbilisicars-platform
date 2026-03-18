import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CarFront, Loader2, KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { mutate: login, isPending } = useAdminLogin({ request: { credentials: "include" } });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!isAuthLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isAuthLoading, setLocation]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  function onSubmit(data: z.infer<typeof loginSchema>) {
    login({ data }, {
      onSuccess: () => {
        window.location.href = import.meta.env.BASE_URL + "dashboard";
      },
      onError: () => {
        form.setError("root", { message: "Invalid credentials. Please verify your access and try again." });
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Immersive background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[150px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/20 blur-[150px] animate-pulse" style={{ animationDuration: '6s' }} />
      </div>

      <Card className="w-full max-w-md z-10 border-border/40 shadow-2xl shadow-black/80 bg-card/60 backdrop-blur-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/40" />
        
        <CardHeader className="space-y-4 items-center text-center pb-8 pt-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/20 mb-2 hover-elevate">
            <CarFront className="w-10 h-10 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight font-display">Tbilisi Cars</CardTitle>
            <CardDescription className="text-muted-foreground font-medium text-xs uppercase tracking-[0.3em]">
              Secure Operations Portal
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {form.formState.errors.root && (
                <div className="p-4 text-sm text-destructive-foreground bg-destructive/90 rounded-xl text-center font-medium shadow-sm animate-in fade-in zoom-in-95 duration-200">
                  {form.formState.errors.root.message}
                </div>
              )}

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80 font-semibold text-xs uppercase tracking-wider">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input 
                            placeholder="admin@tbilisicars.ge" 
                            {...field} 
                            className="h-12 pl-10 bg-background/50 border-border/50 focus:bg-background focus:ring-primary/20 focus:border-primary transition-all rounded-xl" 
                            data-testid="input-email" 
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80 font-semibold text-xs uppercase tracking-wider">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            {...field} 
                            className="h-12 pl-10 bg-background/50 border-border/50 focus:bg-background focus:ring-primary/20 focus:border-primary transition-all rounded-xl" 
                            data-testid="input-password" 
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 rounded-xl mt-4 active-elevate-2" 
                disabled={isPending} 
                data-testid="button-login"
              >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authenticate"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
