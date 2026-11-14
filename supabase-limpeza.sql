-- LIMPEZA SEGURA DO BANCO (item A5 da auditoria, 2026-11-14). Nada aqui apaga dado de usuário. Tudo dá para desfazer.
--  1) 10 funções de regra ganham "search_path" fixo (aviso de segurança do Supabase): o comportamento não muda.
--  2) Sai o índice duplicado de ronda_itens (existem dois iguais; fica o ronda_itens_ronda_idx).
--  3) A rotina `whatsapp_limpar` (apaga mensagens antigas do WhatsApp, recurso pausado) passa de a cada 5 minutos para 1 vez por dia; a retenção continua valendo.
-- Para desfazer: o search_path anterior era vazio (`alter function <nome> reset search_path`); o cron antigo era `select public.whatsapp_limpar()` a cada 5 min (`*/5 * * * *`); o índice se recria com `create index ronda_itens_ronda_id_idx on public.ronda_itens (ronda_id)`.
-- Se reaplicar supabase-revisao/promotor-marcas/telegram-regras/lote, rode ESTE arquivo de novo.
-- Fora deste arquivo, de propósito: apagar a cópia `backup_20261030` (35 tabelas com dados de 30/10) — isso é irreversível e só
-- deve ser feito depois de o dono confirmar que o backup diário do GitHub está funcionando (ver bloco comentado no fim).
-- Auto-teste: se algo falhar, nada é aplicado.
begin;

do $$
declare f record; v_id text; v_bc text; v_loja bigint;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_produtos_lote_ck','ean13_valido','_catalogo_ean_ck','hoje_br','norm_lote','ean_valido','_produtos_regras','_sem_acento','_marca_casa','_marca_stop')
  loop execute format('alter function %s set search_path = public, extensions', f.assinatura); end loop;

  -- só apaga se for MESMO duplicata (mesma definição, trocando só o nome)
  if exists (select 1 from pg_indexes where schemaname='public' and indexname='ronda_itens_ronda_id_idx') then
    if (select replace(indexdef,'ronda_itens_ronda_id_idx','X') from pg_indexes where schemaname='public' and indexname='ronda_itens_ronda_id_idx')
       is distinct from (select replace(indexdef,'ronda_itens_ronda_idx','X') from pg_indexes where schemaname='public' and indexname='ronda_itens_ronda_idx')
    then raise exception 'índices da ronda não são iguais: nada foi apagado'; end if;
    drop index public.ronda_itens_ronda_id_idx;
  end if;

  -- a rotina apaga mensagens antigas (retenção): não some, só passa de a cada 5 min para 1x por dia
  if exists (select 1 from cron.job where jobname = 'whatsapp_limpar' and command <> 'select public.whatsapp_limpar()') then raise exception 'comando da rotina whatsapp_limpar diferente do esperado: nada foi alterado'; end if;
  if exists (select 1 from cron.job where jobname = 'whatsapp_limpar') then perform cron.schedule('whatsapp_limpar', '17 6 * * *', 'select public.whatsapp_limpar()'); end if;

  -- auto-teste: as regras continuam funcionando
  if not public.ean_valido('7891000100103') or public.ean_valido('7891000100104') then raise exception 'auto-teste: ean_valido'; end if;
  if public._sem_acento('Ação Pão') <> 'ACAO PAO' then raise exception 'auto-teste: _sem_acento'; end if;
  if not public._marca_casa('CAFE MELITTA 500G', 'MELITTA') then raise exception 'auto-teste: _marca_casa'; end if;
  if public.hoje_br() is null or public.norm_lote(' l 12 ') <> 'L 12' then raise exception 'auto-teste: hoje_br/norm_lote'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ronda_itens_ronda_idx') then raise exception 'auto-teste: índice da ronda sumiu'; end if;
  if exists (select 1 from cron.job where jobname = 'whatsapp_limpar' and schedule <> '17 6 * * *') then raise exception 'auto-teste: rotina do WhatsApp continua a cada 5 min'; end if;
end $$;

commit;

-- OPCIONAL E IRREVERSÍVEL — só rode se o backup diário (repositório privado condor-validade-backup) estiver gerando arquivos:
-- drop schema backup_20261030 cascade;
