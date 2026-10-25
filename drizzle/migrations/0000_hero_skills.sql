ALTER TABLE public.heroes ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}';

UPDATE public.heroes h SET skills = s.picked
FROM (
  SELECT id, (
    SELECT coalesce(array_agg(sk), '{}') FROM (
      SELECT sk FROM unnest(ARRAY['heavy_impact','stamina_saver','quick_rest','pierce','bonus_pay','sprint']) sk
      ORDER BY random()
      LIMIT CASE rarity WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 WHEN 'uncommon' THEN 1
        ELSE CASE WHEN random() < 0.2 THEN 1 ELSE 0 END END
    ) x
  ) AS picked
  FROM public.heroes WHERE cardinality(skills) = 0
) s WHERE h.id = s.id;

CREATE OR REPLACE FUNCTION public.mint_heroes(p_player_id uuid, p_cost bigint, p_heroes jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    INSERT INTO public.heroes (id, player_id, minted_number, name, type, rarity, power, speed, stamina, bomb_number, bomb_range, max_energy, energy, skills)
    VALUES ('hero-' || v_num, p_player_id, v_num, (v_hero->>'type') || ' #' || v_num,
      v_hero->>'type', v_hero->>'rarity',
      (v_hero->>'power')::int, (v_hero->>'speed')::int, (v_hero->>'stamina')::int,
      (v_hero->>'bombNumber')::int, (v_hero->>'bombRange')::int, (v_hero->>'maxEnergy')::int,
      (v_hero->>'maxEnergy')::int,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_hero->'skills', '[]'::jsonb))), '{}'))
    RETURNING * INTO v_row;
    v_minted := v_minted || jsonb_build_array(jsonb_build_object(
      'id', v_row.id, 'mintedNumber', v_row.minted_number, 'name', v_row.name, 'type', v_row.type,
      'rarity', v_row.rarity, 'power', v_row.power, 'speed', v_row.speed, 'stamina', v_row.stamina,
      'bombNumber', v_row.bomb_number, 'bombRange', v_row.bomb_range, 'maxEnergy', v_row.max_energy,
      'skills', to_jsonb(v_row.skills)));
  END LOOP;

  RETURN jsonb_build_object('coins', v_coins, 'heroes', v_minted);
END;
$function$;