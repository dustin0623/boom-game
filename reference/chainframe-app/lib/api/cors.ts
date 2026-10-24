const CORS_ORIGINS = process.env["CORS_ORIGINS"]
  ? process.env["CORS_ORIGINS"].split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:8080", "http://localhost:5173"];

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin =
    CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes("*")
      ? origin || "*"
      : (CORS_ORIGINS[0] ?? "*");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsPreflight(request: Request): Response | undefined {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  return undefined;
}

export function jsonResponse(
  body: unknown,
  request: Request,
  init: ResponseInit = {},
): Response {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders(request), ...(init.headers ?? {}) },
  });
}
