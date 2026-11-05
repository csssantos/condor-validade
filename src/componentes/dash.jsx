// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { BLUE, BLUE_DARK, RED_DARK, RED_SOFT } from "../lib/constantes";
import { abreviarNumero } from "../lib/formatos";

// ============ Kit extra do desktop (páginas em estilo dashboard) ============
function DashPageHeader({ T, title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h1 style={{ color: T.text }} className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p style={{ color: T.subtext }} className="text-sm mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

function DashTabs({ T, value, onChange, options }) {
  return (
    <div style={{ background: T.chipBg, scrollbarWidth: "none" }} className="inline-flex max-w-full overflow-x-auto rounded-full p-1 gap-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={value === o.id ? { background: o.color || BLUE_DARK, color: "#fff", boxShadow: "0 2px 6px rgba(6,28,58,.25)" } : { color: T.subtext }}
          className="text-xs font-bold px-3.5 py-1.5 rounded-full transition whitespace-nowrap shrink-0">{o.label}</button>
      ))}
    </div>
  );
}

function DashBadge({ bg, color, children }) {
  return <span style={{ background: bg, color }} className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">{children}</span>;
}

// Tabela: cols=[{key,label,align,render,width}], rows=[obj]; onRow opcional
function DashTable({ T, cols, rows, onRow, empty = "Nada por aqui." }) {
  return (
    <div className="overflow-x-auto -mx-5 -mb-5">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderColor: T.border }} className="border-y">
            {cols.map((c) => (
              <th key={c.key} style={{ color: T.subtext, width: c.width, textAlign: c.align || "left" }}
                className="text-[10.5px] font-bold uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} style={{ color: T.subtext }} className="text-center text-xs py-10">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} style={{ borderColor: T.border }}
              className={`border-b last:border-b-0 ${onRow ? "cursor-pointer hover:bg-black/[0.03]" : ""}`}>
              {cols.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left", color: T.text }} className="px-5 py-2.5 align-middle">
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Barras horizontais: data=[{label, value, color, right}]
function DashHBars({ T, data, fmt = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1 gap-2">
            <span style={{ color: T.text }} className="font-semibold truncate">{d.label}</span>
            <span style={{ color: T.subtext }} className="shrink-0 tabular-nums whitespace-nowrap">{d.right ?? fmt(d.value)}</span>
          </div>
          <div style={{ background: T.chipBg }} className="h-2.5 rounded-full overflow-hidden">
            <div style={{ width: `${(d.value / max) * 100}%`, background: d.color || BLUE }} className="h-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashCard({ T, title, subtitle, right, children, className = "" }) {
  return (
    <section style={{ background: T.card, borderColor: T.border }} className={`rounded-2xl border shadow-sm flex flex-col min-w-0 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h3 style={{ color: T.text }} className="text-sm font-bold">{title}</h3>
            {subtitle && <p style={{ color: T.subtext }} className="text-[11px] mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="px-5 pb-5 pt-3 flex-1">{children}</div>
    </section>
  );
}

function DashSpark({ data, color, gid, height = 46 }) {
  const w = 160, h = height;
  const d = data && data.length > 1 ? data : [0, 0];
  const max = Math.max(...d, 0), min = Math.min(...d, 0), span = max - min || 1;
  const step = w / (d.length - 1);
  const pts = d.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 10)]);
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full block" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linha} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      <path d={linha} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DashKpi({ T, label, value, sub, chip, chipBom, Icon, accent, children }) {
  const chipStyle = chipBom ? { background: "#E6F7ED", color: "#1F9D55" } : { background: RED_SOFT, color: RED_DARK };
  return (
    <div style={{ background: T.card, borderColor: T.border }} className="rounded-2xl border shadow-sm p-5 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p style={{ color: T.subtext }} className="text-[11px] font-bold uppercase tracking-wide truncate">{label}</p>
        <div style={{ background: `${accent}1F` }} className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"><Icon size={16} color={accent} /></div>
      </div>
      {/* valor nunca sai da caixa: fonte se ajusta ao tamanho do texto e ao espaço disponível */}
      <div className="flex items-end gap-2 mt-2 min-w-0 flex-wrap">
        <p style={{ color: T.text, fontSize: String(value ?? "").length > 12 ? "clamp(17px, 1.55vw, 24px)" : String(value ?? "").length > 8 ? "clamp(19px, 1.8vw, 26px)" : "28px" }}
          className="font-extrabold leading-none tabular-nums whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={String(value ?? "")}>{value}</p>
        {chip && <span style={chipStyle} className="text-[11px] font-bold px-1.5 py-0.5 rounded-md mb-0.5">{chip}</span>}
      </div>
      {sub && <p style={{ color: T.subtext }} className="text-[11px] mt-1.5">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DashBars({ T, data, W = 760 }) {
  const H = 250, pb = 26, pt = 16;
  const totais = data.map((d) => d.parts.reduce((a, p) => a + p.value, 0));
  const topo = Math.max(4, Math.ceil(Math.max(...totais, 0) / 4) * 4);
  const pl = 16 + String(topo).length * 6.5;
  const ih = H - pb - pt, bw = (W - pl) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
      {[0, 1, 2, 3, 4].map((g) => {
        const y = pt + ih - (ih * g) / 4;
        return (
          <g key={g}>
            <line x1={pl} x2={W} y1={y} y2={y} stroke={T.border} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={pl - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={T.subtext}>{Math.round((topo * g) / 4)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        let acc = 0;
        const x = pl + i * bw + bw * 0.18, w = bw * 0.64;
        return (
          <g key={i}>
            {d.parts.filter((p) => p.value > 0).map((p, k) => {
              const h = (p.value / topo) * ih; acc += h;
              return <rect key={k} x={x} y={pt + ih - acc} width={w} height={h} fill={p.color} rx="2" />;
            })}
            {totais[i] > 0 && <text x={x + w / 2} y={pt + ih - acc - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={T.text}>{totais[i]}</text>}
            <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={T.subtext}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DashArea({ T, data, color, gid }) {
  const W = 760, H = 230, pl = 44, pb = 26, pt = 14;
  const max = Math.max(...data.map((d) => d.value), 0);
  const topo = max > 0 ? max * 1.15 : 1;
  const iw = W - pl - 8, ih = H - pb - pt, step = iw / Math.max(data.length - 1, 1);
  const pts = data.map((d, i) => [pl + i * step, pt + ih - (d.value / topo) * ih]);
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const marcas = (data.length <= 8 ? data.map((_, i) => i) : [0, 7, 14, 21, data.length - 1]).filter((v, i, a) => v >= 0 && v < data.length && a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((g) => {
        const y = pt + ih - (ih * g) / 3;
        return (
          <g key={g}>
            <line x1={pl} x2={W - 8} y1={y} y2={y} stroke={T.border} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={pl - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={T.subtext}>{abreviarNumero((topo * g) / 3)}</text>
          </g>
        );
      })}
      <path d={`${linha} L${pl + iw},${pt + ih} L${pl},${pt + ih} Z`} fill={`url(#${gid})`} />
      <path d={linha} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => d.value > 0 && <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="2.8" fill={T.card} stroke={color} strokeWidth="1.8" />)}
      {marcas.map((i) => <text key={i} x={pts[i][0]} y={H - 8} textAnchor={i === data.length - 1 ? "end" : "middle"} fontSize="10" fill={T.subtext}>{data[i].label}</text>)}
    </svg>
  );
}

function DashDonut({ T, segments, centerValue, centerLabel, size = 176, thickness = 22 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={T.chipBg} strokeWidth={thickness} />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * circ;
          const el = <circle key={s.label} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(len - 2, 0)} ${circ - Math.max(len - 2, 0)}`} strokeDashoffset={-acc} transform={`rotate(-90 ${c} ${c})`} />;
          acc += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p style={{ color: T.text }} className="text-2xl font-extrabold leading-none tabular-nums">{centerValue}</p>
        <p style={{ color: T.subtext }} className="text-[10px] mt-1 font-semibold uppercase tracking-wide">{centerLabel}</p>
      </div>
    </div>
  );
}

export { DashArea, DashBadge, DashBars, DashCard, DashDonut, DashHBars, DashKpi, DashPageHeader, DashSpark, DashTable, DashTabs };
