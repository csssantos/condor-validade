import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não encontradas. Configure o arquivo .env (veja .env.example)."
  );
}

// Freio no próprio aparelho: no máximo ~150 chamadas ao servidor a cada 10 s (acima disso as chamadas esperam
// na fila) e, se o servidor responder 429/503, o app espera antes de insistir. Evita laço de requisições
// travar o app ou derrubar o servidor por bug/abuso. O servidor tem limites próprios (ver supabase-seguranca.sql).
const JANELA_MS = 10000, MAX_JANELA = 150;
let marcas = [], pausaAte = 0;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchComFreio(url, opcoes) {
  for (let i = 0; i < 40; i++) {
    const agora = Date.now();
    marcas = marcas.filter((t) => agora - t < JANELA_MS);
    if (agora >= pausaAte && marcas.length < MAX_JANELA) break;
    await dormir(Math.max(200, Math.min(2000, pausaAte - agora, JANELA_MS - (agora - (marcas[0] || agora)))));
  }
  marcas.push(Date.now());
  const resp = await fetch(url, opcoes);
  if (resp.status === 429 || resp.status === 503) pausaAte = Date.now() + 5000;
  return resp;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchComFreio } });
