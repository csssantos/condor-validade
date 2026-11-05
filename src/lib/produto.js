// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { supabase } from "../supabaseClient";

// Código de barras de verdade: EAN-8 (ex.: Kinder Ovo), UPC-A (12) ou EAN-13, com dígito verificador correto e fora tudo-zero.
// Códigos de balança e produto por peso ficam de fora, tratados à parte.
function eanValido(c) {
  const t = String(c || "");
  if (!/^\d+$/.test(t) || ![8, 12, 13].includes(t.length) || /^0+$/.test(t)) return false;
  let soma = 0;
  for (let i = t.length - 2, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(t[i]) * peso;
  return (10 - (soma % 10)) % 10 === Number(t[t.length - 1]);
}

// Desvincular o Telegram: a função remove (com a permissão do banco) e o bot AVISA no Telegram que foi desvinculado
async function removerTelegramComAviso(alvo) {
  const { data, error } = await supabase.functions.invoke("telegram-desvincular", { body: alvo || {} });
  if (error) return { error };
  if (data?.erro) return { error: { message: data.erro } };
  return { error: null };
}

// Texto do lote para telas e relatórios: "L123" / "Sem lote" / "" (cadastro antigo, anterior ao lote real)
const textoLote = (x) => (x && x.lote ? x.lote : x && x.semLote ? "Sem lote" : "");

// Lote que já existe: só soma quantidade, no máximo metade do que já tem (mínimo 10 un) por vez
const limiteSomaLote = (q) => Math.max(10, Math.ceil((Number(q) || 0) * 0.5));

export { eanValido, limiteSomaLote, removerTelegramComAviso, textoLote };
