import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ReactNode } from "react";
import { Sun, Moon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useQueryClient } from "@tanstack/react-query";

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-dvh w-full bg-background overflow-hidden text-foreground selection:bg-primary/30">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-16 items-center justify-between border-b border-border/40 bg-card/60 px-6 backdrop-blur-xl z-10 sticky top-0 shadow-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                data-testid="button-sidebar-toggle"
                className="md:hidden w-9 h-9 border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-background transition-all hover-elevate rounded-md"
              />
              <h1 className="font-display font-semibold text-lg">Operations Center</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => qc.invalidateQueries()}
              aria-label="Refresh data"
              className="w-9 h-9 border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all rounded-md"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 border border-border/50 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all rounded-md"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative">
            <div className="max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
