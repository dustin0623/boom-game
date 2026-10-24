// lib/api/dto.ts — shared helpers for mapping Mongoose documents to API DTOs.

/**
 * Mongoose `timestamps: true` fields (createdAt/updatedAt) are real `Date`
 * objects server-side, but `Response.json` runs `JSON.stringify` under the
 * hood, which serializes a `Date` to an ISO string — NOT the epoch-ms number
 * every DTO type (e.g. `LogDto.createdAt: number`) declares. Client code then
 * does arithmetic on it directly (`Date.now() - at`, `b.createdAt - a.createdAt`)
 * and silently gets NaN instead of a real duration.
 *
 * Always pass Mongoose `Date` fields through this before they leave a route
 * handler.
 */
export function toEpoch(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
