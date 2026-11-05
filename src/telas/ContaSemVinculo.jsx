// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Loader2 } from "lucide-react";
import { FUNDO_MARCA } from "../TelasEntrada";
import { BLUE, LOGO_SRC, RED_DARK, RED_SOFT } from "../lib/constantes";
import { useDesktop } from "../lib/tela";
import { ScanView } from "./Scan";

// Conta logada que ainda não tem vínculo com um funcionário: em vez de beco sem saída, deixa vincular na hora
// digitando/bipando a matrícula do pré-cadastro (a função do banco confere se existe e ainda não foi usada).
function ContaSemVinculo({ T, onVinculado, onSair }) {
  const ehDesktop = useDesktop();
  const [matricula, setMatricula] = useState("");
  const [lendo, setLendo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function vincular(codigo) {
    const mat = String(codigo ?? matricula).replace(/\D/g, "");
    if (!mat) { setErro("Informe a matrícula do seu crachá."); return; }
    setErro(""); setCarregando(true);
    const { error } = await supabase.rpc("vincular_meu_cadastro", { p_matricula: mat });
    setCarregando(false);
    if (error) {
      const m = error.message || "";
      setErro(
        m.includes("matricula_nao_encontrada") ? `Matrícula ${mat} não encontrada (ou já foi usada). Peça pro encarregado ou pro CPD conferir o pré-cadastro.` :
        m.includes("ja_vinculado") ? "Sua conta já está vinculada. Saia e entre de novo." :
        "Não foi possível vincular agora. Tente novamente."
      );
      return;
    }
    onVinculado();
  }

  const inputStyle = { background: T.inputBg, color: T.text, borderColor: T.border, boxSizing: "border-box" };
  if (ehDesktop) {
    // PC: tela dividida (painel da marca com o passo a passo + formulário grande), nada parecido com o celular
    const passos = [["1", "Peça o pré-cadastro", "Seu encarregado ou o CPD cadastra você em Gestão de Funcionários, com a matrícula do crachá."], ["2", "Digite a matrícula", "São só os números impressos no crachá, sem pontos ou espaços."], ["3", "Pronto", "A conta é vinculada na hora e você entra com seu cargo e seu setor."]];
    return (
      <div style={{ background: T.bg }} className="min-h-screen grid grid-cols-[minmax(420px,5fr)_6fr]">
        <div style={{ background: FUNDO_MARCA, color: "#fff" }} className="relative overflow-hidden flex flex-col justify-between p-12">
          <div aria-hidden style={{ background: "rgba(255,255,255,0.07)" }} className="absolute -right-32 -bottom-32 w-[520px] h-[520px] rounded-full" />
          <div aria-hidden style={{ background: "rgba(255,255,255,0.05)" }} className="absolute -left-24 top-1/3 w-72 h-72 rounded-full" />
          <img src={LOGO_SRC} alt="Condor" className="h-11 w-auto self-start relative" />
          <div className="relative">
            <p className="text-[11px] font-bold tracking-[0.28em] opacity-70 mb-3">QUASE LÁ</p>
            <h1 className="text-4xl font-extrabold leading-tight mb-8">Vincule sua conta<br />ao seu cadastro de funcionário</h1>
            <ol className="flex flex-col gap-5 max-w-md">
              {passos.map(([n, t, d]) => (
                <li key={n} className="flex gap-4">
                  <span style={{ background: "rgba(255,255,255,0.16)" }} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold">{n}</span>
                  <span><span className="block text-[15px] font-bold">{t}</span><span className="block text-[13px] opacity-75 leading-relaxed">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <p className="relative text-xs opacity-60">Condor · Alerta de Validade</p>
        </div>
        <div className="flex items-center justify-center p-12">
          <div style={{ background: T.card, color: T.text }} className="w-full max-w-md rounded-3xl p-9 shadow-sm">
            <h2 className="text-2xl font-extrabold mb-1">Matrícula do crachá</h2>
            <p style={{ color: T.subtext }} className="text-sm mb-6">No computador não dá para bipar: digite os números do crachá.</p>
            <input value={matricula} onChange={(e) => setMatricula(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && !carregando) vincular(); }} inputMode="numeric" placeholder="Ex.: 123456" autoFocus
              style={inputStyle} className="w-full border rounded-2xl px-4 py-4 text-2xl font-bold tracking-widest outline-none text-center" />
            {erro && <p style={{ color: RED_DARK, background: RED_SOFT }} className="text-sm font-medium rounded-xl px-3 py-2.5 mt-4">{erro}</p>}
            <button onClick={() => vincular()} disabled={carregando || !matricula} style={{ background: BLUE, color: "#fff" }}
              className="w-full mt-5 py-3.5 rounded-2xl text-[15px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {carregando && <Loader2 size={18} className="animate-spin" />} Vincular conta
            </button>
            <button onClick={onSair} style={{ color: T.subtext }} className="w-full text-sm font-semibold mt-4">Sair e entrar com outra conta</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: T.bg }} className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <img src={LOGO_SRC} alt="Condor" className="h-10 w-auto" />
      <p className="text-sm font-semibold">Falta vincular sua conta a um funcionário.</p>
      <p style={{ color: T.subtext }} className="text-xs max-w-xs">Digite ou bipe a matrícula do seu crachá. Ela precisa já estar pré-cadastrada em "Gestão de Funcionários".</p>
      <input value={matricula} onChange={(e) => setMatricula(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Matrícula"
        style={inputStyle} className="w-full max-w-xs border rounded-xl px-3 py-2.5 text-sm outline-none text-center" />
      {erro && <p style={{ color: RED_DARK }} className="text-xs font-medium max-w-xs">{erro}</p>}
      <button onClick={() => vincular()} disabled={carregando} style={{ background: BLUE, color: "#fff" }}
        className="w-full max-w-xs py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
        {carregando && <Loader2 size={16} className="animate-spin" />} Vincular
      </button>
      {!ehDesktop && <button onClick={() => setLendo(true)} style={{ color: BLUE }} className="text-xs font-semibold">Bipar crachá</button>}
      <button onClick={onSair} style={{ color: T.subtext }} className="text-xs font-semibold mt-1">Sair</button>
      {lendo && <ScanView variante="cracha" T={T} onDetected={(c) => { setLendo(false); vincular(c); }} onCancel={() => setLendo(false)} />}
    </div>
  );
}

export { ContaSemVinculo };
