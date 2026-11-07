// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { loadLocal, saveLocal, supaBaixarProduto, supaDeleteProduto, supaInserirHistorico, supaUpsertCatalogo, supaUpsertProduto } from "./dados";

// ---------- Fila offline: se a internet cair, guarda as operações e reenvia quando voltar ----------
const OUTBOX_KEY = "condor-validade:fila-offline";

// Dono das ações guardadas: uma ação feita por uma pessoa nunca é enviada com a sessão de outra (aparelho compartilhado)
let USUARIO_FILA = null;
function definirUsuarioFila(id) { USUARIO_FILA = id || null; }
function usuarioFila() { return USUARIO_FILA; }

function lerFila() { return loadLocal(OUTBOX_KEY, []); }

function gravarFila(fila) { saveLocal(OUTBOX_KEY, fila); }

// guarda a ação com o dono; sem ninguém logado não guarda (devolve false)
function enfileirar(tipo, payload) {
  if (!USUARIO_FILA) return false;
  const fila = lerFila();
  fila.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tipo, payload, uid: USUARIO_FILA, criadoEm: new Date().toISOString() });
  gravarFila(fila);
  return true;
}

// Ações gravadas antes do dono existir (versão antiga) não vão com a conta de ninguém; ações de outra pessoa vencem em 7 dias.
// Devolve quantas foram descartadas, para avisar na tela.
const PRAZO_FILA_MS = 7 * 86400000;
function limparFilaOrfa() {
  const fila = lerFila(); const agora = Date.now();
  const fica = fila.filter((op) => op.uid && (op.uid === USUARIO_FILA || agora - Date.parse(op.criadoEm || 0) < PRAZO_FILA_MS));
  if (fica.length !== fila.length) gravarFila(fica);
  return fila.length - fica.length;
}

// Erro de rede (volta sozinho) x erro do banco (regra/permissão: reenviar não adianta)
function erroDeRede(e) {
  if (!navigator.onLine) return true;
  const m = String((e && (e.message || e.details)) || e || "");
  if (/limite_excedido/.test(m)) return true; // limite por minuto: não é falha definitiva, a operação fica na fila e tenta de novo
  if (/PGRST301|JWT expired|jwt expired|invalid jwt|nao_autenticado/i.test(m + " " + ((e && e.code) || ""))) return true; // sessão vencida: guarda e envia quando a pessoa entrar de novo
  return !(e && e.code) && /fetch|network|timeout|conex|load failed|abort/i.test(m);
}

function mensagemErroGravacao(e) {
  const m = String((e && e.message) || "");
  if (/ean_invalido/.test(m)) return "código de barras inválido (precisa ser EAN-8, UPC-A ou EAN-13 válido)";
  if (/baixa_exige_encarregado/.test(m)) return "só o encarregado do setor (ou superior) pode dar baixa";
  if (/editar_exige_autor/.test(m)) return "você só pode editar produtos que você mesmo lançou";
  if (/editar_exige_encarregado/.test(m)) return "só o encarregado do setor (ou superior) pode editar esse produto";
  if (/excluir_exige_encarregado/.test(m)) return "só encarregado ou superior pode excluir esse produto (use \"Dar baixa\")";
  if (/23505|duplicate key|produtos_lote_unico/i.test(m + (e && e.code))) return "esse lote já está lançado nesse produto: use \"Somar ao lote\" ou confira o número do lote";
  if (/lote_validade_diferente/.test(m)) return "esse lote já existe com outra validade: confira o lote e a validade da embalagem";
  if (/lote_obrigatorio/.test(m)) return "falta o lote (ou marcar que não tem lote impresso)";
  if (/lote_invalido/.test(m)) return "lote inválido (use letras, números, . / - e até 20 caracteres)";
  if (/produto_travado_pedido/.test(m)) return "esse lote tem pedido de promoção ou preço direto registrado e está travado: o encarregado do setor precisa remover o pedido antes de alterar";
  if (/valor_pedido_obrigatorio/.test(m)) return "informe o valor pedido";
  if (/valor_pedido_invalido/.test(m)) return "valor pedido inválido (de R$ 0,01 a R$ 5.000,00)";
  if (/campanha_invalida/.test(m)) return "número da campanha inválido (use letras, números, . / - e até 20 caracteres)";
  if (/pedido_promocao_invalido/.test(m)) return "tipo de pedido inválido";
  if (/pedido_so_pela_funcao/.test(m)) return "esse campo só muda pelo botão de pedido";
  if (/sem_permissao/.test(m)) return "você não tem permissão para isso";
  if (/sem_sessao/.test(m)) return "sua sessão terminou; entre de novo e refaça";
  if (/validade_vencida/.test(m)) return "a validade já passou";
  if (/produto_fora_da_marca/.test(m)) return "esse produto não é de uma das marcas do seu acesso de promotor";
  if (/validade_muito_proxima/.test(m)) return "o produto vence em até 2 dias: leve ao gerente ou encarregado para pedir o preço direto";
  if (/validade_invalida/.test(m)) return "validade longe demais (máximo 10 anos)";
  if (/quantidade_invalida/.test(m)) return "quantidade inválida";
  if (/motivo_invalido/.test(m)) return "motivo da baixa inválido";
  if (/produto_nao_encontrado/.test(m)) return "esse produto não existe mais (talvez outra pessoa já deu baixa)";
  if (/aumento_excessivo/.test(m)) return "o aumento de quantidade passou do limite do dia para esse produto (máx. +10 ou metade). Peça a um encarregado para ajustar";
  if (/limite_excedido/.test(m)) return "muitas ações em pouco tempo; espere um minuto";
  if (/row-level security|permission|42501/i.test(m + (e && e.code))) return "você não tem permissão para isso";
  if (/limite|rate/i.test(m)) return "muitas ações em pouco tempo; espere um pouco";
  return "o banco recusou o registro";
}

