import { jsonResponse } from "@/lib/api/cors";
import { findListedEquipments } from "@/lib/modules/equipments/server.repository";
import { toMarketplaceListing } from "@/lib/api/dto/equipments";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }
  try {
    const listings = (await findListedEquipments())
      .map(toMarketplaceListing)
      .sort((a, b) => b.listedAt - a.listedAt);

    return jsonResponse({ ok: true, listings }, request, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[market]", err);
    return jsonResponse(
      { ok: false, error: "Internal server error" },
      request,
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}
