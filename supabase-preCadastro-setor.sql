-- Pré-cadastro: regras de setor (valem no banco, não só na tela)
-- 1) Encarregado (nível 5) cadastrando: o setor é SEMPRE o dele (não dá para escolher outro).
-- 2) Cargo de funcionário (nível 6): setor obrigatório (se vazio, usa o setor padrão do cargo).
-- 3) Cargo de encarregado (nível 5), criado por gerência/diretoria/dev: setor opcional; se vazio, usa o padrão do cargo.
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

create or replace function public._pendente_regra_setor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nivel_criador int;
  v_setor_criador text;
  v_nivel_cargo int;
  v_padrao text;
begin
  -- chamadas internas (service_role/postgres, sem usuário logado) não são restringidas
  if auth.uid() is null then
    return new;
  end if;

  v_nivel_criador := public.nivel_do_usuario();
  select nivel, setor_padrao into v_nivel_cargo, v_padrao from public.cargos where id = new.cargo_id;
  if v_nivel_cargo is null then
    raise exception 'Cargo inválido.' using errcode = '22023';
  end if;

  new.setor := nullif(btrim(coalesce(new.setor, '')), '');
  if new.setor is not null and length(new.setor) > 80 then
    raise exception 'Setor inválido.' using errcode = '22023';
  end if;

  -- encarregado: setor travado no dele
  if v_nivel_criador = 5 then
    select nullif(btrim(coalesce(setor, '')), '') into v_setor_criador from public.usuarios where id = auth.uid();
    if v_setor_criador is null then
      raise exception 'Seu usuário não tem setor definido. Peça à gerência para definir o seu setor antes de cadastrar equipe.' using errcode = '22023';
    end if;
    new.setor := v_setor_criador;
  end if;

  -- sem setor informado: usa o padrão do cargo
  if new.setor is null then
    new.setor := nullif(btrim(coalesce(v_padrao, '')), '');
  end if;

  -- funcionário (nível 6+) precisa estar vinculado a um setor
  if v_nivel_cargo >= 6 and new.setor is null then
    raise exception 'Escolha o setor do funcionário.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public._pendente_regra_setor() from public, anon, authenticated;

drop trigger if exists trg_pendente_regra_setor on public.funcionarios_pendentes;
create trigger trg_pendente_regra_setor
  before insert or update on public.funcionarios_pendentes
  for each row execute function public._pendente_regra_setor();