// Avisa a tela quando uma gravação foi RECUSADA pelo banco (o "salvo" otimista não é verdade) e pede recarregar os dados reais
function avisarErroGravacao(e, o_que) {
  try { window.dispatchEvent(new CustomEvent("condor-erro-gravacao", { detail: { mensagem: `Não foi possível gravar ${o_que}: ${mensagemErroGravacao(e)}.` } })); } catch {}
}

async function executarOp(op) {
  if (op.tipo === "upsertProduto") await supaUpsertProduto(op.payload);
  else if (op.tipo === "deleteProduto") await supaDeleteProduto(op.payload.id);
  else if (op.tipo === "upsertCatalogo") await supaUpsertCatalogo(op.payload.barcode, op.payload.dados);
  else if (op.tipo === "inserirHistorico") await supaInserirHistorico(op.payload);
  else if (op.tipo === "baixarProduto") await supaBaixarProduto(op.payload);
}

const NOME_OP = { upsertProduto: "o produto", deleteProduto: "a exclusão do produto", upsertCatalogo: "o cadastro do produto", inserirHistorico: "a baixa", baixarProduto: "a baixa" };

// texto do aviso com o nome do produto quando há (a fila pode rodar horas depois e a pessoa não lembra qual era)
function nomeDaOp(op) {
  const base = NOME_OP[op.tipo] || "o registro";
  const nome = op.payload && (op.payload.nome || (op.payload.dados && op.payload.dados.nome));
  return nome ? `${base} "${String(nome).slice(0, 40)}"` : base;
}

// baixa reenviada depois de uma resposta perdida: se o produto já não existe, a baixa JÁ aconteceu (ou outra pessoa fez); não é erro
function jaFeita(op, e) { return op.tipo === "baixarProduto" && /produto_nao_encontrado/.test(String((e && e.message) || "")); }

let ENVIANDO_FILA = false;
// envia só as ações da pessoa logada; no fim relê a fila e tira só o que foi resolvido (o que entrou no meio continua guardado)
async function processarFila(onProgresso) {
  if (ENVIANDO_FILA || !USUARIO_FILA) return 0;
  const dono = USUARIO_FILA;
  const daPessoa = lerFila().filter((op) => op.uid === dono);
  if (!daPessoa.length) return 0;
  ENVIANDO_FILA = true;
  const resolvidos = new Set(); let processados = 0;
  try {
    for (const op of daPessoa) {
      if (USUARIO_FILA !== dono) break; // trocou de conta no meio: o resto espera o dono
      try {
        await executarOp(op);
        resolvidos.add(op.id); processados++;
        if (onProgresso) onProgresso(processados, daPessoa.length);
      } catch (e) {
        if (jaFeita(op, e)) { // reenvio depois de resposta perdida: a baixa já existe no servidor; alinha a tela sem aviso
          resolvidos.add(op.id); processados++; if (onProgresso) onProgresso(processados, daPessoa.length);
          try { window.dispatchEvent(new CustomEvent("condor-recarregar-dados")); } catch {}
        } else if (!erroDeRede(e)) { resolvidos.add(op.id); avisarErroGravacao(e, nomeDaOp(op)); } // recusado pelo banco: avisa, não adianta reenviar
        // erro de rede/sessão: continua guardada
      }
    }
  } finally {
    gravarFila(lerFila().filter((op) => !resolvidos.has(op.id)));
    ENVIANDO_FILA = false;
  }
  return processados;
}

// wrappers que caem pra fila automaticamente quando offline
async function gravarComFila(tipo, payload) {
  const op = { tipo, payload };
  const guardar = () => { if (!enfileirar(tipo, payload)) avisarErroGravacao({ message: "sem_sessao" }, nomeDaOp(op)); };
  if (!navigator.onLine) { guardar(); return; }
  try { await executarOp(op); }
  catch (e) {
    if (erroDeRede(e)) guardar();
    else avisarErroGravacao(e, nomeDaOp(op));
  }
}

async function gravarProduto(item) { return gravarComFila("upsertProduto", item); }

async function removerProduto(id, nome) { return gravarComFila("deleteProduto", { id, nome }); }

async function gravarCatalogo(barcode, dados) { return gravarComFila("upsertCatalogo", { barcode, dados }); }

async function gravarHistorico(registro) { return gravarComFila("inserirHistorico", registro); }

export { definirUsuarioFila, usuarioFila, limparFilaOrfa, NOME_OP, OUTBOX_KEY, avisarErroGravacao, enfileirar, erroDeRede, executarOp, gravarCatalogo, gravarComFila, gravarFila, gravarHistorico, gravarProduto, jaFeita, lerFila, mensagemErroGravacao, nomeDaOp, processarFila, removerProduto };
