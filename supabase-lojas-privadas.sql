-- ============================================================================
-- Bipi Validade — lojas e cargos deixam de ser públicos (2026-11-18)
-- Motivo: para o teste público, outra rede NÃO pode listar as lojas (nome, bairro,
-- cidade, rua) só por abrir o app. Hoje `anon` (nem logado) lê `lojas` e `cargos`.
-- O app só lê essas tabelas DEPOIS do login (conferido no código), então nada quebra.
--
-- O que muda:
--  1) lojas: só enxerga a própria loja (ou todas, se for gestão global/DEV).
--  2) cargos: só quem está logado (a lista de cargos não é sigilosa, mas não precisa ser pública).
--  3) anon perde o SELECT em lojas/cargos (única exceção que existia no banco).
--  4) Policies que estavam para {public} passam a ser só {authenticated} (a regra de dentro
--     já negava anônimo; agora fica explícito e some o aviso do linter).
-- Tem AUTO-TESTE: se qualquer conferência falhar, tudo é desfeito.
-- NÃO reaplicar supabase-seguranca.sql depois (recria lojas_sel/cargos_sel abertas).
-- ============================================================================

-- 1) lojas
drop policy if exists lojas_sel on public.lojas;
create policy lojas_sel on public.lojas for select to authenticated
  using (public.eh_gestao_global() or id = public.loja_do_usuario() or public.loja_ok(id));

-- 2) cargos
drop policy if exists cargos_sel on public.cargos;
create policy cargos_sel on public.cargos for select to authenticated using (true);

-- 3) anon sem acesso às duas tabelas
revoke all on public.lojas  from anon;
revoke all on public.cargos from anon;

-- 4) policies que valiam para {public}: só logado
alter policy "gestao cria convites"        on public.convites_promotor   to authenticated;
alter policy resumo_sel                    on public.resumo_lojas_rede   to authenticated;
alter policy tg_sessoes_ver                on public.telegram_sessoes    to authenticated;
alter policy tg_vinculos_ver               on public.telegram_vinculos   to authenticated;
alter policy valid_alt_sel                 on public.validade_alteracoes to authenticated;

-- ============================ AUTO-TESTE ====================================
do $$
declare n_lojas bigint; n_cargos bigint; n_total bigint; u uuid; n_publico int; ok boolean;
begin
  select count(*) into n_total from public.lojas;

  -- (a) visitante sem login (role anon) não lê nada
  begin
    set local role anon;
    perform 1 from public.lojas limit 1;
    reset role;
    raise exception 'FALHOU: anon ainda lê lojas';
  exception when insufficient_privilege then reset role;
  end;
  begin
    set local role anon;
    perform 1 from public.cargos limit 1;
    reset role;
    raise exception 'FALHOU: anon ainda lê cargos';
  exception when insufficient_privilege then reset role;
  end;

  -- (b) desconhecido logado como anônimo (sem perfil): não vê loja nenhuma
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated","is_anonymous":true}',true);
  set local role authenticated;
  select count(*) into n_lojas from public.lojas;
  select count(*) into n_cargos from public.cargos;
  reset role;
  if n_lojas <> 0 then raise exception 'FALHOU: desconhecido vê % lojas', n_lojas; end if;
  if n_cargos = 0 then raise exception 'FALHOU: logado não vê cargos'; end if;

  -- (c) usuário real e ativo (nível >= 3, sem gestão global) vê só a própria loja
  select u2.id into u from public.usuarios u2 join public.cargos c on c.id = u2.cargo_id
   where u2.ativo and c.nivel >= 3 and u2.loja_id is not null order by c.nivel desc limit 1;
  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
    set local role authenticated;
    select count(*) into n_lojas from public.lojas;
    reset role;
    if n_lojas <> 1 then raise exception 'FALHOU: usuário comum vê % lojas (esperado 1)', n_lojas; end if;
  end if;

  -- (d) ninguém mais com policy para {public}
  select count(*) into n_publico from pg_policies where schemaname='public' and roles::text like '%public%' ;
  if n_publico > 0 then raise exception 'FALHOU: ainda há % policies para {public}', n_publico; end if;

  raise notice 'OK: lojas/cargos fechadas para visitantes; % lojas no total; usuário comum vê só a dele', n_total;
end $$;
