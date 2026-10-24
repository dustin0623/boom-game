ALTER TABLE public.players ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS deposited_balance bigint NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS players_wallet_address_key ON public.players (wallet_address) WHERE wallet_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS players_username_key ON public.players (username) WHERE username IS NOT NULL;

CREATE TABLE public.player_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX player_inventory_player_item_key ON public.player_inventory (player_id, item_id);

GRANT ALL ON public.player_inventory TO service_role;
ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;