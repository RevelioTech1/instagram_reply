/** Paths that stay public: Meta webhook + liveness for the container. */
export const PUBLIC_PATH_PREFIXES = ["/api/instagram/webhook", "/api/health"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function panelCredentials(): { user: string; password: string } | null {
  const password = process.env.PANEL_PASSWORD?.trim() ?? "";
  if (!password) return null;
  const user = (process.env.PANEL_USER?.trim() || "admin").trim();
  return { user, password };
}

export function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header) return null;
  const match = /^Basic\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const decoded = atob(match[1]);
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

export function authorizePanelRequest(authorizationHeader: string | null): {
  ok: boolean;
  status: number;
  body: string;
  wwwAuthenticate?: string;
} {
  const expected = panelCredentials();
  if (!expected) {
    return { ok: false, status: 503, body: "panel password is not configured" };
  }
  const provided = parseBasicAuth(authorizationHeader);
  if (
    !provided ||
    !timingSafeEqualString(provided.user, expected.user) ||
    !timingSafeEqualString(provided.password, expected.password)
  ) {
    return {
      ok: false,
      status: 401,
      body: "authentication required",
      wwwAuthenticate: 'Basic realm="Iordani Instagram"',
    };
  }
  return { ok: true, status: 200, body: "ok" };
}
