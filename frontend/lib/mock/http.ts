/** Mirrors the API's admin gate. Any non-empty token passes except "wrong", which exercises the UI's rejection path. */
export function requireAdmin(request: Request): Response | null {
  const token = request.headers.get("X-Admin-Token");
  if (!token) return Response.json({ detail: "Admin token required." }, { status: 401 });
  if (token === "wrong") return Response.json({ detail: "Admin token rejected." }, { status: 403 });
  return null;
}
