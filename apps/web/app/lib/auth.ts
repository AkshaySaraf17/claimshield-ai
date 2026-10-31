/**
 * Keycloak OIDC authentication for ClaimShield.
 *
 * Uses keycloak-js for client-side auth. The JWT token is passed to
 * API calls via Authorization header. APISIX validates the token and
 * forwards claims as X-Tenant-Id, X-User-Id, X-User-Roles headers.
 */

export interface AuthConfig {
  url: string;
  realm: string;
  clientId: string;
}

export interface UserInfo {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  token: string;
}

const AUTH_CONFIG: AuthConfig = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'claimshield',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'claimshield-web',
};

let _token: string | null = null;
let _userInfo: UserInfo | null = null;
let _refreshTimer: ReturnType<typeof setInterval> | null = null;

export function getAuthConfig(): AuthConfig {
  return AUTH_CONFIG;
}

export function getToken(): string | null {
  return _token;
}

export function getUserInfo(): UserInfo | null {
  return _userInfo;
}

export function isAuthenticated(): boolean {
  return _token !== null;
}

export function setAuth(token: string, userInfo: UserInfo): void {
  _token = token;
  _userInfo = userInfo;
}

export function clearAuth(): void {
  _token = null;
  _userInfo = null;
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

/**
 * Parse JWT claims without a library — we only need the payload for display.
 * Token validation is done server-side by APISIX.
 */
export function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

/**
 * Build an authenticated fetch wrapper that includes the JWT.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}
