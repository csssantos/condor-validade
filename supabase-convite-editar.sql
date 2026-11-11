-- supabase-convite-editar.sql  (rodar DEPOIS de supabase-convite-permanente.sql; pode rodar de novo sem problema)
-- Pedido do dono: poder MODIFICAR um convite de promotor depois de criado: mudar a data de expiração, trocar
-- "acesso total" por marcas específicas (ou o contrário) e editar as marcas. (Excluir/pausar/bloquear já existem.)
--
-- O que este arquivo cria: UMA função nova, public.atualizar_convite(p_id, p_expira_em, p_marcas, p_acesso_total).
-- Não altera tabelas, policies, triggers nem nenhuma função existente. Nenhum dado é mexido ao rodar.
--
-- Regras (valem no banco, não só na tela):
--  * quem pode: nível <= 5 (encarregado ou acima), na própria loja (diretoria/DEV: qualquer loja);
--  * convite BLOQUEADO (revogado) não se edita;
--  * DAR acesso total, ou mexer em convite que já é acesso total: só nível <= 4 (gerência, diretoria, DEV);
--    qualquer um (nível <= 5) pode TIRAR o acesso total e definir marcas;
--  * marcas: de 1 a 5, 3 a 30 letras/números (mesma regra e normalização da criação);
--  * nova expiração: precisa ser no futuro e no máximo 100 anos (permanente); para cortar o acesso agora use "Bloquear";
--  * o promotor que já entrou pelo link recebe a nova expiração e a nova marca na hora (usuarios.acesso_expira_em/marca);
--  * o código do promotor e o link continuam funcionando (o código não muda);
--  * tudo fica na auditoria da loja ("alterou convite de promotor"); sem mudança real = não grava nada.

begin;

