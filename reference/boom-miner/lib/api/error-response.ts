/**
 * Shared API response helpers.
 *
 * All API routes use these helpers to guarantee a consistent shape:
 *   success: true  → { success: true, ...data }
 *   success: false → { success: false, error: string, code: string }
 *
 * The `code` field is a machine-readable slug clients can switch on.
 *
 * Usage:
 *   return apiOk({ player });
 *   return apiError("Player not found", "PLAYER_NOT_FOUND", 404);
 */

export function apiError(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json(
    { success: false, error, code, ...extra },
    { status },
  );
}

export function apiOk<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): Response {
  return Response.json({ success: true, ...data }, { status });
}
