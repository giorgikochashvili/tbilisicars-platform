import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetAdminMe, type AdminProfile } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: AdminProfile | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();

  const { data: user, isLoading, isError } = useGetAdminMe({
    request: { credentials: "include" }
  });

  useEffect(() => {
    if (isError) {
      setLocation("/login");
    }
  }, [isError, setLocation]);

  const logout = async () => {
    try {
      const res = await fetch("/api/auth/admin/logout", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        window.location.href = "/crm/login";
      } else {
        console.error("[logout] server error:", res.status, res.statusText);
      }
    } catch (err) {
      console.error("[logout] request failed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
