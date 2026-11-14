-- Cargo REGIONAL no lugar de DIRETOR (pedido do dono, 2026-11-13).
-- O que faz: renomeia o cargo de nível 2 de "DIRETOR" para "REGIONAL". O id, o nível (2) e todas as permissões continuam
-- exatamente iguais (as regras do banco e do app usam o NÍVEL, não o nome). Nenhum usuário tem esse cargo hoje (conferido).
-- Conferido antes: nenhuma função, policy ou trigger do banco usa o texto 'DIRETOR'. Pode ser desfeito rodando o UPDATE ao contrário.
-- Rodar ANTES de publicar o app (o app passa a chamar o nível 2 de "regional" nos textos; o nome na lista de cargos vem do banco).
begin;

update public.cargos set nome = 'REGIONAL' where nivel = 2 and nome = 'DIRETOR';

-- auto-teste: se algo não ficou como esperado, desfaz tudo
do $$
begin
  if not exists (select 1 from public.cargos where nivel = 2 and nome = 'REGIONAL') then
    raise exception 'auto-teste: o cargo de nível 2 não virou REGIONAL (já era outro nome?)';
  end if;
  if exists (select 1 from public.cargos where upper(nome) = 'DIRETOR') then
    raise exception 'auto-teste: ainda existe cargo DIRETOR';
  end if;
  if (select count(*) from public.cargos where nivel = 2) <> 1 then
    raise exception 'auto-teste: esperado exatamente 1 cargo de nível 2';
  end if;
  if (select count(*) from public.cargos where nome in ('DESENVOLVEDOR','GERENTE GERAL','GERENTE ADJUNTO')) <> 3 then
    raise exception 'auto-teste: outros cargos foram alterados';
  end if;
end $$;

commit;
