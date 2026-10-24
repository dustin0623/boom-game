import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, PackageX, RefreshCw } from "lucide-react";
import { Root as Tabs } from "@radix-ui/react-tabs";

import {
  EquipmentActionDialog,
  type EquipmentActionRequest,
} from "@/components/modals/EquipmentActionDialog";
import { InventoryItemCard } from "@/components/cards/InventoryItemCard";
import { ChestModal } from "@/components/modals/ChestModal";
import { EquipmentGrid } from "@/components/game/EquipmentGrid";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Root as AlertDialog } from "@radix-ui/react-alert-dialog";
import { Input } from "@/components/ui/input";
import {
  EQUIPMENT_CHEST_ID,
  RARITY_META,
  SLOT_META,
} from "@/lib/config/constants/game";
import { MARKET_FEE } from "@/lib/config/constants/economy";
import { INVENTORY_ITEM_IDS } from "@/features/types/game/inventory";
import { hiveAmountSchema, getMarketAmounts } from "@/lib/utils/game/pricing";

import { formatHash } from "@/lib/format";
import { slotIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api/client";
import { useInventoryStore } from "@/features/stores/inventoryStore";
import { useAuthStore } from "@/features/stores/authStore";
import { useWorkerStore } from "@/features/stores/workerStore";
import { useTransactionStore } from "@/features/stores/transactionStore";
import { notify } from "@/lib/notify";
import type { Equipment } from "@/features/types/game/types";

/** Item identity header used at the top of the sell dialog. */
function ItemSummary({ item }: { item: Equipment }) {
  const rarity = RARITY_META[item.rarity];
  const Icon = slotIcon(item.slot);
  return (
    <div className="flex gap-3 border-b border-border pb-4">
      <span
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-xl",
          rarity.bgClass,
          rarity.textClass,
        )}
      >
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {item.name}
          <span className={cn("text-[10px] uppercase", rarity.textClass)}>
            {rarity.label}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {SLOT_META[item.slot].label} · Level {item.level}
        </p>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const inventory = useInventoryStore((state) => state.inventory);
  const items = useInventoryStore((state) => state.items);
  const loaded = useInventoryStore((state) => state.loaded);
  const inventoryError = useInventoryStore((state) => state.error);
  const mode = useAuthStore((state) => state.mode);
  const address = useAuthStore((state) => state.address);
  const connectedAt = useAuthStore((state) => state.connectedAt);
  const apiConnected = useAuthStore((state) => state.apiConnected);
  const registered = useAuthStore((state) => state.isRegistered === true);
  const workerAvailable = useWorkerStore((state) => state.available === true);
  const unresolved = useTransactionStore((state) =>
    Object.keys(state.submissionLocks).some((key) =>
      key.startsWith("game:open_chest:"),
    ),
  );
  const session = JSON.stringify([mode, address, connectedAt, apiConnected]);
  const authenticated = mode === "wallet" && !!address && apiConnected === true;
  const [tab, setTab] = useState("items");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshLock = useRef<{ session: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const openingLock = useRef<{ session: string } | null>(null);
  const [reward, setReward] = useState<Equipment | null>(null);
  const [focusChest, setFocusChest] = useState(false);
  const chestButton = useRef<HTMLButtonElement>(null);
  const chestCard = useRef<HTMLElement>(null);
  const error = inventoryError ?? refreshError;
  const authoritative = authenticated && loaded && !error;
  const chestQuantity = items[EQUIPMENT_CHEST_ID] ?? 0;
  const ownedItems = INVENTORY_ITEM_IDS.filter((id) => (items[id] ?? 0) > 0);

  const [request, setRequest] = useState<EquipmentActionRequest | null>(null);
  const [sellItem, setSellItem] = useState<Equipment | null>(null);
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setTab("items");
    setRequest(null);
    setSellItem(null);
    setSubmitting(false);
    setSellError(null);
    setPrice("");
    setOpening(false);
    setReward(null);
    setRefreshing(false);
    setRefreshError(null);
    setFocusChest(false);
    refreshLock.current = null;
    openingLock.current = null;
  }, [session]);

  useEffect(() => {
    if (!focusChest || tab !== "items") return;
    if (chestButton.current && !chestButton.current.disabled)
      chestButton.current.focus();
    else chestCard.current?.focus();
    setFocusChest(false);
  }, [focusChest, tab]);

  useEffect(() => {
    if (loaded && !inventoryError) setRefreshError(null);
  }, [inventory, items, loaded, inventoryError]);

  const currentSession = () => {
    const origin = { address, mode, connectedAt };
    return () => {
      const current = useAuthStore.getState();
      return (
        mounted.current &&
        current.apiConnected === true &&
        current.address === origin.address &&
        current.mode === origin.mode &&
        current.connectedAt === origin.connectedAt
      );
    };
  };

  const refresh = async () => {
    if (!authenticated || refreshLock.current?.session === session) return;
    const isCurrent = currentSession();
    if (!isCurrent()) return;
    const lock = { session };
    refreshLock.current = lock;
    setRefreshing(true);
    try {
      const ok = await useInventoryStore.getState().syncFromApi();
      if (isCurrent()) setRefreshError(ok ? null : "Inventory refresh failed.");
    } catch {
      if (isCurrent()) setRefreshError("Inventory refresh failed.");
    } finally {
      if (refreshLock.current === lock) {
        refreshLock.current = null;
        if (isCurrent()) setRefreshing(false);
      }
    }
  };

  const openChest = async () => {
    if (
      !authoritative ||
      !registered ||
      !workerAvailable ||
      !chestQuantity ||
      opening ||
      openingLock.current?.session === session ||
      unresolved
    )
      return;
    const isCurrent = currentSession();
    if (!isCurrent()) return;
    const lock = { session };
    openingLock.current = lock;
    setOpening(true);
    setReward(null);
    let submitted = false;
    try {
      const result = await api.openChest(EQUIPMENT_CHEST_ID, () => {
        submitted = true;
        if (isCurrent()) setOpening(false);
      });
      if (!isCurrent()) return;
      if (!result.ok) {
        if (!submitted)
          notify(result.error ?? "Chest opening failed", "danger");
        return;
      }
      // Personal history confirms and refreshes inventory before this resolves.
      const snapshot = useInventoryStore.getState();
      if (!snapshot.loaded || snapshot.error) return;
      const minted = snapshot.inventory.find(
        (item) => item.id === result.itemId,
      );
      if (minted) setReward(minted);
    } finally {
      if (openingLock.current === lock) openingLock.current = null;
      if (isCurrent()) setOpening(false);
    }
  };

  useEffect(() => {
    if (sellItem) {
      setPrice("");
      setSellError(null);
    }
  }, [sellItem]);

  const listPrice = Number(price);
  const priceValid = hiveAmountSchema.safeParse(listPrice).success;
  const net = priceValid ? getMarketAmounts(listPrice).proceeds : 0;

  const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrice(event.target.value);
  };

  const confirmSell = async () => {
    if (!sellItem || submitting || !priceValid || !authoritative) return;
    const isCurrent = currentSession();
    if (!isCurrent()) return;
    let submitted = false;
    setSellError(null);
    setSubmitting(true);
    try {
      // Selling is server-authoritative: the item is listed on the real
      // marketplace (visible to every player on the Marketplace page), not
      // just simulated in a local store. Equipped or already-listed items
      // are rejected server-side.
      const result = await api.listMarketItem(sellItem.id, listPrice, () => {
        submitted = true;
        if (isCurrent()) setSellItem(null);
      });
      if (!result.ok && !submitted && isCurrent()) {
        setSellError(result.error ?? "Could not list this item for sale");
        return;
      }
      // Inventory is refreshed by personal history before confirmation resolves.
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
  };

  const requestEquipmentAction = (
    kind: EquipmentActionRequest["kind"],
    item: Equipment,
  ) => {
    if (authoritative && currentSession()()) setRequest({ kind, item });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-5">
      <PageHeader
        title="Inventory"
        description="Your chests, consumables and equipment. Open owned chests, build your rig, and manage your gear."
      >
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/shop">Visit Shop</Link>
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!authenticated || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
            aria-hidden="true"
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </PageHeader>

      <TabsList
        aria-label="Inventory sections"
        className="grid h-auto min-h-11 w-full grid-cols-2"
      >
        <TabsTrigger value="items" className="min-h-11">
          Items
        </TabsTrigger>
        <TabsTrigger value="equipment" className="min-h-11">
          Equipment
        </TabsTrigger>
      </TabsList>

      {error ? (
        <div
          role="status"
          className="card-soft flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
        >
          <p>
            {loaded
              ? "Inventory refresh failed; showing stale inventory. Refresh before using items or equipment."
              : "Inventory is unavailable. Try again."}
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={refreshing || !authenticated}
            onClick={() => void refresh()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <TabsContent value="items" forceMount hidden={tab !== "items"}>
        {!authenticated || (!loaded && !error) ? (
          <p
            role="status"
            className="card-soft p-6 text-sm text-muted-foreground"
            aria-busy="true"
          >
            Loading inventory…
          </p>
        ) : loaded && ownedItems.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ownedItems.map((itemId) => (
              <InventoryItemCard
                key={itemId}
                itemId={itemId}
                quantity={items[itemId]!}
                cardRef={itemId === EQUIPMENT_CHEST_ID ? chestCard : undefined}
              >
                {itemId === EQUIPMENT_CHEST_ID ? (
                  <>
                    <Button
                      ref={chestButton}
                      className="min-h-11 w-full whitespace-normal"
                      disabled={
                        !authoritative ||
                        !registered ||
                        !workerAvailable ||
                        opening ||
                        unresolved
                      }
                      onClick={() => void openChest()}
                    >
                      {opening
                        ? "Awaiting Keychain approval…"
                        : unresolved
                          ? "Awaiting confirmation…"
                          : "Open one"}
                    </Button>
                    {!workerAvailable ? (
                      <p className="text-xs text-muted-foreground">
                        Game processing is unavailable.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </InventoryItemCard>
            ))}
          </div>
        ) : !error && loaded ? (
          <div className="card-soft flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <PackageX className="size-8" aria-hidden="true" />
            <p>No owned items yet. Buy chests and consumables in Shop.</p>
            <Button asChild className="min-h-11">
              <Link href="/shop">Visit Shop</Link>
            </Button>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="equipment" forceMount hidden={tab !== "equipment"}>
        <EquipmentGrid
          key={session}
          items={inventory}
          loaded={authenticated && loaded}
          unavailable={!!error}
          actionsDisabled={!authoritative}
          hasOwnedChests={authoritative && chestQuantity > 0}
          onViewChests={() => {
            setTab("items");
            setFocusChest(true);
          }}
          onEquip={(entry) => requestEquipmentAction("equip", entry)}
          onUnequip={(entry) => requestEquipmentAction("unequip", entry)}
          onUpgrade={(entry) => requestEquipmentAction("upgrade", entry)}
          onSalvage={(entry) => requestEquipmentAction("salvage", entry)}
          onSell={
            mode === "wallet"
              ? (entry) => {
                  if (authoritative && currentSession()()) setSellItem(entry);
                }
              : undefined
          }
        />
      </TabsContent>

      <ChestModal
        open={reward !== null}
        chest={EQUIPMENT_CHEST_ID}
        reward={reward}
        onClose={() => setReward(null)}
      />

      <AlertDialog
        open={sellItem !== null}
        onOpenChange={(open) => (open || submitting ? null : setSellItem(null))}
      >
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          {sellItem ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>List For Sale</AlertDialogTitle>
                <AlertDialogDescription className="sr-only">
                  sell {sellItem.name}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <ItemSummary item={sellItem} />

              <div className="space-y-3">
                <p className="text-sm">
                  List this item in HIVE on the marketplace. Other miners can
                  buy it. When it sells, you receive the price minus a{" "}
                  {Math.round(MARKET_FEE * 100)}% marketplace fee.
                </p>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Price:</p>
                  <div className="flex overflow-hidden rounded-md border border-input">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.001"
                      value={price}
                      onChange={handlePriceChange}
                      className="rounded-none border-0 focus-visible:ring-0"
                    />
                    <span className="grid shrink-0 place-items-center border-l border-input bg-secondary px-3 text-xs font-semibold">
                      HIVE
                    </span>
                  </div>
                  <p className="mt-1.5 text-right text-xs text-muted-foreground">
                    Up to three decimals. When sold you receive{" "}
                    <span className="font-semibold text-success">
                      {formatHash(net, 3)} HIVE
                    </span>{" "}
                    after fees.
                  </p>
                </div>
              </div>

              {sellError ? (
                <p role="alert" className="text-xs text-destructive">
                  {sellError}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    // Keep the form visible for Keychain approval; a known
                    // submission closes it before settlement.
                    event.preventDefault();
                    void confirmSell();
                  }}
                  disabled={submitting || !priceValid || !authoritative}
                >
                  {submitting ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Awaiting Keychain approval…
                    </>
                  ) : (
                    "Confirm"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      <EquipmentActionDialog
        request={request}
        actionsDisabled={!authoritative}
        onClose={() => setRequest(null)}
      />
    </Tabs>
  );
}
