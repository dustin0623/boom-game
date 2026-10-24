/** Pure public operation decoding for Hive ingestion and signed-payload validation. */
export function readHiveOperation(
  raw: unknown,
): { name: string; value: Record<string, unknown> } | null {
  if (
    Array.isArray(raw) &&
    typeof raw[0] === "string" &&
    raw[1] &&
    typeof raw[1] === "object"
  ) {
    return { name: raw[0], value: raw[1] as Record<string, unknown> };
  }
  if (raw && typeof raw === "object" && "type" in raw && "value" in raw) {
    const entry = raw as { type: unknown; value: unknown };
    if (
      typeof entry.type === "string" &&
      entry.value &&
      typeof entry.value === "object"
    ) {
      return {
        name: entry.type.replace(/_operation$/, ""),
        value: entry.value as Record<string, unknown>,
      };
    }
  }
  return null;
}

export function readGameJson(raw: unknown): unknown {
  const operation = readHiveOperation(raw);
  if (
    operation?.name !== "custom_json" ||
    typeof operation.value.json !== "string"
  )
    throw new Error("Missing original Custom JSON");
  return JSON.parse(operation.value.json);
}
