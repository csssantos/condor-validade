// Carregamento sob demanda com limite de tempo: com sinal ruim o import() pode ficar pendente para sempre.
export function comTempo(promessa, ms = 25000) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("tempo_esgotado_carregando")), ms); });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(t));
}
