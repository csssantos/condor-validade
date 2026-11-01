-- Tempo real do card "Telegram vinculado" no app. Pode rodar mais de uma vez.
do $do$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'telegram_vinculos') then
    alter publication supabase_realtime add table public.telegram_vinculos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'telegram_vinculos') then
    raise exception 'auto-teste: telegram_vinculos nao entrou no realtime';
  end if;
end $do$;
