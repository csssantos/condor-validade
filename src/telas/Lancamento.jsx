// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useMemo, useEffect } from "react";
import { MapPin, Barcode, Calendar, Check, Clock, AlertTriangle, PackageX, ShieldAlert, Sparkles, ArrowLeft } from "lucide-react";
import { CampoData } from "../componentes/CampoData";
import { Thumb } from "../componentes/ItemCards";
import { BLUE, BLUE_DARK, BLUE_SOFT, DIAS_ALERTA_BASE, MOTIVOS_BAIXA, RED, RED_DARK, RED_SOFT, ehPerecivel } from "../lib/constantes";
import { calcularOpcoesAlerta, formatarData, formatarMoeda } from "../lib/formatos";
import { limiteSomaLote } from "../lib/produto";
import { clampNumero, ordemUnidadesPeloSetor, sanitizarTexto } from "../lib/utilidades";

// ============ Validade ============
function ExpiryView({ T, product, barcode, editing, items, vozPre, onCancel, onVoltar, onSave, onBaixaDireta }) {
  const [validade, setValidade] = useState(editing ? editing.validade : (vozPre?.validade || ""));
  const [diasSelecionados, setDiasSelecionados] = useState(editing ? [editing.diasAlerta, ...(editing.diasAlertaExtras || [])] : [15]);
  const isAcougue = product.setor === "Açougue";
  const [porPeso, setPorPeso] = useState(editing ? !!editing.porPeso : (vozPre?.porPeso ? true : product.porPeso != null ? !!product.porPeso : isAcougue));
  const [quantidade, setQuantidade] = useState(editing ? editing.quantidade || 1 : (
    vozPre?.quantidade != null ? vozPre.quantidade : product.pesoLido || (product.precoLidoEmbutido && product.precoUnitario ? Number((product.precoLidoEmbutido / product.precoUnitario).toFixed(3)) : 1)
  ));
  const [precoUnitario, setPrecoUnitario] = useState(editing ? editing.precoUnitario || "" : product.precoUnitario || "");
  const [tamanho, setTamanho] = useState(editing ? editing.tamanho || "" : (product.tamanho || ""));
  const [unidadeMedida, setUnidadeMedida] = useState(editing
    ? (editing.unidadeMedida === "UN" ? "KG" : editing.unidadeMedida) || "KG"
    : (product.tamanho && ["G", "KG", "ML", "L"].includes(product.unidadeMedida) ? product.unidadeMedida : "G")); // padrão G (grama); se o cadastro já tem tamanho com unidade, respeita (evita gravar 1 L como 1 G)
  const [observacoes, setObservacoes] = useState(editing ? editing.observacoes || "" : "");
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false);
  const [lote, setLote] = useState(editing ? editing.lote || "" : (vozPre?.lote || ""));
  const [semLote, setSemLote] = useState(editing ? !!editing.semLote : !!vozPre?.semLote);
  const [local, setLocal] = useState(editing ? editing.local || "loja" : "loja");
  const [corredorDeposito, setCorredorDeposito] = useState(editing ? editing.corredorDeposito || "" : product.corredorDeposito || "");
  const [moduloDeposito, setModuloDeposito] = useState(editing ? editing.moduloDeposito || "" : product.moduloDeposito || "");
  const [nivelDeposito, setNivelDeposito] = useState(editing ? editing.nivelDeposito || "" : product.nivelDeposito || "");
  const [vaoDeposito, setVaoDeposito] = useState(editing ? editing.vaoDeposito || "" : product.vaoDeposito || "");
  const [motivoBaixaDireta, setMotivoBaixaDireta] = useState("Enviado para descarte");

  const perecivel = ehPerecivel(product.setor);
  const { opcoes, restritivo, diasRestantesAtual, motivoUmDia } = useMemo(() => calcularOpcoesAlerta(validade, perecivel), [validade, perecivel]);

  useEffect(() => {
    if (opcoes.length) setDiasSelecionados((prev) => { const filtrado = prev.filter((d) => opcoes.includes(d)); return filtrado.length ? filtrado : [opcoes[opcoes.length - 1]]; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validade]);

  function alternarDia(n) {
    setDiasSelecionados((prev) => {
      if (prev.includes(n)) return prev.length > 1 ? prev.filter((d) => d !== n) : prev;
      if (prev.length >= 3) return prev;
      return [...prev, n].sort((a, b) => b - a);
    });
  }

  // Validade fora do normal (ano de 2 dígitos vira 0026; ano 9999): bloqueia em vez de tratar como "vencido" ou aceitar
  const anoValidade = validade ? Number(String(validade).slice(0, 4)) : null;
  const anoAtual = new Date().getFullYear();
  const dataRuim = !!validade && (!(anoValidade >= anoAtual - 1) || anoValidade > anoAtual + 10);
  // Quantidade: sem corrigir em silêncio; mostra o motivo e não deixa salvar
  const qtdNum = Number(quantidade);
  const qtdMsg = String(quantidade) === "" ? "Informe a quantidade."
    : !Number.isFinite(qtdNum) || qtdNum <= 0 ? "A quantidade precisa ser maior que zero."
    : porPeso ? (qtdNum > 9999 ? "O máximo é 9999 kg." : "")
    : !Number.isInteger(qtdNum) ? "Use só números inteiros (sem vírgula nem ponto)." : qtdNum > 99999 ? "O máximo é 99999 unidades." : "";
  const sujo = !editing && (!!validade || !!lote.trim());
  const cancelar = () => { if (sujo && !window.confirm("Descartar o que você digitou?")) return; onCancel(); };
  const voltar = () => { if (sujo && !window.confirm("Voltar e perder a validade e o lote digitados?")) return; onVoltar(); };
  const loteNorm = lote.trim().toUpperCase();
  const loteValido = /^[A-Z0-9][A-Z0-9./ -]{0,19}$/.test(loteNorm) && /\d/.test(loteNorm);
  const loteOk = !!editing || porPeso || semLote || loteValido; // lançamento novo exige o lote impresso (ou "sem lote" dito de propósito)
  const jaVencido = !!validade && !dataRuim && diasRestantesAtual !== null && diasRestantesAtual <= 0;
  const podeRegistrarPerda = jaVencido && !!tamanho.trim() && !!motivoBaixaDireta && !qtdMsg;
  const valorTotal = (Number(quantidade) || 0) * (Number(precoUnitario) || 0);

  // Itens por peso costumam repetir o mesmo código de barras (etiqueta da balança) com pesos diferentes —
  // não é duplicidade real, então não bloqueia/avisa nesse caso.
  const lotesDoProduto = items.filter((i) => i.barcode === barcode && (!editing || i.id !== editing.id)).sort((a, b) => String(a.validade).localeCompare(String(b.validade)));
  // Lote que já existe no produto: não cria linha nova, só SOMA na quantidade (com teto no aumento)
  const loteExistente = !editing && !porPeso && loteNorm ? (lotesDoProduto.find((i) => i.lote === loteNorm) || null) : null;
  const limiteSoma = loteExistente ? limiteSomaLote(loteExistente.quantidade) : 0;
  const qtdSomar = Number(quantidade) || 0;
  const somaErro = !loteExistente ? "" : (validade && validade !== loteExistente.validade) ? `Esse lote vence em ${formatarData(loteExistente.validade)}. A validade precisa ser a mesma.` : qtdSomar > limiteSoma ? `Só dá para somar até ${limiteSoma} un de uma vez nesse lote. Se a contagem mudou muito, edite o lote.` : "";
  // mesma regra do Telegram: lançamento novo (ou validade alterada) que vence em até 2 dias não é lançado; leve ao gerente/encarregado para pedir o preço direto
  const MSG_PROXIMA = "Esse produto vence em até 2 dias. Leve ao gerente ou encarregado o mais rápido possível, para pedir o preço direto.";
  const muitoProxima = !!validade && !dataRuim && diasRestantesAtual !== null && diasRestantesAtual >= 1 && diasRestantesAtual <= 2 && (!editing || validade !== editing.validade);
  const podeSalvar = !muitoProxima && !!validade && !dataRuim && !qtdMsg && opcoes.length > 0 && !!tamanho.trim() && loteOk && !(loteExistente && somaErro);
  // por que o botão Salvar está cinza (nunca deixar a pessoa sem explicação)
  const motivoBloqueio = !validade ? "Informe a validade."
    : dataRuim ? "Confira o ano da validade."
    : diasRestantesAtual !== null && diasRestantesAtual === 0 ? "Esse produto vence hoje: use o registro de perda acima (não entra em alerta)."
    : diasRestantesAtual !== null && diasRestantesAtual < 0 ? "Esse produto já venceu: use o registro de perda acima."
    : muitoProxima ? MSG_PROXIMA
    : qtdMsg ? qtdMsg
    : !tamanho.trim() ? "Preencha o tamanho/embalagem."
    : !loteOk ? "Informe o lote impresso na embalagem (precisa ter ao menos um número) ou marque que não tem lote."
    : loteExistente && somaErro ? somaErro
    : opcoes.length === 0 ? "Não há alerta possível para essa validade." : "";
  const duplicado = !editing && validade && !porPeso && !loteNorm
    ? lotesDoProduto.some((i) => i.validade === validade && !i.lote)
    : false;

  function handleRegistrarPerda() {
    onBaixaDireta({
      validade, quantidade: porPeso ? clampNumero(quantidade, 0.001, 9999) : clampNumero(quantidade, 1, 99999),
      precoUnitario: clampNumero(precoUnitario, 0, 999999), porPeso,
      tamanho: sanitizarTexto(tamanho.trim(), 20), unidadeMedida,
      observacoes: sanitizarTexto(observacoes.trim(), 300), motivo: motivoBaixaDireta
    });
  }

  function handleSalvar() {
    if (loteExistente) { if (somaErro) return; onSave({ somarAoLoteId: loteExistente.id, quantidade: Math.max(1, Math.round(qtdSomar)) }); return; }
    if (duplicado && !confirmarDuplicado) { setConfirmarDuplicado(true); return; }
    const ordenados = [...diasSelecionados].sort((a, b) => b - a);
    onSave({
      validade, diasAlerta: ordenados[0], diasAlertaExtras: ordenados.slice(1),
      quantidade: porPeso ? clampNumero(quantidade, 0.001, 9999) : clampNumero(quantidade, 1, 99999),
      precoUnitario: clampNumero(precoUnitario, 0, 999999),
      porPeso,
      tamanho: sanitizarTexto(tamanho.trim(), 20), unidadeMedida,
      lote: !porPeso && loteValido ? loteNorm : null, semLote: !porPeso && !loteValido && semLote,
      observacoes: sanitizarTexto(observacoes.trim(), 300),
      local, corredorDeposito: local === "deposito" ? (corredorDeposito || null) : null,
      moduloDeposito: local === "deposito" ? (moduloDeposito || null) : null,
      nivelDeposito: local === "deposito" ? (nivelDeposito || null) : null,
      vaoDeposito: local === "deposito" ? (vaoDeposito || null) : null
    });
  }

  return (
    <div className="px-4 pt-4">
      <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl p-4 border shadow-lg shadow-black/5 mb-4 flex items-center gap-3">
        <Thumb foto={product.foto} size={44} />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{product.nome}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px]"><MapPin size={11} /> {product.subsetor ? `${product.setor} · ${product.subsetor}` : product.setor}{perecivel ? " · perecível" : ""}</span>
            <span style={{ color: T.subtext }} className="inline-flex items-center gap-1 text-[11px] font-mono"><Barcode size={11} /> {barcode}</span>
          </div>
        </div>
      </div>

      <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl p-4 border shadow-lg shadow-black/5 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:items-start">
        <div>
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><Calendar size={13} /> Data de validade</label>
          <CampoData T={T} value={validade} onChange={setValidade}
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder, boxSizing: "border-box", maxWidth: "100%" }}
            className="w-full min-w-0 border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
          {dataRuim && <p style={{ color: RED_DARK }} className="text-[11px] font-semibold mt-1.5">Data fora do normal ({String(validade).slice(0, 4)}). Confira o ano: use 4 dígitos, entre {anoAtual - 1} e {anoAtual + 10}.</p>}
        </div>

        {!porPeso && (
          <div>
            <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><Barcode size={13} /> Lote <span style={{ color: RED }}>*</span></label>
            <input value={lote} maxLength={20} disabled={semLote} autoCapitalize="characters"
              onChange={(e) => { setLote(e.target.value.replace(/[^A-Za-z0-9./ -]/g, "").toUpperCase().slice(0, 20)); setSemLote(false); }}
              placeholder="Número do lote impresso na embalagem (ex.: L2410A)"
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder, opacity: semLote ? 0.5 : 1 }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 uppercase" />
            <button type="button" onClick={() => { setSemLote(!semLote); if (!semLote) setLote(""); }} style={{ color: semLote ? BLUE : T.subtext }} className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
              <span style={{ borderColor: semLote ? BLUE : T.inputBorder, background: semLote ? BLUE : "transparent" }} className="h-4 w-4 rounded border flex items-center justify-center">{semLote && <Check size={11} color="#fff" />}</span>
              Esta embalagem não tem lote impresso
            </button>
            {lotesDoProduto.length > 0 && (
              <div style={{ background: T.chipBg }} className="mt-2 rounded-xl p-2.5">
                <p style={{ color: T.subtext }} className="text-[10.5px] font-bold uppercase tracking-wide mb-1">Já lançados deste produto ({lotesDoProduto.length})</p>
                {lotesDoProduto.slice(0, 5).map((l) => (
                  <p key={l.id} style={{ color: T.text }} className="text-[12px]">{l.lote ? `Lote ${l.lote}` : "Sem lote"} · vence {formatarData(l.validade)} · {l.quantidade || 1} {l.porPeso ? "kg" : "un"}</p>
                ))}
                <p style={{ color: T.subtext }} className="text-[11px] mt-1">Se o lote da embalagem for diferente, ele entra como um lote novo.</p>
              </div>
            )}
          </div>
        )}

        <div className="lg:col-span-2">
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Tamanho / quantidade da embalagem <span style={{ color: RED }}>*</span></label>
          <div className="flex gap-2">
            <input value={tamanho} inputMode="decimal" maxLength={7}
              onChange={(e) => setTamanho(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
              placeholder="Ex: 500, 1, 900"
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
            <select value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)}
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }}
              className="w-[84px] shrink-0 border rounded-xl px-2 py-2.5 text-sm font-semibold outline-none focus:ring-2">
              {ordemUnidadesPeloSetor(product.setor).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="lg:col-span-2">
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><Clock size={13} /> Avisar quantos dias antes de vencer? <span style={{ color: T.subtext, fontWeight: 400 }}>(até 3)</span></label>

          {validade && diasRestantesAtual !== null && opcoes.length === 0 ? (
            <div style={{ background: RED_SOFT, color: RED_DARK }} className="rounded-xl overflow-hidden">
              <div className="text-xs font-medium px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{diasRestantesAtual <= 0 ? "Esta data já venceu ou vence hoje." : "Data muito próxima."} Não é possível definir uma antecedência de alerta.</span>
              </div>
              {!onBaixaDireta && !editing && jaVencido && (
                <p className="text-[10.5px] font-semibold px-3 pb-3">Produto vencido: avise o encarregado do setor para registrar a perda.</p>
              )}
              {onBaixaDireta && jaVencido && (
                <div className="px-3 pb-3">
                  <p className="text-[10.5px] font-semibold mb-1.5">Quantas {porPeso ? "kg" : "unidade(s)"} estão sendo descartadas?</p>
                  <input type="number" inputMode="decimal" min={porPeso ? 0.001 : 1} step={porPeso ? "0.001" : "1"}
                    value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(",", "."))}
                                        placeholder={porPeso ? "Ex: 1,235" : "Ex: 3"}
                    style={{ background: "rgba(255,255,255,0.7)", borderColor: "transparent" }}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 mb-2.5" />
                  <p className="text-[10.5px] font-semibold mb-1.5">Motivo do descarte:</p>
                  <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                    {MOTIVOS_BAIXA.filter((m) => m !== "Promoção aplicada").map((m) => (
                      <button key={m} onClick={() => setMotivoBaixaDireta(m)}
                        style={motivoBaixaDireta === m ? { background: RED_DARK, color: "#fff" } : { background: "rgba(255,255,255,0.6)", color: RED_DARK }}
                        className="text-[10.5px] font-medium py-2 rounded-lg">
                        {m}
                      </button>
                    ))}
                  </div>
                  <button disabled={!podeRegistrarPerda} onClick={handleRegistrarPerda}
                    style={{ background: podeRegistrarPerda ? RED_DARK : "rgba(0,0,0,0.15)" }}
                    className="w-full text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <PackageX size={14} /> Registrar perda agora
                  </button>
                  {!tamanho.trim() && <p className="text-[10px] mt-1.5 opacity-80">Preencha o tamanho/embalagem acima pra liberar.</p>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-1.5">
                {DIAS_ALERTA_BASE.map((n) => {
                  const habilitado = opcoes.includes(n);
                  const selecionado = diasSelecionados.includes(n);
                  return (
                    <button key={n} disabled={!habilitado} onClick={() => alternarDia(n)}
                      style={
                        !habilitado ? { background: T.chipBg, color: T.subtext, opacity: 0.4, borderColor: T.border } :
                        selecionado ? { background: RED, color: "#fff", borderColor: RED } :
                        { background: T.inputBg, color: T.text, borderColor: T.border }
                      }
                      className="text-sm font-semibold py-2.5 rounded-xl border relative">
                      {n}
                    </button>
                  );
                })}
              </div>
              {muitoProxima && (
                <div style={{ background: RED_SOFT, color: RED_DARK }} className="text-[11px] font-semibold px-3 py-2 rounded-xl mt-2 flex items-start gap-1.5" role="alert">
                  <ShieldAlert size={13} className="mt-0.5 shrink-0" /> <span>{MSG_PROXIMA}</span>
                </div>
              )}
              {motivoUmDia && !muitoProxima && (
                <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-[11px] font-medium px-3 py-2 rounded-xl mt-2 flex items-start gap-1.5">
                  <Sparkles size={13} className="mt-0.5 shrink-0" /> <span>{perecivel ? "Produto perecível: liberado o lançamento mesmo faltando só 1 dia para o vencimento." : "Falta só 1 dia para o vencimento: o alerta fica em 1 dia."}</span>
                </div>
              )}
              {restritivo && !motivoUmDia && opcoes.length > 0 && (
                <div style={{ background: RED_SOFT, color: RED_DARK }} className="text-[11px] font-medium px-3 py-2 rounded-xl mt-2 flex items-start gap-1.5">
                  <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                  <span>Faltam apenas {diasRestantesAtual} dia(s) para o vencimento — por segurança, só é possível escolher {opcoes[0]} dia(s) de antecedência.</span>
                </div>
              )}
              {!restritivo && <p style={{ color: T.subtext }} className="text-[11px] mt-1.5">Selecione de 1 a 3 marcos de alerta (ex: 10, 5 e 2 dias antes).</p>}
            </>
          )}
        </div>

        {perecivel && (
          <div className="lg:col-span-2">
            <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Como esse item é vendido?</label>
            <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${T.inputBorder}` }}>
              <button type="button" onClick={() => setPorPeso(true)}
                style={porPeso ? { background: BLUE, color: "#fff" } : { background: T.inputBg, color: T.subtext }}
                className="flex-1 text-xs font-semibold py-2.5">Peso (KG)</button>
              <button type="button" onClick={() => setPorPeso(false)}
                style={!porPeso ? { background: BLUE, color: "#fff" } : { background: T.inputBg, color: T.subtext }}
                className="flex-1 text-xs font-semibold py-2.5">Por unidade</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <div>
            <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">{porPeso ? "Quantidade (KG)" : "Quantidade"}</label>
            <input type="number" inputMode="decimal" min={porPeso ? "0.001" : "1"} step={porPeso ? "0.001" : "1"} max="99999" value={quantidade}
              onChange={(e) => setQuantidade(e.target.value.replace(",", "."))}
                            placeholder={porPeso ? "Ex: 1,235" : ""}
              style={{ background: T.inputBg, color: T.text, borderColor: qtdMsg ? RED : T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
            {qtdMsg && <p style={{ color: RED_DARK }} className="text-[11px] font-semibold mt-1.5">{qtdMsg}</p>}
            {(product.pesoLido || product.precoLidoEmbutido) && !editing && (
              <p style={{ color: "#1F9D55" }} className="text-[10px] mt-1 font-medium">✓ Peso lido direto da etiqueta da balança</p>
            )}
          </div>
          <div>
            <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">{porPeso ? "Valor por KG (R$)" : "Preço unitário (R$)"}</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={precoUnitario}
              onChange={(e) => setPrecoUnitario(e.target.value)}
              onBlur={(e) => setPrecoUnitario(e.target.value === "" ? "" : clampNumero(e.target.value, 0, 999999))}
              placeholder="0,00" style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
          </div>
        </div>
        {valorTotal > 0 && (
          <div style={{ background: T.chipBg }} className="rounded-xl px-3 py-2.5 -mt-1 lg:col-span-2">
            <p style={{ color: T.subtext }} className="text-[11px]">
              {porPeso ? "Total (calculado automaticamente, não editável): " : "Valor total estimado: "}
              <strong style={{ color: T.text }}>{formatarMoeda(valorTotal)}</strong>
              {porPeso ? "" : ` (atualiza o "valor em risco" da Home automaticamente)`}
            </p>
          </div>
        )}

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label style={{ color: T.subtext }} className="text-xs font-semibold block">Observações (opcional)</label>
            <span style={{ color: T.subtext }} className="text-[10px]">{observacoes.length}/300</span>
          </div>
          <textarea value={observacoes} maxLength={300} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Ex: lote da promoção, caixa danificada..."
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 resize-none" />
        </div>

        {loteExistente && (
          <div style={{ background: somaErro ? RED_SOFT : T.chipBg, color: somaErro ? RED_DARK : T.text }} className="lg:col-span-2 lg:-order-1 text-xs font-medium px-3 py-2 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{somaErro || `O lote ${loteNorm} já está lançado (${loteExistente.quantidade} un, vence ${formatarData(loteExistente.validade)}). A quantidade informada será SOMADA: ficará ${loteExistente.quantidade + Math.max(0, Math.round(qtdSomar))} un. Máximo de ${limiteSoma} un por vez.`}</span>
          </div>
        )}
        {duplicado && (
          <div style={{ background: RED_SOFT, color: RED_DARK }} className="lg:col-span-2 lg:-order-1 text-xs font-medium px-3 py-2 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Já existe um lançamento deste produto com esta validade e sem lote. Confirme novamente para salvar mesmo assim.</span>
          </div>
        )}
      </div>

      {!podeSalvar && motivoBloqueio && (
        <p style={{ color: RED_DARK }} className="text-[11px] font-medium text-center mt-4 -mb-2" role="status">{motivoBloqueio}</p>
      )}
      <div className="flex gap-2 mt-5">
        {!editing && onVoltar && (
          <button onClick={voltar} style={{ color: T.subtext, borderColor: T.border }} className="flex items-center justify-center gap-1 text-sm font-medium py-3 px-4 rounded-2xl border">
            <ArrowLeft size={15} /> Voltar
          </button>
        )}
        <button onClick={cancelar} style={{ color: T.subtext, borderColor: T.border }} className="flex-1 text-sm font-medium py-3 rounded-2xl border">Cancelar</button>
        <button disabled={!podeSalvar} onClick={handleSalvar}
          style={{ background: podeSalvar ? BLUE : "#C7CEDA" }} className="flex-[2] text-sm font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-1.5">
          <Check size={16} /> {editing ? "Salvar alterações" : loteExistente ? "Somar ao lote" : duplicado && confirmarDuplicado ? "Salvar mesmo assim" : "Salvar alerta"}
        </button>
      </div>
    </div>
  );
}

export { ExpiryView };
