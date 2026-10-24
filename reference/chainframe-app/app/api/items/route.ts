import { requireSession } from "@/lib/auth/session";
import { jsonResponse } from "@/lib/api/cors";

import { findEquipmentsByOwner } from "@/lib/modules/equipments/server.repository";
import { toEquipmentDto } from "@/lib/api/dto/equipments";
import { findInventoryItemsByWallet } from "@/lib/modules/items/server.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) return auth;

  try {
    const [gear, stacks] = await Promise.all([
      findEquipmentsByOwner(auth.wallet),
      findInventoryItemsByWallet(auth.wallet),
    ]);
    return jsonResponse(
      {
        ok: true,
        equipments: gear.map(toEquipmentDto),
        items: stacks.map(({ itemId, quantity }) => ({ itemId, quantity })),
      },
      request,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[items]", err);
    return jsonResponse(
      { ok: false, error: "Internal server error" },
      request,
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}
