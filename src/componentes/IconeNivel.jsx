import { XCircle, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

// Selo de status: SEMPRE ícone + texto (nunca só cor), para quem não distingue vermelho e verde.
// vencido = X, em alerta = triângulo, atenção = relógio, ok = check.
export function IconeNivel({ level, size = 12 }) {
  const P = { expired: XCircle, alert: AlertTriangle, warning: Clock, ok: CheckCircle2 }[level] || CheckCircle2;
  return <P size={size} aria-hidden strokeWidth={2.6} className="shrink-0" />;
}
