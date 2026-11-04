-- CORREÇÃO (2026-11-04) — JÁ APLICADO no banco. Gerar convite de promotor dava "Não foi possível gerar o convite":
-- o gatilho que cria o código rodava com o usuário logado, que não pode executar _gerar_codigo_promotor (trancada). Agora roda como definer.
create or replace function public._convite_codigo_trg() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  new.codigo := public._gerar_codigo_promotor(new.marca);
  return new;
end $f$;
revoke all on function public._convite_codigo_trg() from public, anon, authenticated;
