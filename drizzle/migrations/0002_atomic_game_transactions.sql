-- Buy a chest: debit coins (balance-guarded) and add to inventory in one transaction.
CREATE OR REPLACE FUNCTION public.buy_chest(p_player_id uuid, p_item_id text, p_price bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins bigint;
  v_quantity int;
BEGIN
  UPDATE players
  SET coins = coins - p_price, updated_at = now()
  WHERE id = p_player_id AND coins >= p_price
  RETURNING coins INTO v_coins;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_enough_coins';
  END IF;

  INSERT INTO player_inventory (player_id, item_id, quantity)
  VALUES (p_player_id, p_item_id, 1)
  ON CONFLICT (player_id, item_id)
  DO UPDATE SET quantity = player_inventory.quantity + 1, updated_at = now()
  RETURNING quantity INTO v_quantity;

  RETURN jsonb_build_object('coins', v_coins, 'quantity', v_quantity);
END;
$$;

-- Open a chest: consume one (quantity-guarded) and append the rolled hero to the roster atomically.
CREATE OR REPLACE FUNCTION public.open_chest(p_player_id uuid, p_item_id text, p_hero jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
  v_count int;
BEGIN
  UPDATE player_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE player_id = p_player_id AND item_id = p_item_id AND quantity > 0
  RETURNING quantity INTO v_remaining;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chest_not_owned';
  END IF;

  SELECT jsonb_array_length(heroes) + 1 INTO v_count
  FROM players WHERE id = p_player_id FOR UPDATE;

  UPDATE players
  SET heroes = heroes || jsonb_build_array(p_hero || jsonb_build_object('name', 'Bomber #' || v_count)),
      updated_at = now()
  WHERE id = p_player_id;

  RETURN jsonb_build_object('remaining', v_remaining);
END;
$$;

-- Request a withdrawal: debit coins (balance-guarded) and queue the payout in one transaction.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_player_id uuid, p_amount bigint, p_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins bigint;
  v_tx uuid;
BEGIN
  UPDATE players
  SET coins = coins - p_amount, updated_at = now()
  WHERE id = p_player_id AND coins >= p_amount
  RETURNING coins INTO v_coins;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_enough_coins';
  END IF;

  INSERT INTO transactions_pending (player_id, action, payload)
  VALUES (p_player_id, 'withdraw', jsonb_build_object('amount', p_amount, 'address', p_address))
  RETURNING id INTO v_tx;

  RETURN jsonb_build_object('coins', v_coins, 'transaction_id', v_tx);
END;
$$;

-- Only the privileged server role may call these.
REVOKE EXECUTE ON FUNCTION public.buy_chest(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_chest(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_chest(uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.open_chest(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, bigint, text) TO service_role;