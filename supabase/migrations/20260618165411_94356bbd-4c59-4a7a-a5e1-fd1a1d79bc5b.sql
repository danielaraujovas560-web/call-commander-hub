-- Allow client users to see their cliente row through tenants_link
-- (clientes are now created without auth user; users are linked later via tenants_link)
DROP POLICY IF EXISTS clientes_select_own ON public.clientes;

CREATE POLICY clientes_select_linked ON public.clientes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants_link tl
      WHERE tl.user_id = auth.uid()
        AND tl.tenant_id = clientes.tenant_id
    )
  );