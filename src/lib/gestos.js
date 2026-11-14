// Lei de Jakob: o app se comporta como os apps que a pessoa já conhece (voltar do sistema, gesto de borda,
// puxar para atualizar). Aqui só a lógica pura (testada em teste-gestos.mjs); o DOM fica em componentes/Gestos.jsx.

// Quantas "camadas" o app tem abertas por cima do início (cada uma vale uma entrada no histórico do navegador).
export function profundidade({ detalhe, flow, setor, sub, tab }) {
  let n = 0;
  if (detalhe) n++;
  if (flow) return n + 1;
  if (setor) n++;
  if (sub) n++;
  if (tab && tab !== "home") n++;
  if (tab && String(tab).startsWith("cfg-")) n++; // página de Mais: volta para "Mais" e depois para o início
  return n;
}

// O que o "voltar" fecha primeiro (a camada de cima). null = nada aberto (o sistema sai do app).
export function passoVoltar({ detalhe, flow, setor, sub, tab }) {
  if (detalhe) return "detalhe";
  if (flow) return "flow";
  if (sub) return "sub";
  if (setor) return "setor";
  if (tab && String(tab).startsWith("cfg-")) return "ajustes";
  if (tab && tab !== "home") return "home";
  return null;
}

// Mantém o histórico do navegador com uma entrada por camada. Devolve quantas empurrar e quantas desfazer.
export function reconciliar(entradas, camadas) {
  const e = Math.max(0, entradas | 0), c = Math.max(0, camadas | 0);
  return { empurrar: Math.max(0, c - e), desfazer: Math.max(0, e - c) };
}

// Puxar para atualizar: o dedo anda o dobro do que o indicador mostra (resistência), com teto.
export const LIMITE_PUXAR = 64;
export function puxada(dy) { return Math.max(0, Math.min(LIMITE_PUXAR * 1.6, dy * 0.5)); }
export function passouDoLimite(dy) { return puxada(dy) >= LIMITE_PUXAR; }

// Deslizar da borda esquerda para voltar: precisa sair da borda, andar para a direita e ser mais horizontal que vertical.
export const BORDA_PX = 22, VOLTAR_PX = 80;
export function gestoDeVoltar({ x0, dx, dy }) {
  return x0 <= BORDA_PX && dx >= VOLTAR_PX && Math.abs(dy) < dx * 0.6;
}

// Tela com dados digitados registra aqui uma pergunta ("descartar?"): o voltar do sistema e o gesto de borda respeitam,
// igual ao botão voltar da própria tela. fn() devolve true para seguir ou false para ficar.
export const guardaVoltar = { fn: null };
