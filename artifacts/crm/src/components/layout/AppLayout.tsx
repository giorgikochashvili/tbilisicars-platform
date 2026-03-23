import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full bg-background overflow-hidden text-foreground selection:bg-primary/30">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-16 items-center border-b border-border/40 bg-card/60 px-6 backdrop-blur-xl z-10 sticky top-0 shadow-sm">
            <h1 className="font-display font-semibold text-lg">Operations Center</h1>
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
