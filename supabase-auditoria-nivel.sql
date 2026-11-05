-- Auditoria só para encarregado ou superior (nível <= 5). Funcionário e promotor (nível > 5) não leem mais a auditoria da loja.
-- Gravar na auditoria continua igual (política de inserção não muda). Edge Functions/RPCs com service_role não são afetadas.
-- Rodar no SQL Editor do Supabase (não reaplicar supabase-seguranca.sql depois: ele volta a policy antiga; se reaplicar, rode este de novo).
do $$
begin
  drop policy if exists auditoria_sel on public.auditoria;
  create policy auditoria_sel on public.auditoria for select to authenticated
    using (public.loja_ok(loja_id) and coalesce(public.nivel_do_usuario(), 99) <= 5);

  -- auto-teste: a policy tem de conter a regra de nível
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='auditoria' and policyname='auditoria_sel'
      and qual like '%nivel_do_usuario%'
  ) then
    raise exception 'auto-teste falhou: policy auditoria_sel sem regra de nível';
  end if;
end $$;
