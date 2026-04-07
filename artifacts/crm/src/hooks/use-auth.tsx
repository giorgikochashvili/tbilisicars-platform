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

  const logout = () => {
    fetch("/api/auth/admin/logout", {
      method: "POST",
      credentials: "include",
    })
      .catch((err) => console.error("[logout] request failed:", err))
      .finally(() => {
        window.location.href = "/crm/login";
      });
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
