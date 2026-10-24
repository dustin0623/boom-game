-- Heroes get their own table (roster + live energy/deploy state).
CREATE TABLE public.heroes (
  id text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  minted_number bigint,
  name text NOT NULL,
  type text NOT NULL,
  rarity text NOT NULL,
  power integer NOT NULL,
  speed integer NOT NULL,
  stamina integer NOT NULL,
  bomb_number integer NOT NULL,
  bomb_range integer NOT NULL,
  max_energy integer NOT NULL,
  energy integer NOT NULL,
  on_map boolean NOT NULL DEFAULT false,
  recovery_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.heroes TO service_role;
ALTER TABLE public.heroes ENABLE ROW LEVEL SECURITY;
CREATE INDEX heroes_player_id_idx ON public.heroes (player_id);

-- Stage maps get their own table (one row per player).
CREATE TABLE public.stage_maps (
  player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1,
  seed bigint NOT NULL,
  destroyed_nodes text[] NOT NULL DEFAULT '{}',
  last_sync_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT ALL ON public.stage_maps TO service_role;
ALTER TABLE public.stage_maps ENABLE ROW LEVEL SECURITY;

-- Backfill heroes from the old JSON roster (player-prefixed ids: starter ids repeat per player).
INSERT INTO public.heroes (id, player_id, minted_number, name, type, rarity, power, speed, stamina, bomb_number, bomb_range, max_energy, energy)
SELECT p.id::text || ':' || (h->>'id'), p.id,
       NULLIF(h->>'mintedNumber', '')::bigint,
       coalesce(h->>'name', 'Bomber'),
       h->>'type', h->>'rarity',
       (h->>'power')::int, (h->>'speed')::int, (h->>'stamina')::int,
       (h->>'bombNumber')::int, (h->>'bombRange')::int, (h->>'maxEnergy')::int,
       (h->>'maxEnergy')::int
FROM public.players p
CROSS JOIN LATERAL jsonb_array_elements(p.heroes) h
ON CONFLICT (id) DO NOTHING;

-- Backfill stage maps from the old player columns.
INSERT INTO public.stage_maps (player_id, stage, seed, destroyed_nodes, last_sync_at)
SELECT id, stage, seed, destroyed_nodes, last_sync_at FROM public.players
ON CONFLICT (player_id) DO NOTHING;

-- save_progress now writes coins to players and progress to stage_maps.
CREATE OR REPLACE FUNCTION public.save_progress(p_player_id uuid, p_seed bigint, p_rewards jsonb, p_total_chests integer, p_new_seed bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_map public.stage_maps%ROWTYPE;
  v_new text[];
  v_coins bigint;
  v_destroyed text[];
  v_total bigint;
BEGIN
  SELECT * INTO v_map FROM public.stage_maps WHERE player_id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_player'; END IF;
  IF v_map.seed <> p_seed THEN
    RETURN jsonb_build_object('coins', (SELECT coins FROM public.players WHERE id = p_player_id),
      'stage', v_map.stage, 'seed', v_map.seed, 'destroyed', to_jsonb(v_map.destroyed_nodes), 'accepted', 0);
  END IF;

  SELECT coalesce(array_agg(k), '{}') INTO v_new
  FROM jsonb_object_keys(p_rewards) k WHERE NOT (k = ANY(v_map.destroyed_nodes));
  SELECT coalesce(sum((p_rewards->>k)::bigint), 0) INTO v_coins FROM unnest(v_new) k;
  v_destroyed := v_map.destroyed_nodes || v_new;

  UPDATE public.players SET coins = coins + v_coins, updated_at = now()
  WHERE id = p_player_id;

  UPDATE public.stage_maps SET
    destroyed_nodes = CASE WHEN p_new_seed > 0 THEN '{}' ELSE v_destroyed END,
    stage = CASE WHEN p_new_seed > 0 THEN stage + 1 ELSE stage END,
    seed = CASE WHEN p_new_seed > 0 THEN p_new_seed ELSE seed END,
    last_sync_at = now(), updated_at = now()
  WHERE player_id = p_player_id
  RETURNING * INTO v_map;

  SELECT coins INTO v_total FROM public.players WHERE id = p_player_id;
  RETURN jsonb_build_object('coins', v_total, 'stage', v_map.stage, 'seed', v_map.seed,
    'destroyed', to_jsonb(v_map.destroyed_nodes), 'accepted', coalesce(array_length(v_new, 1), 0));
END;
$function$;

-- mint_heroes now inserts rows into public.heroes instead of appending JSON.
CREATE OR REPLACE FUNCTION public.mint_heroes(p_player_id uuid, p_cost bigint, p_heroes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coins bigint;
  v_minted jsonb := '[]'::jsonb;
  v_hero jsonb;
  v_num bigint;
  v_row public.heroes%ROWTYPE;
BEGIN
  UPDATE public.players SET coins = coins - p_cost, updated_at = now()
  WHERE id = p_player_id AND coins >= p_cost
  RETURNING coins INTO v_coins;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enough_coins'; END IF;

  FOR v_hero IN SELECT * FROM jsonb_array_elements(p_heroes) LOOP
    v_num := nextval('public.hero_minted_number_seq');
    INSERT INTO public.heroes (id, player_id, minted_number, name, type, rarity, power, speed, stamina, bomb_number, bomb_range, max_energy, energy)
    VALUES ('hero-' || v_num, p_player_id, v_num, (v_hero->>'type') || ' #' || v_num,
      v_hero->>'type', v_hero->>'rarity',
      (v_hero->>'power')::int, (v_hero->>'speed')::int, (v_hero->>'stamina')::int,
      (v_hero->>'bombNumber')::int, (v_hero->>'bombRange')::int, (v_hero->>'maxEnergy')::int,
      (v_hero->>'maxEnergy')::int)
    RETURNING * INTO v_row;
    v_minted := v_minted || jsonb_build_array(jsonb_build_object(
      'id', v_row.id, 'mintedNumber', v_row.minted_number, 'name', v_row.name, 'type', v_row.type,
      'rarity', v_row.rarity, 'power', v_row.power, 'speed', v_row.speed, 'stamina', v_row.stamina,
      'bombNumber', v_row.bomb_number, 'bombRange', v_row.bomb_range, 'maxEnergy', v_row.max_energy));
  END LOOP;

  RETURN jsonb_build_object('coins', v_coins, 'heroes', v_minted);
END;
$function$;

-- Persist live hero energy / deploy state from the game client.
CREATE OR REPLACE FUNCTION public.save_heroes_state(p_player_id uuid, p_heroes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hero jsonb;
  v_updated int := 0;
BEGIN
  FOR v_hero IN SELECT * FROM jsonb_array_elements(p_heroes) LOOP
    UPDATE public.heroes SET
      energy = greatest(0, least(max_energy, (v_hero->>'energy')::int)),
      on_map = (v_hero->>'onMap')::boolean,
      recovery_at = to_timestamp((v_hero->>'recoveryAt')::bigint / 1000.0),
      updated_at = now()
    WHERE id = v_hero->>'id' AND player_id = p_player_id;
    v_updated := v_updated + 1;
  END LOOP;
  RETURN jsonb_build_object('updated', v_updated);
END;
$function$;

-- Old columns/tables/functions are retired: mark them so they read as intentional.
COMMENT ON COLUMN public.players.heroes IS 'DEPRECATED: replaced by the public.heroes table';
COMMENT ON COLUMN public.players.seed IS 'DEPRECATED: replaced by public.stage_maps.seed';
COMMENT ON COLUMN public.players.stage IS 'DEPRECATED: replaced by public.stage_maps.stage';
COMMENT ON COLUMN public.players.destroyed_nodes IS 'DEPRECATED: replaced by public.stage_maps.destroyed_nodes';
COMMENT ON COLUMN public.players.last_sync_at IS 'DEPRECATED: replaced by public.stage_maps.last_sync_at';
COMMENT ON TABLE public.player_inventory IS 'DEPRECATED: chests removed; heroes are minted directly with coins';
COMMENT ON FUNCTION public.buy_chest(uuid, text, bigint) IS 'DEPRECATED: chests removed; heroes are minted directly with coins';
COMMENT ON FUNCTION public.open_chest(uuid, text, jsonb) IS 'DEPRECATED: chests removed; heroes are minted directly with coins';