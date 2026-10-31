-- Auditoria do Telegram: tudo que acontece pelo bot passa a aparecer na auditoria do app (tela Auditoria / Torre).
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez. Tem auto-teste: se algo falhar, nada é aplicado.

-- 1) Registro de eventos do bot (só service_role). O bot informa o chat; quem é e de qual loja vem do vínculo.
create or replace function public.telegram_auditar(p_chat_id bigint, p_acao text, p_detalhe text default null, p_barcode text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  -- só ações conhecidas (o bot não grava texto livre no lugar da ação)
  if p_acao not in (
    'desvinculou o Telegram (/sair)', 'cancelou lançamento no Telegram', 'confirmou lançamento duplicado no Telegram',
    'lançamento barrado no Telegram', 'dado barrado no Telegram', 'consultou produto na internet (Open Food Facts)'
  ) then raise exception 'acao_invalida'; end if;
  select nome, loja_id into v from public.telegram_vinculos where chat_id = p_chat_id;
  if not found then return; end if;  -- sem vínculo não há loja para registrar
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (v.nome, p_acao, left(coalesce(p_detalhe, ''), 300), nullif(left(coalesce(p_barcode, ''), 20), ''), v.loja_id);
end $$;
revoke all on function public.telegram_auditar(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_auditar(bigint, text, text, text) to service_role;

-- 2) "gerou código do Telegram" (funcionário pede o código no app) e detalhes no lançamento (validade e quantidade)
do $$
declare d text; r record; n int := 0;
begin
  for r in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'gerar_codigo_telegram' loop
    d := pg_get_functiondef(r.oid);
    if position('gerou código do Telegram' in d) = 0 then
      d := replace(d, 'return jsonb_build_object(''codigo'', v_cod, ''expira_em'', v_exp);',
        'insert into public.auditoria (usuario, acao, detalhe, loja_id) values ((select nome from public.usuarios where id = u.id), ''gerou código do Telegram'', ''válido por 10 minutos'', u.loja_id);
  return jsonb_build_object(''codigo'', v_cod, ''expira_em'', v_exp);');
      execute d;
    end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'gerar_codigo_telegram nao encontrada (rode supabase-telegram.sql antes)'; end if;

  for r in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname = 'lancar_validade' loop
    d := pg_get_functiondef(r.oid);
    if position('· validade ' in d) = 0 then
      d := replace(d, ' else '''' end, c.barcode, p_loja);',
        ' else '''' end || '' · validade '' || to_char(p_validade, ''DD/MM/YYYY'') || '' · qtd '' || v_qtd::text, c.barcode, p_loja);');
      execute d;
    end if;
  end loop;

  -- auto-teste
  if not exists (select 1 from pg_proc where proname = 'gerar_codigo_telegram' and pg_get_functiondef(oid) like '%gerou código do Telegram%') then
    raise exception 'auto-teste: gerar_codigo_telegram nao recebeu a auditoria';
  end if;
  if not exists (select 1 from pg_proc where proname = 'lancar_validade' and pg_get_functiondef(oid) like '%· validade %') then
    raise exception 'auto-teste: lancar_validade nao recebeu o detalhe';
  end if;
end $$;
