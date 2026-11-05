-- Promotor só enxerga produtos, baixas e catálogo das marcas do convite dele; "acesso total" vê tudo.
-- Funcionário, encarregado e gerência não mudam. Rodar no SQL Editor do Supabase DEPOIS de supabase-promotor-marcas.sql e supabase-permissoes.sql.
-- Não reaplicar supabase-seguranca.sql / supabase-revisao.sql depois (voltam as policies antigas); se reaplicar, rode este de novo.

-- 1) o usuário logado é promotor? (uma consulta por comando, não por linha)
create or replace function public._sou_promotor()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.promotor from public.usuarios u where u.id = auth.uid()), false)
$$;

-- 2) o promotor logado pode ver este produto? Convite precisa existir, não estar revogado/vencido e ser da mesma loja do produto.
create or replace function public._promotor_ve(p_nome text, p_loja bigint)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_conv uuid; v_ok boolean;
begin
  select u.convite_id into v_conv from public.usuarios u where u.id = auth.uid() and u.promotor;
  if v_conv is null then return false; end if;
  select (not c.revogado and c.expira_em > now() and c.loja_id = p_loja) into v_ok
    from public.convites_promotor c where c.id = v_conv;
  if coalesce(v_ok, false) is not true then return false; end if;
  return public._produto_da_marca(p_nome, v_conv);
end $$;

revoke all on function public._sou_promotor() from public, anon;
revoke all on function public._promotor_ve(text, bigint) from public, anon;
grant execute on function public._sou_promotor() to authenticated;
grant execute on function public._promotor_ve(text, bigint) to authenticated;
drop function if exists public._promotor_ve(text);

do $$
declare v_prom uuid; v_conv uuid; v_func uuid; v_fora int; v_dentro int; v_hfora int; v_cfora int; v_total int;
begin
  drop policy if exists produtos_sel on public.produtos;
  create policy produtos_sel on public.produtos for select to authenticated
    using (public.loja_ok(loja_id) and ((select not public._sou_promotor()) or public._promotor_ve(nome, loja_id)));

  drop policy if exists historico_sel on public.historico;
  create policy historico_sel on public.historico for select to authenticated
    using (public.loja_ok(loja_id) and ((select not public._sou_promotor()) or public._promotor_ve(nome, loja_id)));

  drop policy if exists catalogo_sel on public.catalogo;
  create policy catalogo_sel on public.catalogo for select to authenticated
    using (public.loja_ok(loja_id) and ((select not public._sou_promotor()) or public._promotor_ve(nome, loja_id)));

  -- auto-teste 1: as 3 policies usam a regra do promotor
  if (select count(*) from pg_policies where schemaname='public' and policyname in ('produtos_sel','historico_sel','catalogo_sel')
        and qual like '%_promotor_ve%' and qual like '%_sou_promotor%') <> 3 then
    raise exception 'auto-teste falhou: policies sem a regra do promotor';
  end if;

  -- auto-teste 2: a função, com os claims de um promotor de marca específica, só aceita produtos da marca (e há pelo menos um aceito)
  select u.id, u.convite_id into v_prom, v_conv
    from public.usuarios u join public.convites_promotor c on c.id = u.convite_id
   where u.promotor and not c.acesso_total and not c.revogado and c.expira_em > now() limit 1;
  if v_prom is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_prom, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_prom::text, true);
    select count(*) filter (where public._promotor_ve(nome, loja_id) and not public._produto_da_marca(nome, v_conv)),
           count(*) filter (where public._promotor_ve(nome, loja_id)),
           count(*) into v_fora, v_dentro, v_total from public.produtos;
    select count(*) filter (where public._promotor_ve(nome, loja_id) and not public._produto_da_marca(nome, v_conv)) into v_hfora from public.historico;
    select count(*) filter (where public._promotor_ve(nome, loja_id) and not public._produto_da_marca(nome, v_conv)) into v_cfora from public.catalogo;
    if not public._sou_promotor() then raise exception 'auto-teste falhou: _sou_promotor deveria ser verdadeiro'; end if;
    if v_fora <> 0 or v_hfora <> 0 or v_cfora <> 0 then
      raise exception 'auto-teste falhou: promotor aceito em outras marcas (produtos %, baixas %, catálogo %)', v_fora, v_hfora, v_cfora;
    end if;
    if v_dentro = 0 and exists (select 1 from public.produtos p where public._produto_da_marca(p.nome, v_conv)) then
      raise exception 'auto-teste falhou: promotor não vê nem os produtos da própria marca';
    end if;
    raise notice 'auto-teste ok: promotor aceito em % de % produtos (só da marca dele)', v_dentro, v_total;
  else
    raise notice 'auto-teste 2: nenhum promotor com marca específica e convite válido para simular';
  end if;

  -- auto-teste 3: quem não é promotor não é afetado
  select u.id into v_func from public.usuarios u where not coalesce(u.promotor, false) limit 1;
  if v_func is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_func, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_func::text, true);
    if public._sou_promotor() then raise exception 'auto-teste falhou: funcionário tratado como promotor'; end if;
  end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
