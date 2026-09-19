export class HttpError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function errorResponse(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof HttpError ? error.status : 400;
  return Response.json({ error: message }, { status });
}
