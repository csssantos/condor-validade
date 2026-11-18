// Logo animada do Bipi (SVG, sem imagem): LogoBipi = palavra "bipi" com os pingos dos "i" piscando;
// RoboCarregando = símbolo do Bipi para a tela de carregamento (antena com sinal, olhos, leitor).
// As animações ficam em index.css (classes bipi-*) e param com "reduzir movimento".
import { useId } from "react";

const AZUL = "#0B4F9E";

function LogoBipi({ className = "h-8 w-auto", ink = AZUL, title = "Bipi Validade" }) {
  return (
    <svg role="img" aria-label={title} viewBox="12 4 296 176" className={className}>
      <g fill="none" stroke={ink} strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 14 V132" /><rect x="26" y="60" width="72" height="72" rx="36" /><path d="M142 60 V132" />
        <path d="M186 60 V164" /><rect x="186" y="60" width="72" height="72" rx="36" /><path d="M290 60 V132" />
      </g>
      <g className="bipi-olhar">
        <g className="bipi-piscar">
          <rect x="132" y="12" width="20" height="32" rx="10" fill="#2ECC71" /><rect x="136" y="17" width="6" height="9" rx="3" fill="#fff" opacity=".92" />
          <rect x="280" y="12" width="20" height="32" rx="10" fill="#2ECC71" /><rect x="284" y="17" width="6" height="9" rx="3" fill="#fff" opacity=".92" />
        </g>
      </g>
    </svg>
  );
}

function RoboCarregando({ className = "h-[170px] w-auto" }) {
  const id = useId().replace(/:/g, "");
  const arco = (r) => {
    const a = (40 * Math.PI) / 180, cx = 80, cy = 14;
    return `M${cx + r * Math.cos(-a)} ${cy + r * Math.sin(-a)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  };
  return (
    <svg role="img" aria-label="Bipi carregando" viewBox="0 -6 160 176" className={className} overflow="visible">
      <defs>
        <radialGradient id={`b${id}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#FF7B7F" /><stop offset=".5" stopColor="#E31E24" /><stop offset="1" stopColor="#A8121A" /></radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#CFE2F8" /></linearGradient>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E31E24" stopOpacity="0" /><stop offset=".15" stopColor="#E31E24" /><stop offset=".85" stopColor="#E31E24" /><stop offset="1" stopColor="#E31E24" stopOpacity="0" /></linearGradient>
        <clipPath id={`v${id}`}><rect x="28" y="58" width="104" height="80" rx="28" /></clipPath>
      </defs>
      <ellipse className="bipi-sombra" cx="80" cy="164" rx="46" ry="5" fill="#000" opacity=".18" />
      <g className="bipi-flutuar">
        <path d="M80 40 V20" stroke="#9CC8F7" strokeWidth="6" strokeLinecap="round" />
        <path className="bipi-sinal bipi-sinal1" d={arco(22)} fill="none" stroke="#E31E24" strokeWidth="4.5" strokeLinecap="round" />
        <path className="bipi-sinal bipi-sinal2" d={arco(32)} fill="none" stroke="#E31E24" strokeWidth="4.5" strokeLinecap="round" />
        <g className="bipi-bola"><circle cx="80" cy="14" r="11" fill={`url(#b${id})`} /></g>
        <rect x="14" y="44" width="132" height="104" rx="38" fill={`url(#c${id})`} />
        <rect x="28" y="58" width="104" height="80" rx="28" fill="#06264C" stroke="#7DB4F0" strokeWidth="3" />
        <g className="bipi-olhar2">
          <g className="bipi-piscar">
            <rect x="46" y="76" width="16" height="30" rx="8" fill="#2ECC71" /><rect x="50" y="81" width="5" height="8" rx="2.5" fill="#fff" opacity=".92" />
            <rect x="98" y="76" width="16" height="30" rx="8" fill="#2ECC71" /><rect x="102" y="81" width="5" height="8" rx="2.5" fill="#fff" opacity=".92" />
          </g>
        </g>
        <g clipPath={`url(#v${id})`}><g className="bipi-feixe"><rect x="24" y="0" width="112" height="6" rx="3" fill={`url(#f${id})`} /><rect x="24" y="-3" width="112" height="12" rx="6" fill="#E31E24" opacity=".18" /></g></g>
        <path d="M66 122 q14 9 28 0" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

export { LogoBipi, RoboCarregando };
