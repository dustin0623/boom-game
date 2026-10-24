import { GET as transactions } from "@/app/api/transactions/route";
import { GET as inventory } from "@/app/api/items/route";
import { GET as profile } from "@/app/api/player/me/route";
import { GET as raidTargets } from "@/app/api/game/raid/targets/route";
import type { Rival } from "@/features/types/game/types";
import type { HistoryOptions } from "@/lib/utils/logs/history";
import type {
  EquipmentDto,
  PlayerDto,
  PendingTxDto,
  SettledTxDto,
} from "@/lib/api/types";

function request(path: string, wallet: string, query: URLSearchParams) {
  return new Request(`http://localhost${path}?${query}`, {
    headers: { "x-test-wallet": wallet },
  });
}

async function result(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "API read failed");
  return body;
}

/** Callers mock session resolution; these helpers exercise the actual read routes. */
export async function readTransactions(
  wallet: string,
  options: HistoryOptions,
) {
  const query = new URLSearchParams({ limit: String(options.limit) });
  if (options.direction) query.set("direction", options.direction);
  if (options.cursor) query.set("cursor", JSON.stringify(options.cursor));
  return (await result(
    await transactions(request("/api/transactions", wallet, query)),
  )) as {
    pending: PendingTxDto[];
    history: SettledTxDto[];
    nextCursor: string | null;
    latestCursor: string | null;
  };
}

export async function readInventory(wallet: string): Promise<EquipmentDto[]> {
  return (
    await result(
      await inventory(request("/api/items", wallet, new URLSearchParams())),
    )
  ).equipments;
}

export async function readPlayerProfile(
  wallet: string,
  refUsername: string | null,
): Promise<PlayerDto> {
  const query = new URLSearchParams();
  if (refUsername) query.set("ref", refUsername);
  return (await result(await profile(request("/api/player/me", wallet, query))))
    .player;
}

export async function readRaidTargets(wallet: string, hackPower: number): Promise<Rival[]> {
  const query = new URLSearchParams({ defense: String(hackPower) });
  return (await result(await raidTargets(request("/api/game/raid/targets", wallet, query)))).rivals;
}
