// Confere a ligação da edição de convite (SQL + tela). O comportamento do SQL tem auto-teste dentro do próprio arquivo.
import fs from "fs";
const sql = fs.readFileSync("supabase-convite-editar.sql", "utf8"), app = fs.readFileSync("src/App.jsx", "utf8");
let ok = 0; const falhas = [];
const t = (n, c) => { if (c) ok++; else falhas.push("FALHA " + n); };
t("RPC só para authenticated (sem public/anon)", /revoke all on function public\.atualizar_convite[^;]*from public, anon;/.test(sql) && /grant execute on function public\.atualizar_convite[^;]*to authenticated;/.test(sql));
t("RPC é security definer com search_path fixo", /security definer set search_path to 'public'/.test(sql));
t("nível <= 5 e mesma loja", /v_nivel > 5 or \(not public\.eh_gestao_global\(\) and v_c\.loja_id is distinct from public\.loja_do_usuario\(\)\)/.test(sql));
t("acesso total só nível <= 4", /if v_total and v_nivel > 4 then raise exception 'acesso_total_exige_gerencia'/.test(sql));
t("convite bloqueado não edita", /if v_c\.revogado then raise exception 'convite_revogado'/.test(sql));
t("expiração: futuro e no máximo 100 anos", /p_expira_em <= now\(\) or p_expira_em > now\(\) \+ interval '100 years 7 days'/.test(sql));
t("promotor que já entrou acompanha (usuarios.acesso_expira_em)", /update public\.usuarios\s+set acesso_expira_em = v_exp/.test(sql));
t("auditoria gravada", /insert into public\.auditoria[\s\S]*alterou convite de promotor/.test(sql));
t("sem mudança real não grava", /if not v_mudou then return jsonb_build_object\('mudou', false\)/.test(sql));
t("tem auto-teste que cancela se falhar", /AUTO-TESTE FALHOU/.test(sql) && /desfazer_autoteste/.test(sql));
t("app chama a RPC com os 4 parâmetros", /rpc\("atualizar_convite", \{ p_id: c\.id, p_expira_em: expira, p_marcas: total \? null : lista, p_acesso_total: total \}\)/.test(app));
t("botão Editar só aparece para quem pode (bloqueado/acesso total sem nível 4 escondem)", /const podeEditar = !c\.revogado && !\(c\.acesso_total && !\(nivelUsuario != null && nivelUsuario <= 4\)\)/.test(app));
t("seletor de convites traz loja_id (sugestões de marca)", /select\("id, loja_id, token, codigo/.test(app));
t("erros novos mapeados em mensagem clara", ["acesso_total_exige_gerencia", "marcas_demais", "marca_invalida", "expira_invalida", "convite_revogado"].every((e) => app.includes(`m.includes("${e}")`)));
t("novidade registrada", /2026-11-11-editar-convite/.test(app));
console.log(`${ok} ok, ${falhas.length} falhas`); if (falhas.length) { console.log(falhas.join("\n")); process.exit(1); }
