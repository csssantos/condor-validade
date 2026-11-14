// Teste do resumo diário: textos (formato.ts, comportamento) + regras de segurança da Edge Function e do SQL (texto).
const { build } = await import("esbuild").catch(() => import("/opt/npm-tools/node_modules/esbuild/lib/main.js"));
import { readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const raiz = new URL(".", import.meta.url).pathname;
const dir = tmpdir() + "/resumo-diario-teste/"; mkdirSync(dir, { recursive: true });
await build({ entryPoints: [raiz + "supabase/functions/resumo-diario/formato.ts"], bundle: true, format: "esm", outfile: dir + "formato.mjs", platform: "node", logLevel: "error" });
const F = await import(dir + "formato.mjs");
const idx = readFileSync(raiz + "supabase/functions/resumo-diario/index.ts", "utf8");
const sql = readFileSync(raiz + "supabase-resumo-diario.sql", "utf8");
const cfg = readFileSync(raiz + "supabase/config.toml", "utf8");
let ok = 0, falhas = 0;
const t = (nome, fn) => { try { fn(); ok++; console.log("ok  ", nome); } catch (e) { falhas++; console.log("FALHA", nome, "\n     ", e.message); } };
const base = { vencidos: 2, hoje: 1, amanha: 3, ate10: 9, sem_pedido: 4, aprovacoes: 1, nome: "Ana Souza", setor: "Mercearia", hoje_data: "2026-11-14",
  top: [{ nome: "BISC RECHEADO 140G", dias: 0, validade: "2026-11-14", lote: "L12", quantidade: 8, pedido: false }, { nome: "LEITE", dias: 4, validade: "2026-11-18", lote: null, quantidade: 30, pedido: true }] };

t("sem nada a avisar não manda", () => { assert.equal(F.temConteudo(F.normalizar({ ...base, vencidos: 0, ate10: 0, aprovacoes: 0, top: [] })), false); });
t("qualquer um dos três motivos manda", () => { for (const k of ["vencidos", "ate10", "aprovacoes"]) assert.equal(F.temConteudo(F.normalizar({ ...base, vencidos: 0, ate10: 0, aprovacoes: 0, [k]: 1 })), true); });
t("normalizar recusa lixo", () => { assert.equal(F.normalizar(null), null); assert.equal(F.normalizar("x"), null); const r = F.normalizar({ vencidos: -5, hoje: "abc", ate10: 1e12, top: "x" }); assert.equal(r.vencidos, 0); assert.equal(r.hoje, 0); assert.equal(r.ate10, 99999); assert.deepEqual(r.top, []); });
t("no máximo 5 itens urgentes", () => { const r = F.normalizar({ ...base, top: Array(9).fill(base.top[0]) }); assert.equal(r.top.length, 5); });
t("texto do Telegram cabe na legenda (1000)", () => { const r = F.normalizar({ ...base, nome: "A".repeat(500), top: Array(5).fill({ ...base.top[0], nome: "B".repeat(500) }) }); assert.ok(F.textoTelegram(r).length <= 1000); });
t("texto traz setor, contagens, itens e como desligar", () => { const x = F.textoTelegram(F.normalizar(base)); for (const s of ["Bom dia, Ana", "Mercearia", "Vencidos no estoque: 2", "Vencem hoje: 1 · amanhã: 3", "até 10 dias: 9 (sem campanha: 4)", "esperando aprovação: 1", "BISC RECHEADO", "lote L12", "SEM campanha", "campanha ✓", "Mais → Notificações"]) assert.ok(x.includes(s), "falta: " + s); });
t("linha zerada não aparece", () => { const x = F.textoTelegram(F.normalizar({ ...base, vencidos: 0, aprovacoes: 0 })); assert.ok(!x.includes("Vencidos no estoque") && !x.includes("aprovação")); });
t("nome de produto com link/controle é limpo", () => { const r = F.normalizar({ ...base, nome: "Ana\n http://ruim.com", top: [{ ...base.top[0], nome: "X‮evil www.ruim.com y@z.com" }] }); const x = F.textoTelegram(r); assert.ok(!/ruim|http|@|‮/.test(x), x); });
t("vencido não diz 'SEM campanha' (não cabe campanha)", () => { assert.ok(!F.linhaTop({ nome: "A", dias: -2, validade: "2026-11-12", lote: null, quantidade: 1, pedido: false }).includes("SEM campanha")); });
t("push cabe e resume", () => { const p = F.corpoPush(F.normalizar(base)); assert.ok(p.length <= 180 && p.includes("vencido") && p.includes("sem campanha")); });
t("e-mail: mensagem e detalhes", () => { const r = F.normalizar(base); assert.ok(F.mensagemEmail(r).includes("Mais → Notificações")); const d = F.detalhesEmail(r); assert.ok(d.length >= 6 && d.every((p) => p.length === 2)); });

// segurança da Edge Function
t("função confere o segredo no banco ANTES de qualquer coisa", () => { const a = idx.indexOf('rpc("resumo_diario_validar"'), b = idx.indexOf('rpc("resumo_diario_destinatarios"'); assert.ok(a > 0 && b > a); });
t("limite de execuções por minuto, falha fechada", () => { assert.ok(/resumo_diario_exec/.test(idx) && /!error && data === true/.test(idx)); });
t("1 envio por canal: reserva antes, libera se falhar", () => { assert.ok(idx.includes('"resumo_diario_reservar"') && idx.includes('"resumo_diario_liberar"') && /if \(!sucesso\)/.test(idx)); });
t("nunca registra dado da pessoa nem o segredo", () => { assert.ok(!/console\.(log|error|warn)\([^)]*(segredo|email|d\.chat_id|nome)/i.test(idx.replace(/"resumo-diario: segredo inválido"/, ""))); });
t("config: sem JWT (o agendador chama), mas só com o segredo", () => { assert.ok(/\[functions\.resumo-diario\]\s*\nverify_jwt = false/.test(cfg)); });
t("e-mail só para endereço oficial do app e remetente no-reply", () => { assert.ok(idx.includes("REMETENTE.aviso") && idx.includes("https://app.usebipi.com")); });

// SQL
t("SQL: tabelas com RLS, sem escrita para usuário", () => { assert.ok(/resumo_diario_prefs enable row level security/.test(sql) && /resumo_diario_envios enable row level security/.test(sql) && /revoke all on public\.resumo_diario_envios from public, anon, authenticated/.test(sql)); });
t("SQL: funções de serviço só para service_role", () => { for (const f of ["resumo_diario_calcular(uuid)", "resumo_diario_destinatarios()", "resumo_diario_reservar(uuid, text)", "resumo_diario_liberar(uuid, text)", "resumo_diario_validar(text)"]) { assert.ok(sql.includes(`grant execute on function public.${f} to service_role`), f); assert.ok(!sql.includes(`grant execute on function public.${f} to authenticated`), f); } assert.ok(!/resumo_diario_disparar\(\) to/.test(sql)); });
t("SQL: salvar exige nível <= 5, ativo, não anônimo, limite e auditoria", () => { const s = sql.slice(sql.indexOf("function public.salvar_resumo_diario"), sql.indexOf("function public.resumo_diario_calcular")); for (const k of ["nivel_do_usuario(), 99) > 5", "is_anonymous", "rl_checar('resumo_pref'", "insert into public.auditoria", "telegram_nao_vinculado", "sem_email", "push_nao_ativo"]) assert.ok(s.includes(k), k); });
t("SQL: padrão tudo desligado", () => { assert.ok(/telegram boolean not null default false, push boolean not null default false, email boolean not null default false/.test(sql.replace(/\s+/g, " ").replace(/,\s*/g, ", ")) || (/telegram boolean not null default false/.test(sql) && /push boolean not null default false/.test(sql) && /email boolean not null default false/.test(sql))); });
t("SQL: agenda 7h e 8h de Brasília (10h e 11h UTC)", () => { assert.ok(sql.includes("'0 10 * * *'") && sql.includes("'0 11 * * *'")); });
t("SQL: exportação LGPD e auto-teste sem gravar em dado real", () => { assert.ok(sql.includes("'resumo_diario'") && sql.includes("auto-teste")); const at = sql.slice(sql.lastIndexOf("-- 12)")); assert.ok(!/\binsert into\b|\bupdate\b|\bdelete from\b/i.test(at.replace(/-- .*/g, "").replace(/'[^']*'/g, "''"))); });
t("SQL: setor do encarregado só filtra nível 5 (gerência vê a loja)", () => { assert.ok(sql.includes("u.nivel <= 4 or public._setor_casa")); });
console.log(`\n${ok} ok, ${falhas} falha(s)`); process.exit(falhas ? 1 : 0);
