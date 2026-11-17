-- PRODUTOS SEM FOTO FORA DA TELA DE INÍCIO (pedido do dono, 2026-11-17; TEMPORÁRIO para a apresentação).
-- Coluna produtos.invisivel: 1 = escondido da tela de início, 0 = aparece. É CALCULADA sozinha a partir da foto:
--   1 quando o lote não tem foto, ou só tem o link do Open Food Facts (que não abre);
--   0 quando tem foto de verdade (arquivo nosso ou enviada pelo app). Quando a foto chega (migração ou câmera), vira 0 sem ninguém mexer.
-- Nada mais muda (nenhum trigger, policy ou função). Tabela pequena (dezenas de lotes): a criação reescreve a tabela por um instante.
-- Para VOLTAR atrás: no app, ESCONDER_SEM_FOTO = false (src/lib/constantes.js) já mostra tudo; a coluna pode ficar ou sair com:
--   alter table public.produtos drop column invisivel;
-- Auto-teste no final; se falhar, nada é aplicado.
begin;

alter table public.produtos
  add column if not exists invisivel smallint
  generated always as (case when foto is null or btrim(foto) = '' or foto ~* 'openfoodfacts\.org' then 1 else 0 end) stored;

do $$
declare c int; i1 int; i0 int;
begin
  select count(*) into c from information_schema.columns where table_schema='public' and table_name='produtos' and column_name='invisivel';
  if c <> 1 then raise exception 'auto-teste: coluna invisivel não criada'; end if;
  select count(*) into i1 from public.produtos where invisivel = 1 and foto is not null and btrim(foto) <> '' and foto !~* 'openfoodfacts\.org';
  select count(*) into i0 from public.produtos where invisivel = 0 and (foto is null or btrim(foto) = '' or foto ~* 'openfoodfacts\.org');
  if i1 <> 0 or i0 <> 0 then raise exception 'auto-teste: invisivel inconsistente (% / %)', i1, i0; end if;
end $$;

commit;
