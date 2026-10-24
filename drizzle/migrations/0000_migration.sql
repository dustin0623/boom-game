CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE,
  is_test boolean NOT NULL DEFAULT true,
  token_hash text NOT NULL,
  coins bigint NOT NULL DEFAULT 0,
  stage integer NOT NULL DEFAULT 1,
  seed bigint NOT NULL,
  destroyed_nodes text[] NOT NULL DEFAULT '{}',
  heroes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transactions_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_pending_status_idx ON public.transactions_pending (status, created_at);
GRANT ALL ON public.transactions_pending TO service_role;
ALTER TABLE public.transactions_pending ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transactions_processed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_id uuid UNIQUE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  action text NOT NULL,
  status text NOT NULL,
  tx_hash text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.transactions_processed TO service_role;
ALTER TABLE public.transactions_processed ENABLE ROW LEVEL SECURITY;

-- Claims up to p_limit pending rows; concurrent workers skip rows another worker holds.
CREATE OR REPLACE FUNCTION public.claim_pending_transactions(p_limit integer DEFAULT 20)
RETURNS SETOF public.transactions_pending
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.transactions_pending t
  SET status = 'processing', locked_at = now(), attempts = t.attempts + 1
  WHERE t.id IN (
    SELECT id FROM public.transactions_pending
    WHERE status = 'pending'
       OR (status = 'processing' AND locked_at < now() - interval '2 minutes')
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING t.*;
$$;
REVOKE ALL ON FUNCTION public.claim_pending_transactions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_transactions(integer) TO service_role;