export class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function errorResponse(error: unknown, fallback = "Request failed") {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    const issues = "issues" in error && Array.isArray(error.issues) ? error.issues.slice(0, 8).map((issue: { path?: PropertyKey[]; message?: string }) => `${issue.path?.join(".") || "request"}: ${issue.message || "Invalid value"}`) : [];
    return Response.json({ error: issues.length ? issues.join("; ") : "Invalid request." }, { status: 400 });
  }
  const diagnostic = error && typeof error === "object" ? { name: "name" in error ? String(error.name) : "Error", code: "code" in error ? String(error.code) : undefined } : { name: typeof error };
  console.error(fallback, diagnostic);
  return Response.json({ error: fallback }, { status: 500 });
}
