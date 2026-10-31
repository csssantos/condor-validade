// Edge Function: identificar-produto (versão 8 — endurecida)
// Recebe uma foto (base64) e devolve { nome, setor } usando o Gemini. A chave fica só no servidor.
// Exige usuário logado com cadastro ativo, limita o tamanho da imagem (1,5 MB base64) e 10 chamadas/min por usuário.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SETORES = [
  "Açougue", "Padaria", "Hortifruti", "Frios e Laticínios", "Congelados", "Mercearia",
  "Bebidas", "Higiene e Perfumaria", "Limpeza", "Bazar", "Pet Shop", "Outro"
];
const MODELOS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro"];
const TIMEOUT_MS = 8000;
const MAX_BASE64 = 1_500_000;
const ORIGEM_OK = /^https:\/\/condor-validade[a-z0-9-]*\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;

Deno.serve(async (req: Request) => {
  const o = req.headers.get("origin") || "";
  const cors: Record<string, string> = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
  if (ORIGEM_OK.test(o)) cors["Access-Control-Allow-Origin"] = o;
  const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resp({ error: "metodo" }, 405);

  try {
    // 1) quem chama precisa ser usuário real com cadastro ativo (a chave pública sozinha não basta)
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: ud } = await sb.auth.getUser(token);
    if (!ud?.user) return resp({ error: "nao_autenticado" }, 401);
    const { data: perfil } = await sb.from("usuarios").select("id").eq("id", ud.user.id).eq("ativo", true).maybeSingle();
    if (!perfil) return resp({ error: "sem_permissao" }, 403);
    // 2) limite por minuto (se o SQL de segurança ainda não foi aplicado, segue sem limite)
    const { data: okLimite, error: eL } = await sb.rpc("rl_servico", { p_chave: ud.user.id, p_bucket: "identificar", p_max: 10 });
    if (!eL && okLimite === false) return resp({ error: "limite_excedido" }, 429);

    const bruto = await req.text();
    if (bruto.length > MAX_BASE64 + 2000) return resp({ error: "imagem_grande" }, 413);
    const { imagemBase64 } = JSON.parse(bruto || "{}");
    if (!imagemBase64 || typeof imagemBase64 !== "string") return resp({ error: "imagemBase64 é obrigatório" }, 400);
    if (imagemBase64.length > MAX_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(imagemBase64.slice(0, 200))) return resp({ error: "imagem_invalida" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) { console.error("GEMINI_API_KEY não configurada"); return resp({ error: "servico_indisponivel" }, 500); }

    let ultimoErro: string | null = null;
    for (const modelo of MODELOS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
          {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ contents: [{ parts: [
              { text: `Identifique o produto de supermercado nesta foto (nome comercial completo, com marca se visível). ` +
                `Escolha o setor mais adequado dentre exatamente estas opções: ${SETORES.join(", ")}. ` +
                `Responda SOMENTE com um JSON válido, sem markdown, no formato exato: {"nome": "...", "setor": "..."}` },
              { inline_data: { mime_type: "image/jpeg", data: imagemBase64 } }
            ] }] }),
          }
        );
        clearTimeout(timeoutId);
        if (r.status === 404) { ultimoErro = `modelo ${modelo} indisponível (404)`; continue; }
        const data = await r.json();
        if (data.error) { ultimoErro = data.error.message || "erro na API do Gemini"; continue; }
        const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const resultado = JSON.parse(texto.replace(/```json|```/g, "").trim());
        if (!resultado.nome) { ultimoErro = "resposta sem nome"; continue; }
        return resp({ nome: String(resultado.nome).slice(0, 200), setor: SETORES.includes(resultado.setor) ? resultado.setor : "Outro" });
      } catch (e) {
        clearTimeout(timeoutId);
        ultimoErro = (e as Error).name === "AbortError" ? `modelo ${modelo} demorou mais de ${TIMEOUT_MS / 1000}s` : String(e);
        console.error(`Falha no modelo ${modelo}:`, ultimoErro);
      }
    }
    console.error("identificar-produto sem resposta:", ultimoErro);
    return resp({ error: "Gemini indisponível" }, 502);
  } catch (e) {
    console.error("Erro em identificar-produto:", e);
    return resp({ error: "falha_interna" }, 500);
  }
});
