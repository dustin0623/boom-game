CREATE SEQUENCE IF NOT EXISTS public.hero_minted_number_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.hero_minted_number_seq TO service_role;

-- Mint heroes with in-game coins: debit (balance-guarded), assign global sequential numbers, append to roster.
CREATE OR REPLACE FUNCTION public.mint_heroes(p_player_id uuid, p_cost bigint, p_heroes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins bigint;
  v_minted jsonb := '[]'::jsonb;
  v_hero jsonb;
  v_num bigint;
BEGIN
  UPDATE players SET coins = coins - p_cost, updated_at = now()
  WHERE id = p_player_id AND coins >= p_cost
  RETURNING coins INTO v_coins;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_enough_coins'; END IF;

  FOR v_hero IN SELECT * FROM jsonb_array_elements(p_heroes) LOOP
    v_num := nextval('public.hero_minted_number_seq');
    v_minted := v_minted || jsonb_build_array(v_hero || jsonb_build_object(
      'id', 'hero-' || v_num, 'mintedNumber', v_num, 'name', (v_hero->>'type') || ' #' || v_num));
  END LOOP;

  UPDATE players SET heroes = heroes || v_minted WHERE id = p_player_id;
  RETURN jsonb_build_object('coins', v_coins, 'heroes', v_minted);
END;
$$;

-- Save progress atomically: only keys not yet destroyed are credited, so retries and overlapping saves never double-pay.
CREATE OR REPLACE FUNCTION public.save_progress(p_player_id uuid, p_seed bigint, p_rewards jsonb, p_total_chests int, p_new_seed bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row players%ROWTYPE;
  v_new text[];
  v_coins bigint;
  v_destroyed text[];
  v_chests int;
BEGIN
  SELECT * INTO v_row FROM players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_player'; END IF;
  IF v_row.seed <> p_seed THEN
    RETURN jsonb_build_object('coins', v_row.coins, 'stage', v_row.stage, 'seed', v_row.seed,
      'destroyed', to_jsonb(v_row.destroyed_nodes), 'accepted', 0);
  END IF;

  SELECT coalesce(array_agg(k), '{}') INTO v_new
  FROM jsonb_object_keys(p_rewards) k WHERE NOT (k = ANY(v_row.destroyed_nodes));
  SELECT coalesce(sum((p_rewards->>k)::bigint), 0) INTO v_coins FROM unnest(v_new) k;
  v_destroyed := v_row.destroyed_nodes || v_new;

  -- Rewards > 0 mark chests; count chests destroyed to detect a cleared stage.
  SELECT count(*) INTO v_chests FROM unnest(v_destroyed) k WHERE coalesce((p_rewards->>k)::bigint, -1) >= 0 AND p_rewards ? k AND (p_rewards->>k)::bigint > 0;

  IF p_total_chests > 0 AND (SELECT count(*) FROM jsonb_each_text(p_rewards) WHERE value = 'cleared') > 0 THEN
    NULL;
  END IF;

  UPDATE players SET
    coins = coins + v_coins,
    destroyed_nodes = CASE WHEN p_new_seed > 0 THEN '{}' ELSE v_destroyed END,
    stage = CASE WHEN p_new_seed > 0 THEN stage + 1 ELSE stage END,
    seed = CASE WHEN p_new_seed > 0 THEN p_new_seed ELSE seed END,
    last_sync_at = now(), updated_at = now()
  WHERE id = p_player_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('coins', v_row.coins, 'stage', v_row.stage, 'seed', v_row.seed,
    'destroyed', to_jsonb(v_row.destroyed_nodes), 'accepted', coalesce(array_length(v_new, 1), 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mint_heroes(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.save_progress(uuid, bigint, jsonb, int, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_heroes(uuid, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_progress(uuid, bigint, jsonb, int, bigint) TO service_role;