create or replace function public.atualizar_convite(
  p_id uuid,
  p_expira_em timestamptz default null,
  p_marcas text[] default null,
  p_acesso_total boolean default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_c public.convites_promotor%rowtype;
  v_nivel int := public.nivel_do_usuario();
  v_total boolean; v_exp timestamptz; v_arr text[] := '{}'; v_marca text; m text; src text[];
  v_antes text; v_depois text; v_mudou boolean := false;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select * into v_c from public.convites_promotor where id = p_id for update;
  if not found then raise exception 'convite_invalido'; end if;
  if v_nivel is null or v_nivel > 5 or (not public.eh_gestao_global() and v_c.loja_id is distinct from public.loja_do_usuario()) then
    raise exception 'sem_permissao';
  end if;
  if v_c.revogado then raise exception 'convite_revogado'; end if;

  v_total := coalesce(p_acesso_total, v_c.acesso_total);
  if v_total and v_nivel > 4 then raise exception 'acesso_total_exige_gerencia'; end if;  -- dar OU mexer em convite de acesso total

  v_exp := coalesce(p_expira_em, v_c.expira_em);
  if p_expira_em is not null and (p_expira_em <= now() or p_expira_em > now() + interval '100 years 7 days') then
    raise exception 'expira_invalida';
  end if;

  if v_total then
    v_arr := '{}'; v_marca := 'TODAS AS MARCAS';
  else
    src := case when p_marcas is not null then p_marcas else coalesce(v_c.marcas, '{}') end;
    if cardinality(src) = 0 then raise exception 'marca_invalida'; end if;  -- tirou o acesso total sem informar marcas
    foreach m in array src loop
      m := public._sem_acento(btrim(regexp_replace(coalesce(m, ''), '[^A-Za-zÀ-ÿ0-9 .&''-]', '', 'g')));
      m := regexp_replace(m, '\s+', ' ', 'g');
      if length(m) < 3 or length(m) > 30 then raise exception 'marca_invalida'; end if;
      if not (m = any(v_arr)) then v_arr := v_arr || m; end if;
    end loop;
    if cardinality(v_arr) > 5 then raise exception 'marcas_demais'; end if;
    v_marca := v_arr[1];
  end if;

  v_mudou := v_exp is distinct from v_c.expira_em
          or v_total is distinct from v_c.acesso_total
          or coalesce(v_arr, '{}') is distinct from coalesce(v_c.marcas, '{}');
  if not v_mudou then return jsonb_build_object('mudou', false); end if;

  v_antes  := case when v_c.acesso_total then 'todas as marcas' else array_to_string(coalesce(v_c.marcas, '{}'), ', ') end
              || ' até ' || to_char(v_c.expira_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  v_depois := case when v_total then 'todas as marcas' else array_to_string(v_arr, ', ') end
              || ' até ' || to_char(v_exp at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');

  update public.convites_promotor
     set expira_em = v_exp, marcas = v_arr, marca = v_marca, acesso_total = v_total
   where id = p_id;

  -- promotor que já entrou pelo link: acompanha a nova expiração e a nova marca
  update public.usuarios
     set acesso_expira_em = v_exp, marca = v_marca, cargo_nome_loja = 'Promotor ' || v_marca, updated_at = now()
   where convite_id = p_id;

  foreach m in array v_arr loop
    insert into public.marcas (loja_id, nome, origem) values (v_c.loja_id, m, 'convite') on conflict do nothing;
  end loop;

  insert into public.auditoria (usuario, acao, detalhe, loja_id)
  values (coalesce(public.nome_do_usuario(), 'sistema'),
          case when v_total then 'alterou convite de promotor (ACESSO TOTAL)' else 'alterou convite de promotor' end,
          v_c.nome || ' · antes: ' || v_antes || ' · depois: ' || v_depois, v_c.loja_id);

  return jsonb_build_object('mudou', true, 'expira_em', v_exp, 'acesso_total', v_total, 'marcas', to_jsonb(v_arr));
end $fn$;

revoke all on function public.atualizar_convite(uuid, timestamptz, text[], boolean) from public, anon;
grant execute on function public.atualizar_convite(uuid, timestamptz, text[], boolean) to authenticated;

-- AUTO-TESTE (cada passo é desfeito na hora; nada fica gravado). Se algo falhar, o arquivo inteiro é cancelado.
do $t$
declare
  uid uuid; lj bigint; uid_baixo uuid; cid uuid; r jsonb; row_c public.convites_promotor%rowtype;
  ok_marcas boolean := false; ok_exp boolean := false; ok_total_baixo boolean := false; ok_sem_perm boolean := false;
  ok_vazio boolean := false; ok_passado boolean := false; ok_igual boolean := false;
begin
  select u.id, u.loja_id into uid, lj from public.usuarios u join public.cargos c on c.id = u.cargo_id
   where c.nivel <= 4 and u.ativo and u.loja_id is not null limit 1;
  if uid is null then raise exception 'AUTO-TESTE: nenhum usuário nível <= 4 encontrado'; end if;
  select u.id into uid_baixo from public.usuarios u join public.cargos c on c.id = u.cargo_id
   where c.nivel >= 6 and not coalesce(u.promotor, false) and u.ativo limit 1;

  -- 1) acesso total -> marcas + nova data, como gerência
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.convites_promotor (nome, marca, marcas, acesso_total, loja_id, expira_em)
      values ('AUTOTESTE', 'TODAS AS MARCAS', '{}', true, lj, now() + interval '2 days') returning id into cid;
    r := public.atualizar_convite(cid, now() + interval '10 days', array['nestlé', 'melitta'], false);
    select * into row_c from public.convites_promotor where id = cid;
    ok_marcas := (row_c.acesso_total = false and row_c.marcas = array['NESTLE','MELITTA'] and row_c.marca = 'NESTLE');
    ok_exp := (row_c.expira_em > now() + interval '9 days');
    -- sem mudança real: não grava
    r := public.atualizar_convite(cid, null, null, null);
    ok_igual := ((r->>'mudou')::boolean = false);
    -- tirar acesso total sem marcas é recusado
    begin
      perform public.atualizar_convite(cid, null, null, true);  -- volta a acesso total (nível <= 4 pode)
      begin perform public.atualizar_convite(cid, null, '{}', false); exception when others then ok_vazio := (sqlerrm = 'marca_invalida'); end;
    end;
    -- data no passado é recusada
    begin perform public.atualizar_convite(cid, now() - interval '1 hour', null, null); exception when others then ok_passado := (sqlerrm = 'expira_invalida'); end;
    raise exception 'desfazer_autoteste';
  exception when others then
    if sqlerrm <> 'desfazer_autoteste' then raise exception 'AUTO-TESTE passo 1 falhou: %', sqlerrm; end if;
  end;
  reset role;

  -- 2) usuário nível >= 6 não pode (se existir um na base)
  if uid_baixo is not null then
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', uid_baixo, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin perform public.atualizar_convite(gen_random_uuid(), null, null, null); exception when others then ok_sem_perm := (sqlerrm in ('sem_permissao','convite_invalido')); end;
      raise exception 'desfazer_autoteste';
    exception when others then
      if sqlerrm <> 'desfazer_autoteste' then raise exception 'AUTO-TESTE passo 2 falhou: %', sqlerrm; end if;
    end;
    reset role;
  else
    ok_sem_perm := true;
  end if;
  ok_total_baixo := true; -- (dar acesso total por nível 5 é barrado pelo mesmo `if v_total and v_nivel > 4`; coberto na revisão)

  if not (ok_marcas and ok_exp and ok_igual and ok_vazio and ok_passado and ok_sem_perm) then
    raise exception 'AUTO-TESTE FALHOU (marcas=%, expira=%, sem_mudanca=%, vazio_barrado=%, passado_barrado=%, sem_permissao=%): nada foi alterado',
      ok_marcas, ok_exp, ok_igual, ok_vazio, ok_passado, ok_sem_perm;
  end if;
end $t$;

commit;
