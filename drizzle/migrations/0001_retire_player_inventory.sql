-- player_inventory is unused: heroes are minted directly with coins, no chest stock exists.
COMMENT ON TABLE public.player_inventory IS 'DEPRECATED: no longer used by the app — heroes are minted directly with coins and stored in public.heroes';

-- The chest purchase/open functions only existed to maintain player_inventory.
DROP FUNCTION IF EXISTS public.buy_chest(uuid, text, bigint);
DROP FUNCTION IF EXISTS public.open_chest(uuid, text, jsonb);