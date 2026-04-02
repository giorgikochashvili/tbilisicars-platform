import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetAdminMe, useAdminLogout, type AdminProfile } from "@workspace/api-client-react";
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

  const { mutate: logoutMutate } = useAdminLogout({
    request: { credentials: "include" }
  });

  useEffect(() => {
    if (isError) {
      setLocation("/login");
    }
  }, [isError, setLocation]);

  const logout = () => {
    logoutMutate(undefined, {
      onSuccess: () => {
        const base = import.meta.env.BASE_URL as string;
        window.location.href = (base.endsWith("/") ? base : base + "/") + "login";
      }
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
