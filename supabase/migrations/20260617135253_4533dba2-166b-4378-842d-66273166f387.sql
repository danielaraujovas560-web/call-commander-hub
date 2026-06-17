
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id integer NOT NULL UNIQUE,
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  email text NOT NULL,
  login text,
  quantidade_ramais integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clientes_user_id_idx ON public.clientes(user_id);
CREATE INDEX clientes_tenant_id_idx ON public.clientes(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY clientes_admin_all ON public.clientes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY clientes_select_own ON public.clientes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
