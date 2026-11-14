-- AJUSTES DA BANCA (2026-11-14). Rodar DEPOIS de supabase-fotos-storage.sql (que o dono já aplicou).
--  1) fotos_pendentes só devolve foto que a função consegue mover (jpeg/png/webp em base64, até ~500 KB) e em ordem fixa.
--     Antes, fotos fora do padrão voltavam sempre na lista e podiam travar a migração de todas as lojas.
--  2) dar_baixa passa a IGNORAR a quantidade informada: a baixa é sempre do lote inteiro (decisão do dono).
--     Antes, quem chamasse o banco direto podia gravar no histórico só parte da quantidade (o lote era apagado inteiro de qualquer jeito).
-- Nenhuma tabela, policy ou trigger muda. Permissões das funções continuam as mesmas. Auto-teste: se algo falhar, nada é aplicado.
-- NÃO reaplicar depois supabase-permissoes.sql / supabase-blindagem-produtos.sql / supabase-fotos-storage.sql (voltam ao antigo; se reaplicar, rode este de novo).
begin;

create or replace function public.fotos_pendentes(p_limite int default 12)
returns table (loja_id bigint, hash text, foto text)
language sql security definer set search_path = public as $$
  select x.loja_id, md5(x.foto), min(x.foto)
    from (select c.loja_id, c.foto from public.catalogo c where c.foto like 'data:image/%'
          union all select p.loja_id, p.foto from public.produtos p where p.foto like 'data:image/%' and p.pedido_tipo is null
          union all select h.loja_id, h.foto from public.historico h where h.foto like 'data:image/%') x
   where x.loja_id is not null
     and length(x.foto) <= 666000
     and x.foto ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
   group by x.loja_id, md5(x.foto)
   order by 1, 2
   limit greatest(1, least(coalesce(p_limite, 12), 50));
$$;

do $$
declare d text; novo text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'dar_baixa' and p.pronargs = 3;
  if d is null then raise exception 'dar_baixa (3 parâmetros) não encontrada'; end if;
  if position('v_q := x.quantidade;' in d) = 0 then
    novo := replace(d, 'v_q := coalesce(p_qtd, x.quantidade);', 'v_q := x.quantidade; -- baixa SEMPRE total (p_qtd é ignorado)');
    if novo = d then raise exception 'trecho da quantidade não encontrado: a função mudou, revisar antes de aplicar'; end if;
    execute novo;
  end if;
  -- auto-teste
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'dar_baixa' and p.pronargs = 3;
  if position('coalesce(p_qtd, x.quantidade)' in d) > 0 or position('baixa_exige_encarregado' in d) = 0 or position('app.via_baixa' in d) = 0 then
    raise exception 'auto-teste falhou: dar_baixa inesperada';
  end if;
  if has_function_privilege('authenticated', 'public.fotos_pendentes(int)', 'execute') or has_function_privilege('anon', 'public.fotos_pendentes(int)', 'execute') then
    raise exception 'auto-teste falhou: fotos_pendentes aberta para usuário';
  end if;
  if not has_function_privilege('authenticated', 'public.dar_baixa(text,text,numeric)', 'execute') then raise exception 'auto-teste falhou: dar_baixa perdeu a permissão'; end if;
  perform 1 from public.fotos_pendentes(1);
end $$;

commit;
