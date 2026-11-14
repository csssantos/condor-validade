// Textos do resumo diário (puro, sem rede): usado pela Edge Function `resumo-diario` e pelo teste (teste-resumo-diario.mjs).
// Tudo que vem do banco (nome da pessoa, nome do produto, lote) passa por `limpaTxt`: sem controle, sem endereço, com tamanho máximo.
export type Top = { nome: string; dias: number; validade: string; lote: string | null; quantidade: number | null; pedido: boolean };
export type Resumo = { vencidos: number; hoje: number; amanha: number; ate10: number; sem_pedido: number; aprovacoes: number; top: Top[]; nome: string; setor: string | null; hoje_data: string };

export const limpaTxt = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, "[removido]").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 99999) : 0; };
export const primeiroNome = (nome: unknown) => limpaTxt(nome, 40).split(" ")[0] || "";
export const fmtDia = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? `${m[3]}/${m[2]}` : "?"; };

export function normalizar(r: any): Resumo | null {
  if (!r || typeof r !== "object") return null;
  const top: Top[] = (Array.isArray(r.top) ? r.top : []).slice(0, 5).map((t: any) => ({
    nome: limpaTxt(t?.nome, 60) || "Produto", dias: Number.isFinite(Number(t?.dias)) ? Number(t.dias) : 0, validade: String(t?.validade ?? "").slice(0, 10),
    lote: t?.lote ? limpaTxt(t.lote, 20) : null, quantidade: t?.quantidade == null ? null : num(t.quantidade), pedido: t?.pedido === true,
  }));
  return { vencidos: num(r.vencidos), hoje: num(r.hoje), amanha: num(r.amanha), ate10: num(r.ate10), sem_pedido: num(r.sem_pedido), aprovacoes: num(r.aprovacoes), top,
    nome: limpaTxt(r.nome, 40), setor: r.setor ? limpaTxt(r.setor, 40) : null, hoje_data: String(r.hoje_data ?? "").slice(0, 10) };
}
// só manda quando há algo a avisar (nenhuma mensagem vazia)
export const temConteudo = (r: Resumo) => r.vencidos + r.ate10 + r.aprovacoes > 0;

const quando = (d: number) => (d < 0 ? "vencido" : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`);
export function linhaTop(t: Top) {
  return `• ${t.nome} · ${fmtDia(t.validade)} (${quando(t.dias)}) · ${t.lote ? "lote " + t.lote : "sem lote"}${t.quantidade != null ? ` · ${t.quantidade} un` : ""}${t.pedido ? " · campanha ✓" : t.dias >= 0 ? " · SEM campanha" : ""}`;
}
export function linhasContagem(r: Resumo): string[] {
  const l: string[] = [];
  if (r.vencidos) l.push(`🔴 Vencidos no estoque: ${r.vencidos} (retire de venda)`);
  if (r.hoje || r.amanha) l.push(`🟠 Vencem hoje: ${r.hoje} · amanhã: ${r.amanha}`);
  if (r.ate10) l.push(`📅 Vencem em até 10 dias: ${r.ate10} (sem campanha: ${r.sem_pedido})`);
  if (r.aprovacoes) l.push(`📦 Produto novo esperando aprovação: ${r.aprovacoes}`);
  return l;
}
export function textoTelegram(r: Resumo): string {
  const nome = primeiroNome(r.nome);
  const partes = [`🗓️ Bom dia${nome ? ", " + nome : ""}! Resumo de hoje${r.setor ? " · " + r.setor : ""}`, "", ...linhasContagem(r)];
  if (r.top.length) partes.push("", "Mais urgentes:", ...r.top.map(linhaTop));
  partes.push("", "Abra o app para agir. Para desligar: Mais → Notificações.");
  return partes.join("\n").slice(0, 1000); // limite da legenda do Telegram
}
export function corpoPush(r: Resumo): string {
  const p: string[] = [];
  if (r.vencidos) p.push(`${r.vencidos} vencido(s)`);
  if (r.hoje) p.push(`${r.hoje} vence(m) hoje`);
  if (r.ate10) p.push(`${r.ate10} em até 10 dias (${r.sem_pedido} sem campanha)`);
  if (r.aprovacoes) p.push(`${r.aprovacoes} produto(s) novo(s) para aprovar`);
  return p.join(" · ").slice(0, 180);
}
export function mensagemEmail(r: Resumo): string {
  const nome = primeiroNome(r.nome);
  return `Bom dia${nome ? ", " + nome : ""}! Este é o resumo de hoje${r.setor ? " do setor " + r.setor : ""}. Abra o app para agir. Para desligar este e-mail: Mais → Notificações.`;
}
export function detalhesEmail(r: Resumo): [string, string][] {
  const d: [string, string][] = [];
  if (r.vencidos) d.push(["Vencidos no estoque", `${r.vencidos} (retire de venda)`]);
  if (r.hoje || r.amanha) d.push(["Vencem hoje / amanhã", `${r.hoje} / ${r.amanha}`]);
  if (r.ate10) d.push(["Em até 10 dias", `${r.ate10} (sem campanha: ${r.sem_pedido})`]);
  if (r.aprovacoes) d.push(["Produto novo para aprovar", String(r.aprovacoes)]);
  r.top.forEach((t, i) => d.push([`Urgente ${i + 1}`, linhaTop(t).replace(/^• /, "")]));
  return d;
}
