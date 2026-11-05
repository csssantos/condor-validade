// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Barcode, Loader2, Check, Sparkles, AlertTriangle, ImageOff, Camera, Images, ChevronRight } from "lucide-react";
import { BLUE, BLUE_DARK, BLUE_SOFT, CATEGORIAS_GIRO, POLITICAS_TROCA, RED, RED_DARK, RED_SOFT, SETORES, SUBSETORES_PADRAO, ehPerecivel } from "../lib/constantes";
import { buscarProdutoPorCodigo } from "../lib/notificacoes";
import { useTelaLarga } from "../lib/tela";
import { compressImage, formatarNomeProfissional, ordemUnidadesPeloSetor, sanitizarTexto } from "../lib/utilidades";

// ============ Confirmar produto ============
function ConfirmProductView({ T, barcode, initial, wasKnown, nomesExistentes, onCancel, onContinue, onSalvarSemValidade, onSalvarEdicaoDireto, intencaoFluxo, setoresExtra, subsetoresExtra, onCriarSetor, onCriarSubsetor }) {
  const [nome, setNome] = useState(initial.nome || "");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const sugestoesFiltradas = useMemo(() => {
    const alvo = nome.trim().toLowerCase();
    if (alvo.length < 2) return [];
    return (nomesExistentes || []).filter((n) => n.toLowerCase().includes(alvo) && n.toLowerCase() !== alvo).slice(0, 6);
  }, [nome, nomesExistentes]);
  const [setor, setSetor] = useState(initial.setor || "");
  const [setorCustom, setSetorCustom] = useState("");
  const [subsetor, setSubsetor] = useState(initial.subsetor || "");
  const [criandoSetor, setCriandoSetor] = useState(false);
  const [novoSetorNome, setNovoSetorNome] = useState("");
  const [novoSetorPerecivel, setNovoSetorPerecivel] = useState(false);
  const [criandoSubsetor, setCriandoSubsetor] = useState(false);
  const [novoSubsetorNome, setNovoSubsetorNome] = useState("");
  const [foto, setFoto] = useState(initial.foto || null);
  const [buscando, setBuscando] = useState(!wasKnown);
  const [origem, setOrigem] = useState(wasKnown ? "catalogo" : null);
  const [carregandoFoto, setCarregandoFoto] = useState(false);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [erroIA, setErroIA] = useState(false);
  const [corredor, setCorredor] = useState(initial.corredor || "");
  const [ladoCorredor, setLadoCorredor] = useState(initial.ladoCorredor || "");
  const [modulo, setModulo] = useState(initial.modulo || "");
  const [prateleira, setPrateleira] = useState(initial.prateleira || "");
  const [categoriaGiro, setCategoriaGiro] = useState(initial.categoriaGiro || "");
  const [politicaTroca, setPoliticaTroca] = useState(initial.politicaTroca || "");
  const [precoUnitario, setPrecoUnitario] = useState(initial.precoUnitario != null ? String(initial.precoUnitario) : "");
  const [porPeso, setPorPeso] = useState(!!initial.porPeso);
  const [tamanho, setTamanho] = useState(initial.tamanho || "");
  const [unidadeMedida, setUnidadeMedida] = useState(initial.unidadeMedida || "G");
  const [cadastrarEstoque, setCadastrarEstoque] = useState(!!initial.cadastrarEstoque);
  const [corredorDeposito, setCorredorDeposito] = useState(initial.corredorDeposito || "");
  const [moduloDeposito, setModuloDeposito] = useState(initial.moduloDeposito || "");
  const [nivelDeposito, setNivelDeposito] = useState(initial.nivelDeposito || "");
  const [vaoDeposito, setVaoDeposito] = useState(initial.vaoDeposito || "");
  const cameraInputRef = useRef(null);
  const galeriaInputRef = useRef(null);

  useEffect(() => {
    if (wasKnown) { setBuscando(false); return; }
    let cancelled = false;
    (async () => {
      const resultado = await buscarProdutoPorCodigo(barcode);
      if (!cancelled) {
        if (resultado) {
          setNome(formatarNomeProfissional(resultado.nome));
          setOrigem("api");
          if (resultado.foto) {
            setFoto((atual) => atual || resultado.foto);
          } else {
            // A API de busca achou o nome mas não achou foto — pede uma sugestão pro Gemini
            // (edge function, com busca no Google) em vez de deixar o produto sem imagem.
            buscarFotoComIA(resultado.nome);
          }
        }
        setBuscando(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode, wasKnown]);

  async function buscarFotoComIA(nomeProduto) {
    try {
      const { data, error } = await supabase.functions.invoke("identificar-produto", { body: { nomeProduto, apenasFoto: true } });
      if (error) throw error;
      if (data && data.foto) setFoto((atual) => atual || data.foto);
    } catch (e) {
      console.warn("Sugestão de foto pela IA falhou:", e);
    }
  }

  async function handleFotoSelecionada(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCarregandoFoto(true);
    try { setFoto(await compressImage(file)); } catch {}
    setCarregandoFoto(false);
    e.target.value = "";
  }

  async function identificarComIA() {
    if (!foto) return;
    setCarregandoIA(true);
    setErroIA(false);
    const base64 = foto.split(",")[1];
    const erros = [];

    // Só a Edge Function "identificar-produto" (a chave da IA fica no servidor, nunca no navegador).
    try {
      const { data, error } = await supabase.functions.invoke("identificar-produto", { body: { imagemBase64: base64 } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data && data.nome) {
        setNome(formatarNomeProfissional(data.nome));
        if (data.setor && SETORES.includes(data.setor)) setSetor(data.setor);
        setOrigem("ia");
        setCarregandoIA(false);
        return;
      }
      throw new Error("resposta sem nome");
    } catch (e) {
      erros.push(`Edge Function: ${e?.message || e}`);
      console.warn("Edge Function identificar-produto falhou, tentando Gemini direto:", e);
    }

    console.error("Falha ao identificar com IA:", erros.join(" | "));
    setErroIA(erros.join(" | "));
    setCarregandoIA(false);
  }

  const setorFinal = setor === "Outro" ? setorCustom.trim() : setor;
  const podeContinuar = nome.trim().length > 0 && setorFinal.length > 0 && (setorFinal !== "Mercearia" || !!subsetor) && Number(precoUnitario) > 0;

  // Cadastro em etapas (tipo tela de pagamento): uma coisa de cada vez, menos chance de errar
  // com o coletor numa mão e o produto na outra. Cada etapa só libera "Avançar" com o essencial dela ok.
  const [etapa, setEtapa] = useState(1);
  const TOTAL_ETAPAS = 4;
  // No PC cabe tudo numa tela só, em 2 colunas: não precisa de etapas (no celular continua passo a passo)
  const pc = useTelaLarga();
  const ver = (n) => pc || etapa === n;
  const etapaEf = pc ? TOTAL_ETAPAS : etapa;
  const NOMES_ETAPA = ["Produto", "Preço", "Setor", "Detalhes"];
  const podeAvancarEtapa = {
    1: nome.trim().length > 0,
    2: Number(precoUnitario) > 0,
    3: setorFinal.length > 0 && (setorFinal !== "Mercearia" || !!subsetor),
    4: true,
  }[etapa];

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-1.5 mb-4 lg:hidden">
        {Array.from({ length: TOTAL_ETAPAS }).map((_, i) => (
          <div key={i} style={{ background: i + 1 <= etapa ? BLUE : T.chipBg }} className="h-1.5 flex-1 rounded-full transition-colors" />
        ))}
      </div>
      <p style={{ color: T.subtext }} className="text-[11px] font-semibold uppercase tracking-wide mb-3 lg:hidden">
        Etapa {etapa} de {TOTAL_ETAPAS} · {NOMES_ETAPA[etapa - 1]}
      </p>

      <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl p-4 border shadow-lg shadow-black/5 mb-4">
        <div style={{ color: T.subtext }} className="flex items-center gap-2 text-xs mb-1"><Barcode size={13} /> Código escaneado</div>
        <p className="font-mono font-semibold text-base">{barcode}</p>
      </div>

      {etapa === 1 && buscando && (
        <div style={{ color: T.subtext }} className="flex items-center gap-2 text-xs mb-4 px-1">
          <Loader2 size={14} className="animate-spin" color={BLUE} /> Buscando nome do produto em português...
        </div>
      )}
      {etapa === 1 && !buscando && origem === "catalogo" && (
        <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-xs font-medium px-3 py-2 rounded-xl mb-4 flex items-center gap-1.5">
          <Check size={13} /> Produto já cadastrado — dados preenchidos automaticamente.
        </div>
      )}
      {etapa === 1 && !buscando && origem === "api" && (
        <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-xs font-medium px-3 py-2 rounded-xl mb-4 flex items-center gap-1.5">
          <Check size={13} /> Nome localizado automaticamente. Confira antes de continuar.
        </div>
      )}
      {etapa === 1 && !buscando && origem === "ia" && (
        <div style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="text-xs font-medium px-3 py-2 rounded-xl mb-4 flex items-center gap-1.5">
          <Sparkles size={13} /> Identificado pela IA (Gemini) a partir da foto. Confira antes de continuar.
        </div>
      )}
      {etapa === 1 && !buscando && !origem && (
        <div style={{ background: RED_SOFT, color: RED_DARK }} className="text-xs font-medium px-3 py-2 rounded-xl mb-4 flex items-center gap-1.5">
          <AlertTriangle size={13} /> Produto não encontrado. Preencha os dados manualmente.
        </div>
      )}

      <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl p-4 border shadow-lg shadow-black/5 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:items-start">
        {ver(1) && (<>
        <div>
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Foto do produto</label>
          <div className="flex items-center gap-3">
            {foto ? <img src={foto} alt="" className="h-16 w-16 rounded-xl object-cover" /> : (
              <div style={{ background: T.chipBg }} className="h-16 w-16 rounded-xl flex items-center justify-center"><ImageOff size={20} color={T.subtext} /></div>
            )}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex gap-1.5">
                <button onClick={() => cameraInputRef.current && cameraInputRef.current.click()} disabled={carregandoFoto}
                  style={{ background: BLUE_SOFT, color: BLUE_DARK }} className="flex-1 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5">
                  {carregandoFoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Tirar foto
                </button>
                <button onClick={() => galeriaInputRef.current && galeriaInputRef.current.click()} disabled={carregandoFoto}
                  style={{ background: T.chipBg, color: T.text }} className="flex-1 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5">
                  <Images size={13} /> Galeria
                </button>
              </div>
              {foto && <button onClick={() => setFoto(null)} style={{ color: RED_DARK }} className="text-[11px] font-medium text-left">Remover foto</button>}
            </div>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoSelecionada} />
            <input ref={galeriaInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoSelecionada} />
          </div>
          {foto && (
            <button onClick={identificarComIA} disabled={carregandoIA}
              style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)` }}
              className="w-full mt-2.5 text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5">
              {carregandoIA ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {carregandoIA ? "Identificando com IA..." : "Identificar produto com IA (Gemini)"}
            </button>
          )}
          {erroIA && (
            <div style={{ background: RED_SOFT }} className="mt-1.5 rounded-lg p-2">
              <p style={{ color: RED_DARK }} className="text-[11px]">Não consegui identificar o produto. Tente uma foto mais nítida, ou preencha manualmente.</p>
              <p style={{ color: RED_DARK }} className="text-[9px] mt-1 font-mono opacity-70 break-all">{erroIA}</p>
            </div>
          )}
        </div>

        <div className="relative">
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Nome do produto</label>
          <input value={nome} maxLength={120}
            onChange={(e) => { setNome(sanitizarTexto(e.target.value, 120)); setSugestoesAbertas(true); }}
            onFocus={() => setSugestoesAbertas(true)} onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
            placeholder="Ex: Leite integral 1L"
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
          <p style={{ color: T.subtext }} className="text-[10px] mt-1">Pode escrever normal — ao salvar, vira o padrão abreviado do sistema (ex: "BISC. CHOC/AVELÃ").</p>
          {sugestoesAbertas && nome.trim().length >= 2 && sugestoesFiltradas.length > 0 && (
            <div style={{ background: T.card, borderColor: T.border }} className="absolute z-20 left-0 right-0 mt-1 border rounded-xl shadow-lg shadow-black/10 overflow-hidden max-h-48 overflow-y-auto">
              {sugestoesFiltradas.map((s) => (
                <button key={s} onMouseDown={() => { setNome(s); setSugestoesAbertas(false); }}
                  style={{ borderColor: T.border }} className="w-full text-left px-3 py-2.5 text-xs border-b last:border-b-0" >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        </>)}
        {ver(2) && (
        <div>
          {ehPerecivel(setorFinal) && (
            <div className="flex items-center justify-between mb-1.5">
              <label style={{ color: T.subtext }} className="text-xs font-semibold block">Este produto é vendido por peso?</label>
              <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${T.inputBorder}` }}>
                <button type="button" onClick={() => setPorPeso(true)}
                  style={porPeso ? { background: BLUE, color: "#fff" } : { background: T.inputBg, color: T.subtext }}
                  className="text-[10.5px] font-semibold px-2.5 py-1.5">Peso (KG)</button>
                <button type="button" onClick={() => setPorPeso(false)}
                  style={!porPeso ? { background: BLUE, color: "#fff" } : { background: T.inputBg, color: T.subtext }}
                  className="text-[10.5px] font-semibold px-2.5 py-1.5">Unidade</button>
              </div>
            </div>
          )}
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">{porPeso ? "Preço Unitário/KG (R$)" : "Valor unitário (R$)"} <span style={{ color: RED }}>*</span></label>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={precoUnitario}
            onChange={(e) => setPrecoUnitario(e.target.value)} placeholder="0,00"
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
          {!(Number(precoUnitario) > 0) && <p style={{ color: T.subtext }} className="text-[10px] mt-1">Obrigatório pra calcular o valor em risco do produto.</p>}
          {porPeso && <p style={{ color: T.subtext }} className="text-[10px] mt-1">Ao lançar a validade, o valor total é calculado automaticamente pelo peso pesado.</p>}
        </div>
        )}
        {ver(2) && (
        <div>
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Tamanho / quantidade da embalagem</label>
          <div className="flex gap-2">
            <input value={tamanho} inputMode="decimal" maxLength={7}
              onChange={(e) => setTamanho(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
              placeholder="Ex: 500, 1, 900"
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
            <select value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value)}
              style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }}
              className="w-[84px] shrink-0 border rounded-xl px-2 py-2.5 text-sm font-semibold outline-none focus:ring-2">
              {ordemUnidadesPeloSetor(setorFinal).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <p style={{ color: T.subtext }} className="text-[10px] mt-1">Fica salvo no cadastro — não precisa digitar de novo ao lançar a validade.</p>
        </div>
        )}
        {ver(3) && (
        <div>
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Setor <span style={{ color: RED }}>*</span></label>
          {!criandoSetor ? (
            <>
              <select value={setor} onChange={(e) => {
                if (e.target.value === "___novo___") { setCriandoSetor(true); return; }
                setSetor(e.target.value); setSubsetor("");
              }}
                style={{ background: T.inputBg, color: T.text, borderColor: T.border }}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2">
                <option value="">Selecione o setor...</option>
                {SETORES.filter((s) => s !== "Outro").map((s) => <option key={s} value={s}>{s}</option>)}
                {setoresExtra.map((s) => <option key={s.nome} value={s.nome}>{s.nome} (customizado)</option>)}
                <option value="___novo___">+ Criar novo setor...</option>
                <option value="Outro">Outro (não salvar)</option>
              </select>
              {setor === "Outro" && (
                <input value={setorCustom} maxLength={40} onChange={(e) => setSetorCustom(sanitizarTexto(e.target.value, 40))} placeholder="Digite o setor"
                  style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full mt-2 border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
              )}
            </>
          ) : (
            <div style={{ background: T.chipBg }} className="rounded-xl p-3">
              <p style={{ color: T.subtext }} className="text-[10px] font-medium mb-1.5">Nome do novo setor</p>
              <input autoFocus value={novoSetorNome} maxLength={40} onChange={(e) => setNovoSetorNome(sanitizarTexto(e.target.value, 40))} placeholder="Ex: Padaria Fina"
                style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 mb-2" />
              <button onClick={() => setNovoSetorPerecivel((v) => !v)} className="flex items-center gap-2 mb-3">
                <div style={{ background: novoSetorPerecivel ? BLUE : T.inputBg, borderColor: T.border }} className="h-5 w-5 rounded border flex items-center justify-center">
                  {novoSetorPerecivel && <Check size={12} color="#fff" />}
                </div>
                <span className="text-xs">É um setor de produtos perecíveis?</span>
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setCriandoSetor(false); setNovoSetorNome(""); }} style={{ color: T.subtext }} className="flex-1 text-xs py-2">Cancelar</button>
                <button onClick={() => {
                  if (!novoSetorNome.trim()) return;
                  onCriarSetor(novoSetorNome, novoSetorPerecivel);
                  setSetor(novoSetorNome.trim()); setSubsetor("");
                  setCriandoSetor(false); setNovoSetorNome(""); setNovoSetorPerecivel(false);
                }} disabled={!novoSetorNome.trim()} style={{ background: BLUE, color: "#fff" }} className="flex-[2] text-xs font-semibold py-2 rounded-xl">
                  Criar e usar
                </button>
              </div>
            </div>
          )}

          {setor && setor !== "Outro" && !criandoSetor && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <label style={{ color: T.subtext }} className="text-[10px] font-medium block">
                  Subsetor {setor === "Mercearia" && <span style={{ color: RED }}>*</span>}
                </label>
                {!criandoSubsetor && (
                  <button onClick={() => setCriandoSubsetor(true)} style={{ color: BLUE }} className="text-[10px] font-semibold">+ Novo subsetor</button>
                )}
              </div>
              {criandoSubsetor ? (
                <div className="flex gap-1.5">
                  <input autoFocus value={novoSubsetorNome} maxLength={40} onChange={(e) => setNovoSubsetorNome(sanitizarTexto(e.target.value, 40))} placeholder="Nome do subsetor"
                    style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2" />
                  <button onClick={() => {
                    if (!novoSubsetorNome.trim()) return;
                    onCriarSubsetor(setor, novoSubsetorNome);
                    setSubsetor(novoSubsetorNome.trim());
                    setCriandoSubsetor(false); setNovoSubsetorNome("");
                  }} style={{ background: BLUE, color: "#fff" }} className="text-xs font-semibold px-3 rounded-xl shrink-0">Criar</button>
                  <button onClick={() => { setCriandoSubsetor(false); setNovoSubsetorNome(""); }} style={{ color: T.subtext }} className="text-xs px-2 shrink-0">✕</button>
                </div>
              ) : (
                (() => {
                  const opcoes = [...(SUBSETORES_PADRAO[setor] || []), ...subsetoresExtra.filter((s) => s.setor === setor && !(SUBSETORES_PADRAO[setor] || []).includes(s.nome)).map((s) => s.nome)];
                  return opcoes.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {opcoes.map((s) => (
                        <button key={s} onClick={() => setSubsetor(s)}
                          style={subsetor === s ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }}
                          className="text-[11px] font-medium py-2 rounded-xl">
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: T.subtext }} className="text-[10px]">Nenhum subsetor ainda pra {setor}. Toque em "+ Novo subsetor" pra criar.</p>
                  );
                })()
              )}
            </div>
          )}
        </div>
        )}

        {ver(4) && (
        <div style={{ borderColor: T.border }} className="pt-1 border-t lg:col-span-2">
          <div className="mt-3" />
          <label style={{ color: T.subtext }} className="text-[10px] font-medium mb-1 block">Categoria de giro</label>
          <div className="flex gap-1.5 mb-3">
            {CATEGORIAS_GIRO.map((g) => (
              <button key={g} onClick={() => setCategoriaGiro(categoriaGiro === g ? "" : g)}
                style={categoriaGiro === g ? { background: BLUE, color: "#fff" } : { background: T.chipBg, color: T.text }}
                className="flex-1 text-[11px] font-medium py-1.5 rounded-xl">
                {g}
              </button>
            ))}
          </div>

          <label style={{ color: T.subtext }} className="text-[10px] font-medium mb-1 block">Política de troca com o fornecedor</label>
          <div className="flex gap-1.5">
            {POLITICAS_TROCA.map((p) => (
              <button key={p.valor} onClick={() => setPoliticaTroca(politicaTroca === p.valor ? "" : p.valor)}
                style={politicaTroca === p.valor ? (p.valor === "sem_troca" ? { background: RED, color: "#fff" } : { background: "#1F9D55", color: "#fff" }) : { background: T.chipBg, color: T.text }}
                className="flex-1 text-[11px] font-semibold py-2 rounded-xl">
                {p.label}
              </button>
            ))}
          </div>
          {politicaTroca && <p style={{ color: T.subtext }} className="text-[10px] mt-1.5">{POLITICAS_TROCA.find((p) => p.valor === politicaTroca)?.desc}</p>}
        </div>
        )}
      </div>

      <div className="flex gap-2 mt-5">
        <button onClick={(pc || etapa === 1) ? onCancel : () => setEtapa((e) => e - 1)} style={{ color: T.subtext, borderColor: T.border }} className="flex-1 text-sm font-medium py-3 rounded-2xl border">
          {(pc || etapa === 1) ? "Cancelar" : "Voltar"}
        </button>
        {etapaEf < TOTAL_ETAPAS ? (
          <button disabled={!podeAvancarEtapa} onClick={() => setEtapa((e) => e + 1)}
            style={{ background: podeAvancarEtapa ? BLUE : "#C7CEDA" }} className="flex-[2] text-sm font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-1.5">
            Continuar <ChevronRight size={16} />
          </button>
        ) : intencaoFluxo === "cadastro" ? (
          <button disabled={!podeContinuar} onClick={() => onSalvarSemValidade({
            nome: formatarNomeProfissional(nome.trim()), setor: setorFinal, subsetor: subsetor || null, foto, corredor: corredor || null, ladoCorredor: ladoCorredor || null,
            modulo: modulo || null, prateleira: prateleira || null, categoriaGiro: categoriaGiro || null, politicaTroca: politicaTroca || null, precoUnitario: Number(precoUnitario) || 0, porPeso, tamanho: tamanho || null, unidadeMedida, cadastrarEstoque, corredorDeposito: cadastrarEstoque ? (corredorDeposito || null) : null, moduloDeposito: cadastrarEstoque ? (moduloDeposito || null) : null, nivelDeposito: cadastrarEstoque ? (nivelDeposito || null) : null, vaoDeposito: cadastrarEstoque ? (vaoDeposito || null) : null
          })}
            style={{ background: podeContinuar ? BLUE : "#C7CEDA" }} className="flex-[2] text-sm font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-1.5">
            <Check size={16} /> Salvar cadastro
          </button>
        ) : onSalvarEdicaoDireto ? (
          <button disabled={!podeContinuar} onClick={() => onSalvarEdicaoDireto({
            nome: formatarNomeProfissional(nome.trim()), setor: setorFinal, subsetor: subsetor || null, foto, corredor: corredor || null, ladoCorredor: ladoCorredor || null,
            modulo: modulo || null, prateleira: prateleira || null, categoriaGiro: categoriaGiro || null, politicaTroca: politicaTroca || null, precoUnitario: Number(precoUnitario) || 0, porPeso, tamanho: tamanho || null, unidadeMedida, cadastrarEstoque, corredorDeposito: cadastrarEstoque ? (corredorDeposito || null) : null, moduloDeposito: cadastrarEstoque ? (moduloDeposito || null) : null, nivelDeposito: cadastrarEstoque ? (nivelDeposito || null) : null, vaoDeposito: cadastrarEstoque ? (vaoDeposito || null) : null
          })}
            style={{ background: podeContinuar ? BLUE : "#C7CEDA" }} className="flex-[2] text-sm font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-1.5">
            <Check size={16} /> Salvar alterações
          </button>
        ) : (
          <button disabled={!podeContinuar} onClick={() => onContinue({
            nome: formatarNomeProfissional(nome.trim()), setor: setorFinal, subsetor: subsetor || null, foto, corredor: corredor || null, ladoCorredor: ladoCorredor || null,
            modulo: modulo || null, prateleira: prateleira || null, categoriaGiro: categoriaGiro || null, politicaTroca: politicaTroca || null, precoUnitario: Number(precoUnitario) || 0, porPeso, tamanho: tamanho || null, unidadeMedida, cadastrarEstoque, corredorDeposito: cadastrarEstoque ? (corredorDeposito || null) : null, moduloDeposito: cadastrarEstoque ? (moduloDeposito || null) : null, nivelDeposito: cadastrarEstoque ? (nivelDeposito || null) : null, vaoDeposito: cadastrarEstoque ? (vaoDeposito || null) : null
          })}
            style={{ background: podeContinuar ? RED : "#E9CBCC" }} className="flex-[2] text-sm font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-1.5">
            Avançar <ChevronRight size={16} />
          </button>
        )}
      </div>
      {etapaEf === TOTAL_ETAPAS && intencaoFluxo === "validade" && onSalvarEdicaoDireto && (
        <button disabled={!podeContinuar} onClick={() => onContinue({
          nome: formatarNomeProfissional(nome.trim()), setor: setorFinal, subsetor: subsetor || null, foto, corredor: corredor || null, ladoCorredor: ladoCorredor || null,
          modulo: modulo || null, prateleira: prateleira || null, categoriaGiro: categoriaGiro || null, politicaTroca: politicaTroca || null, precoUnitario: Number(precoUnitario) || 0, porPeso, tamanho: tamanho || null, unidadeMedida, cadastrarEstoque, corredorDeposito: cadastrarEstoque ? (corredorDeposito || null) : null, moduloDeposito: cadastrarEstoque ? (moduloDeposito || null) : null, nivelDeposito: cadastrarEstoque ? (nivelDeposito || null) : null, vaoDeposito: cadastrarEstoque ? (vaoDeposito || null) : null
        })}
          style={{ color: BLUE }} className="w-full mt-2.5 text-xs font-semibold py-2 flex items-center justify-center gap-1.5">
          <CalendarDaysIcon className="w-3.5 h-3.5" /> Alterar a data de validade também
        </button>
      )}
    </div>
  );
}

export { ConfirmProductView };
