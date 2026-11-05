// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { RED_DARK } from "../lib/constantes";

// ---------- Campo de data: digitar dd/mm/aaaa OU escolher no calendário ----------
// O seletor nativo do iPhone, ao abrir com o campo vazio, já devolve a data de HOJE sozinho (antes de a pessoa escolher nada).
// Isso preenchia "hoje", abria o registro de perda e tirava o foco do calendário. Aqui esse preenchimento automático é ignorado,
// e dá para digitar a data direto (teclado numérico).
function isoParaBR(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; }

function brParaISO(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || "")); if (!m) return "";
  const d = Number(m[1]), mo = Number(m[2]), a = Number(m[3]);
  const t = new Date(Date.UTC(a, mo - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function mascaraData(txt) { const n = String(txt || "").replace(/\D/g, "").slice(0, 8); return n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n; }

function hojeISOLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function CampoData({ value, onChange, style, className = "", T }) {
  const [txt, setTxt] = useState(isoParaBR(value));
  const [saiu, setSaiu] = useState(false);
  const [avisoHoje, setAvisoHoje] = useState(false);
  useEffect(() => { setTxt((t) => (brParaISO(t) === (value || "") ? t : isoParaBR(value))); }, [value]);
  const digitar = (e) => {
    const bruto = e.target.value;
    const f = /^\d{4}-\d{2}-\d{2}$/.test(bruto.trim()) ? isoParaBR(bruto.trim()) : mascaraData(bruto); // colar 2026-12-15 também funciona
    setTxt(f); onChange(brParaISO(f));
  };
  const escolher = (e) => {
    const v = e.target.value;
    // Campo vazio: o calendário nativo devolve "hoje" sozinho ao abrir (e em alguns aparelhos só ao fechar). Hoje nunca vem do calendário com o campo vazio;
    // quem quer a data de hoje digita (ou escolhe outro dia e volta). Sem limite de tempo, porque o iPhone pode avisar depois de 1 s.
    if (v && v === hojeISOLocal() && !value) { e.target.value = ""; setAvisoHoje(true); return; }
    setAvisoHoje(false); setTxt(isoParaBR(v)); onChange(v || "");
  };
  const abrir = (e) => { try { e.currentTarget.showPicker?.(); } catch { /* o toque já abre no celular */ } };
  const incompleta = txt.length > 0 && !brParaISO(txt) && (txt.length === 10 || saiu);
  return (
    <div>
      <div className="relative">
        <input type="text" inputMode="numeric" autoComplete="off" value={txt} onChange={digitar} onBlur={() => setSaiu(true)} onFocus={() => setSaiu(false)}
          placeholder="dd/mm/aaaa" maxLength={10} aria-label="Data de validade (dia, mês e ano)" aria-invalid={incompleta}
          style={{ ...style, paddingRight: 44 }} className={className} />
        <span className="absolute right-0 top-0 h-full w-11 flex items-center justify-center pointer-events-none" style={{ color: T?.subtext }}><Calendar size={17} /></span>
        <input type="date" aria-label="Escolher a data no calendário" value={value || ""} onChange={escolher} onClick={abrir}
          className="absolute right-0 top-0 h-full w-11 opacity-0 cursor-pointer" style={{ fontSize: 16 }} />
      </div>
      {avisoHoje && !value && <p style={{ color: T?.subtext }} className="text-[11px] font-medium mt-1.5">Para a data de hoje, digite no campo (dd/mm/aaaa).</p>}
      {incompleta && <p role="alert" style={{ color: RED_DARK }} className="text-[11px] font-semibold mt-1.5">{txt.length === 10 ? "Essa data não existe. Confira o dia e o mês." : "Digite a data completa: dd/mm/aaaa."}</p>}
    </div>
  );
}

export { CampoData, brParaISO, hojeISOLocal, isoParaBR, mascaraData };
