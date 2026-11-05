// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import React from "react";
import { AlertTriangle } from "lucide-react";

// Rede de segurança: se algo quebrar no render (em vez de tela branca sem explicação nenhuma),
// mostra o erro de verdade na tela — assim dá pra saber exatamente o que aconteceu e resolver rápido.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error("Erro capturado pelo ErrorBoundary:", erro, info); }
  render() {
    if (this.state.erro) {
      return (
        <div style={{ background: "#fff", color: "#111" }} className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle size={32} color="#E31E24" />
          <p className="text-sm font-bold">Ops, alguma coisa quebrou.</p>
          <p style={{ color: "#6B7280" }} className="text-xs max-w-sm">Manda esse texto pra quem tá mexendo no app corrigir:</p>
          <pre style={{ background: "#F4F5F9", color: "#E31E24" }} className="text-[10px] p-3 rounded-xl max-w-sm overflow-auto text-left whitespace-pre-wrap">
            {String(this.state.erro?.message || this.state.erro)}
            {"\n"}{this.state.erro?.stack ? String(this.state.erro.stack).split("\n").slice(0, 6).join("\n") : ""}
          </pre>
          <button onClick={() => window.location.reload()} style={{ background: "#0B4A8F", color: "#fff" }} className="px-4 py-2.5 rounded-xl text-sm font-semibold mt-1">
            Recarregar o app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
