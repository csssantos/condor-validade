-- Soma ao lote: o banco também barra lote que vence em até 2 dias (igual ao lançamento novo e ao app).
-- Rodar DEPOIS de supabase-permissoes.sql. Não reaplicar supabase-permissoes/blindagem/revisao depois sem rodar este de novo.
create or replace function public.somar_ao_lote(p_id text, p_qtd integer)
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare x record; nova int;
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  perform public.rl_checar('somar_lote', 60);
  if p_qtd is null or p_qtd < 1 or p_qtd > 99999 then raise exception 'quantidade_invalida'; end if;
  select id, nome, barcode, lote, quantidade, loja_id, por_peso, setor, validade, lancado_por_id, cadastrado_por into x from public.produtos where id = p_id for update;
  if not found or not public.loja_ok(x.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if not (public._setor_ok(x.setor) or public._eh_autor(x.lancado_por_id, x.cadastrado_por)) then raise exception 'editar_exige_autor'; end if;
  if x.lote is null or coalesce(x.por_peso, false) then raise exception 'lote_obrigatorio'; end if;
  if x.validade is not null and x.validade < public.hoje_br() then raise exception 'validade_vencida'; end if;
  if x.validade is not null and x.validade <= public.hoje_br() + 2 then raise exception 'validade_muito_proxima'; end if;
  if p_qtd > greatest(10, ceil(x.quantidade * 0.5)) then raise exception 'aumento_excessivo'; end if;
  nova := x.quantidade + p_qtd;
  if nova > 99999 then raise exception 'quantidade_invalida'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.produtos set quantidade = nova, atualizado_por = public.nome_do_usuario() where id = p_id;
  perform set_config('app.via_rpc', '', true);
  insert into public.auditoria (usuario, acao, detalhe, produto_barcode, loja_id)
    values (public.nome_do_usuario(), 'somou quantidade ao lote', x.nome || ' · lote ' || x.lote || ' · +' || p_qtd::text || ' (de ' || x.quantidade::text || ' para ' || nova::text || ')', x.barcode, x.loja_id);
  return nova;
end $function$;

do $t$ begin
  if pg_get_functiondef('public.somar_ao_lote(text,integer)'::regprocedure) not like '%validade_muito_proxima%' then
    raise exception 'AUTO-TESTE FALHOU: somar_ao_lote sem a trava de 2 dias';
  end if;
  if has_function_privilege('anon', 'public.somar_ao_lote(text,integer)', 'execute') then
    raise exception 'AUTO-TESTE FALHOU: anon executa somar_ao_lote';
  end if;
end $t$;
notify pgrst, 'reload schema';
