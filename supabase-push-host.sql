-- Corrige o salvar_push: antes aceitava QUALQUER endereço (risco de o servidor enviar requisições a um site escolhido
-- por quem se inscreve). Agora só aceita provedores de notificação conhecidos ou token do app Android ("fcm:...").
-- Rodar DEPOIS de supabase-seguranca.sql. NÃO reaplicar supabase-seguranca.sql depois (volta a função aberta).

create or replace function public._push_endpoint_ok(p text)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare host text;
begin
  if p is null then return false; end if;
  if p like 'fcm:%' then
    return p ~ '^fcm:[A-Za-z0-9:_-]{40,255}$';
  end if;
  if p !~ '^https://[a-z0-9.-]+(:443)?/[^[:space:]]*$' then return false; end if;
  host := substring(p from '^https://([a-z0-9.-]+)');
  return host in ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com')
      or host ~ '^[a-z0-9-]+\.push\.services\.mozilla\.com$'
      or host ~ '^[a-z0-9-]+\.push\.apple\.com$'
      or host ~ '^[a-z0-9-]+\.notify\.windows\.com$';
end $$;
revoke all on function public._push_endpoint_ok(text) from public, anon, authenticated;

create or replace function public.salvar_push(p_endpoint text, p_subscription jsonb, p_usuario text, p_loja bigint)
returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is null or public.nivel_do_usuario() is null then raise exception 'sem_permissao'; end if;
  if length(coalesce(p_endpoint, '')) not between 10 and 1000 or length(p_subscription::text) > 4000 then raise exception 'dados_invalidos'; end if;
  if not public._push_endpoint_ok(p_endpoint) then raise exception 'endpoint_invalido'; end if;
  -- O web-push envia para o endereço de DENTRO do JSON: ele precisa ser idêntico ao validado (ou o token FCM do app Android)
  if p_endpoint like 'fcm:%' then
    if coalesce(p_subscription->>'fcm', '') <> substr(p_endpoint, 5) then raise exception 'endpoint_invalido'; end if;
  else
    if coalesce(p_subscription->>'endpoint', '') <> p_endpoint then raise exception 'endpoint_invalido'; end if;
    if coalesce(p_subscription->'keys'->>'p256dh', '') !~ '^[A-Za-z0-9_-]{60,120}={0,2}$'
       or coalesce(p_subscription->'keys'->>'auth', '') !~ '^[A-Za-z0-9_-]{12,40}={0,2}$' then raise exception 'endpoint_invalido'; end if;
  end if;
  perform public.rl_checar('push', 20);
  insert into public.push_subscriptions(endpoint, subscription, usuario, loja_id, usuario_id)
  values (p_endpoint, p_subscription, left(p_usuario, 120), public.loja_do_usuario(), auth.uid())
  on conflict (endpoint) do update
    set subscription = excluded.subscription, usuario = excluded.usuario, loja_id = excluded.loja_id, usuario_id = excluded.usuario_id;
end $$;
revoke all on function public.salvar_push(text, jsonb, text, bigint) from public, anon;
grant execute on function public.salvar_push(text, jsonb, text, bigint) to authenticated;

-- Limpeza: apaga inscrições já gravadas fora do padrão (endereço fora da lista, ou JSON com endereço diferente da coluna)
delete from public.push_subscriptions
 where not public._push_endpoint_ok(endpoint)
    or (endpoint not like 'fcm:%' and coalesce(subscription->>'endpoint', '') <> endpoint);

-- AUTO-TESTE (sem escrever nada): se falhar, desfaz tudo
do $$
declare falhas text := '';
begin
  if not public._push_endpoint_ok('https://fcm.googleapis.com/fcm/send/abc:APA91bExemplo') then falhas := falhas || ' [fcm web]'; end if;
  if not public._push_endpoint_ok('https://web.push.apple.com/QEdjMxQO_Jq') then falhas := falhas || ' [apple]'; end if;
  if not public._push_endpoint_ok('https://updates.push.services.mozilla.com/wpush/v2/gAAAA') then falhas := falhas || ' [mozilla]'; end if;
  if not public._push_endpoint_ok('https://wns2-par02p.notify.windows.com/w/?token=abc') then falhas := falhas || ' [windows]'; end if;
  if not public._push_endpoint_ok('fcm:' || repeat('a', 60)) then falhas := falhas || ' [fcm app]'; end if;
  if public._push_endpoint_ok('https://exemplo.invalid/endpoint-teste') then falhas := falhas || ' [host qualquer aceito]'; end if;
  if public._push_endpoint_ok('http://fcm.googleapis.com/fcm/send/abc') then falhas := falhas || ' [http aceito]'; end if;
  if public._push_endpoint_ok('https://fcm.googleapis.com.evil.com/x') then falhas := falhas || ' [sufixo falso]'; end if;
  if public._push_endpoint_ok('https://evil.com/?x=fcm.googleapis.com/') then falhas := falhas || ' [host na query]'; end if;
  if public._push_endpoint_ok('https://user@fcm.googleapis.com/x') then falhas := falhas || ' [usuario na url]'; end if;
  if public._push_endpoint_ok('fcm:curto') then falhas := falhas || ' [fcm curto]'; end if;
  if public._push_endpoint_ok('https://127.0.0.1/x') or public._push_endpoint_ok('https://localhost/x') then falhas := falhas || ' [ip local]'; end if;
  if has_function_privilege('anon', 'public.salvar_push(text,jsonb,text,bigint)', 'execute') then falhas := falhas || ' [anon executa salvar_push]'; end if;
  if falhas <> '' then raise exception 'AUTO-TESTE FALHOU:%', falhas; end if;
  raise notice 'salvar_push: validação de host OK';
end $$;
