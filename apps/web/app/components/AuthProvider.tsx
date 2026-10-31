'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { UserInfo, getAuthConfig, setAuth, clearAuth, parseJwtClaims } from '../lib/auth';

interface AuthContextType {
  user: UserInfo | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  /** Dev-only: set auth headers manually for local testing without Keycloak */
  devLogin: (tenantId: string, userId: string, roles: string[]) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: false,
  login: () => {},
  logout: () => {},
  devLogin: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(() => {
    const config = getAuthConfig();
    const redirectUri = encodeURIComponent(window.location.origin + '/dashboard');
    window.location.href = `${config.url}/realms/${config.realm}/protocol/openid-connect/auth?client_id=${config.clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid profile email`;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    const config = getAuthConfig();
    const redirectUri = encodeURIComponent(window.location.origin);
    window.location.href = `${config.url}/realms/${config.realm}/protocol/openid-connect/logout?post_logout_redirect_uri=${redirectUri}&client_id=${config.clientId}`;
  }, []);

  const devLogin = useCallback((tenantId: string, userId: string, roles: string[]) => {
    const devUser: UserInfo = {
      sub: userId,
      email: `${userId}@demo.claimshield.local`,
      name: userId,
      tenantId,
      roles,
      token: 'dev-token',
    };
    setAuth('dev-token', devUser);
    setUser(devUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, devLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
