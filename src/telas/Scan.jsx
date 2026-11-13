// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useRef, useState, useCallback, useEffect } from "react";
import { Flashlight, FlashlightOff, SwitchCamera, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import TelaBiparCracha from "../TelaBiparCracha";
import { BLUE, RED, RED_DARK, RED_SOFT } from "../lib/constantes";
import { FUNDO_MARCA } from "../TelasEntrada";
import { apenasNumeros } from "../lib/utilidades";

// ============ Scan (câmera com leitor nativo + ZXing de reforço) ============
function ScanView({ T, onDetected, onCancel, variante, ocupado }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState("iniciando");
  const [erroMsg, setErroMsg] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [facing, setFacing] = useState("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchDisponivel, setTorchDisponivel] = useState(false);
  const tentativasRef = useRef(0);
  const [recusado, setRecusado] = useState(false);
  const recusadoTimerRef = useRef(null);
  const bloqueioRef = useRef({ codigo: null, ate: 0 });
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected; // sempre a versão mais nova (a leitura continua ligada depois de um código recusado)

  // Leitura em múltiplos ângulos: o código pode estar na vertical (etiqueta virada, embalagem
  // cilíndrica etc). A cada tentativa giramos o frame pra um ângulo diferente (0°/90°/270°/180°),
  // assim o leitor consegue achar o código nos dois modos sem precisar que o usuário gire o produto.
  const ANGULOS_TENTATIVA = [0, 90, 270, 180];
  const rotationCanvasRef = useRef(null);
  const obterFonteRotacionada = useCallback((video, angulo) => {
    if (angulo === 0) return video;
    if (!rotationCanvasRef.current) rotationCanvasRef.current = document.createElement("canvas");
    const canvas = rotationCanvasRef.current;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return video;
    if (angulo === 90 || angulo === 270) { canvas.width = h; canvas.height = w; } else { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angulo * Math.PI) / 180);
    ctx.drawImage(video, -w / 2, -h / 2, w, h);
    ctx.restore();
    return canvas;
  }, []);

  const pararTudo = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (zxingControlsRef.current) { try { zxingControlsRef.current.stop(); } catch {} zxingControlsRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  // Código lido: avisa a tela de fora. Se ela devolver `false` (código recusado: curto, EAN inválido…), a câmera
  // CONTINUA ligada e lendo (antes a câmera era desligada antes de perguntar e a tela ficava preta).
  // O mesmo código recusado é ignorado por 3 s para não repetir o aviso a cada quadro.
  const aoLer = useCallback((codigo) => {
    const agora = Date.now();
    if (bloqueioRef.current.codigo === codigo && agora < bloqueioRef.current.ate) return false;
    let resposta;
    try { resposta = onDetectedRef.current(codigo); } catch (e) { pararTudo(); throw e; }
    if (resposta === false) {
      bloqueioRef.current = { codigo, ate: agora + 3000 };
      setRecusado(true);
      clearTimeout(recusadoTimerRef.current);
      recusadoTimerRef.current = setTimeout(() => setRecusado(false), 2800);
      return false;
    }
    pararTudo();
    return true;
  }, [pararTudo]);
  useEffect(() => () => clearTimeout(recusadoTimerRef.current), []);

  // Correção do bug do iPhone: antes, cada frame tentava só 1 ângulo do ciclo [0,90,270,180],
  // então o ângulo 0° (leitura normal, sem rotação) só era testado 1 a cada 4 frames — na prática
  // isso "diluiu" a leitura normal em 75% e, somado ao custo de rotacionar o canvas a cada frame,
  // o app parava de bipar até código na posição de sempre. Agora TODO frame tenta o ângulo 0°
  // primeiro (rápido, sem canvas) e só usa 1 ângulo extra do ciclo como tentativa secundária.
  const scanLoopNativo = useCallback(() => {
    rafRef.current = requestAnimationFrame(async () => {
      if (videoRef.current && detectorRef.current && videoRef.current.readyState >= 2) {
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes && codes.length > 0 && aoLer(codes[0].rawValue)) return;
        } catch (e) {
          // erro pontual de detecção num frame — segue tentando
        }
        tentativasRef.current += 1;
        if (tentativasRef.current % 3 === 0) {
          const angulo = ANGULOS_TENTATIVA[(tentativasRef.current / 3) % ANGULOS_TENTATIVA.length];
          if (angulo !== 0) {
            try {
              const fonte = obterFonteRotacionada(videoRef.current, angulo);
              const codes = await detectorRef.current.detect(fonte);
              if (codes && codes.length > 0 && aoLer(codes[0].rawValue)) return;
            } catch (e) {
              // idem — segue tentando
            }
          }
        }
      }
      scanLoopNativo();
    });
  }, [aoLer, obterFonteRotacionada]);

  // Leitor alternativo (Safari/iOS, que não tem BarcodeDetector nativo): em vez de depender do método
  // "contínuo" da própria lib (que tem se mostrado instável no Safari), controlamos o loop nós mesmos —
  // desenhamos cada frame do vídeo num canvas e pedimos pra biblioteca decodificar só aquele frame.
  // É o mesmo padrão usado acima pro leitor nativo, então o comportamento fica consistente e mais fácil de confiar.
  // Correção: a build do ZXing carregada pelo CDN não tem o método "decodeFromCanvas" (é isso que
  // aparecia como erro no diagnóstico do iPhone). O método público e confirmado nessa versão é
  // "decode(elemento)", que aceita o próprio <video> direto — ele mesmo cuida do canvas interno.
  const canvasZXingRef = useRef(null);
  const roiCanvasRef = useRef(null);
  // Recorte central quadrado do vídeo (até 960 px), já girado no ângulo pedido: o código fica grande e a leitura
  // não depende de como o iPhone entrega o quadro (em pé ou deitado).
  const recorteCentral = useCallback((video, angulo) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const lado = Math.min(vw, vh), destino = Math.min(lado, 960);
    if (!roiCanvasRef.current) roiCanvasRef.current = document.createElement("canvas");
    const canvas = roiCanvasRef.current;
    if (canvas.width !== destino) canvas.width = destino;
    if (canvas.height !== destino) canvas.height = destino;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.save();
    ctx.translate(destino / 2, destino / 2);
    if (angulo) ctx.rotate((angulo * Math.PI) / 180);
    ctx.drawImage(video, (vw - lado) / 2, (vh - lado) / 2, lado, lado, -destino / 2, -destino / 2, destino, destino);
    ctx.restore();
    return canvas;
  }, []);
  const scanLoopZXing = useCallback((codeReader, ZXing, hints) => {
    // Caminho principal: nós mesmos montamos a imagem (recorte central) e pedimos a leitura em pé e deitado, alternando.
    const temNucleo = !!(ZXing && ZXing.MultiFormatReader && ZXing.BinaryBitmap && ZXing.HybridBinarizer && ZXing.HTMLCanvasElementLuminanceSource);
    const nucleo = temNucleo ? new ZXing.MultiFormatReader() : null;
    if (nucleo && hints) nucleo.setHints(hints);
    function lerRecorte(video, angulo) {
      const canvas = recorteCentral(video, angulo);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
      try { return nucleo.decodeWithState(bitmap); } finally { nucleo.reset(); }
    }
    // Caminho antigo (quadro inteiro pela própria biblioteca): fica de reforço a cada 5 quadros
    function lerQuadroInteiro(video) {
      if (typeof codeReader.decode === "function") return codeReader.decode(video);
      if (!canvasZXingRef.current) canvasZXingRef.current = document.createElement("canvas");
      const canvas = canvasZXingRef.current;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height);
      return codeReader.decodeFromCanvas(canvas);
    }
    function tentar(fn) { try { return fn(); } catch (e) { return null; } } // "não achou neste quadro" é o normal
    function tentarFrame() {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        tentativasRef.current += 1;
        const n = tentativasRef.current;
        let resultado = null;
        if (nucleo) resultado = tentar(() => lerRecorte(video, n % 2 === 0 ? 90 : 0));
        if (!resultado && (!nucleo || n % 5 === 0)) resultado = tentar(() => lerQuadroInteiro(video));
        if (resultado && aoLer(resultado.getText())) return;
      }
      rafRef.current = requestAnimationFrame(tentarFrame);
    }
    tentarFrame();
  }, [aoLer, recorteCentral]);

  // O leitor (ZXing) vem empacotado no app (antes era baixado de um site externo na hora de bipar)
  function carregarZXing() { return import("@zxing/library"); }
  function comTimeout(promessa, ms) {
    return Promise.race([
      promessa,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  const iniciarCamera = useCallback(async (facingAtual) => {
    setStatus("iniciando");
    setErroMsg("");
    pararTudo();
    tentativasRef.current = 0;

    // trava de segurança: se nada resolver em 12s (comum em Safari/iOS com script lento), cai pro modo manual
    const timeoutGeral = setTimeout(() => {
      setStatus((atual) => {
        if (atual === "iniciando") { setManualMode(true); setErroMsg("A câmera demorou demais para responder neste navegador."); return "erro"; }
        return atual;
      });
    }, 12000);

    // tenta a câmera preferida (frontal/traseira) com resolução ideal; se o navegador recusar
    // a restrição exata, tenta de novo de forma mais permissiva antes de desistir
    async function obterStream() {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingAtual }, width: { ideal: 720 }, height: { ideal: 1280 } }
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({ video: true });
      }
    }

    try {
      const stream = await obterStream();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {}); // iOS pode rejeitar a promise mesmo funcionando; não bloqueia o fluxo
      }

      let capabilities = {};
      try { const track = stream.getVideoTracks()[0]; capabilities = track && track.getCapabilities ? track.getCapabilities() : {}; } catch {}
      setTorchDisponivel(!!capabilities.torch);
      setTorchOn(false);

      if ("BarcodeDetector" in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] });
        clearTimeout(timeoutGeral);
        setStatus("ok");
        scanLoopNativo();
        return;
      }

      // navegador sem leitor nativo (ex: Safari/iOS): carrega leitor alternativo dinamicamente
      try {
        const ZXing = await comTimeout(carregarZXing(), 8000);
        const hints = new Map();
        // restringe aos formatos de código de barras de varejo (mais rápido e mais preciso que testar tudo, incl. QR)
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.ITF
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const codeReader = new ZXing.BrowserMultiFormatReader(hints);
        clearTimeout(timeoutGeral);
        setStatus("ok");
        // espera 1 frame real de vídeo chegar antes de começar a tentar ler (evita ler tela preta no início)
        requestAnimationFrame(() => scanLoopZXing(codeReader, ZXing, hints));
      } catch (e) {
        clearTimeout(timeoutGeral);
        setStatus("sem-suporte");
        setManualMode(true);
      }
    } catch (e) {
      clearTimeout(timeoutGeral);
      if (e && e.name === "NotAllowedError") setErroMsg("Permissão de câmera negada. Habilite o acesso nas configurações do navegador.");
      else if (e && e.name === "NotFoundError") setErroMsg("Nenhuma câmera foi encontrada neste dispositivo.");
      else setErroMsg("Não foi possível acessar a câmera.");
      setStatus("erro");
      setManualMode(true);
    }
  }, [onDetected, pararTudo, scanLoopNativo, scanLoopZXing]);

  // Único ponto que liga/desliga a câmera: roda de novo sempre que voltamos do modo manual
  // (botão "voltar pra câmera" ou "tentar novamente") ou quando a câmera frontal/traseira é trocada.
  // Isso corrige o bug de tentar reiniciar a câmera antes do <video> existir na tela.
  useEffect(() => {
    if (!manualMode) iniciarCamera(facing);
    return () => pararTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, manualMode]);

  function alternarTorch() {
    const track = streamRef.current && streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const novoEstado = !torchOn;
    track.applyConstraints({ advanced: [{ torch: novoEstado }] }).then(() => setTorchOn(novoEstado)).catch(() => {});
  }

  function submitManual() {
    const code = apenasNumeros(manualCode, 14);
    if (code.length < 4) return;
    pararTudo();
    onDetected(code);
  }

  // Crachá (cadastro/vínculo): tela cheia própria, mesma leitura de código por baixo.
  if (variante === "cracha") {
    return (
      <TelaBiparCracha status={status} erroMsg={erroMsg} videoRef={videoRef} manualMode={manualMode} setManualMode={setManualMode}
        manualCode={manualCode} setManualCode={setManualCode} torchDisponivel={torchDisponivel} torchOn={torchOn} onTorch={alternarTorch}
        onTrocarCamera={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} onConfirmarManual={submitManual}
        onVoltar={() => { pararTudo(); onCancel(); }} onTentarDeNovo={() => { setErroMsg(""); setManualMode(false); }} ocupado={ocupado} />
    );
  }

  return (
    <div className="px-4 pt-4">
      {!manualMode && (
        <div style={{ background: FUNDO_MARCA, isolation: "isolate" }} className="relative rounded-[28px] overflow-hidden px-4 pt-3 pb-7 flex flex-col items-center">
          <span aria-hidden className="absolute -right-16 -top-14 h-52 w-52 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -left-10 bottom-16 h-28 w-28 rounded-full bg-white/10" />
          {/* O Bipi segura o celular: a cabeça aparece por cima, as mãos nas laterais e os pés embaixo; a câmera é a tela do celular */}
          <BipiCabeca alerta={recusado} />
          <div className="relative w-[82%] -mt-3">
            <span aria-hidden className="absolute left-[22%] -bottom-3 h-6 w-12 rounded-full" style={{ background: "#E31E24" }} />
            <span aria-hidden className="absolute right-[22%] -bottom-3 h-6 w-12 rounded-full" style={{ background: "#E31E24" }} />
            <div className="relative rounded-[30px] p-2 shadow-2xl shadow-black/40" style={{ background: "#0A1B33", border: "1px solid rgba(255,255,255,.18)" }}>
              <div className="relative rounded-[23px] overflow-hidden bg-black" style={{ aspectRatio: "3/4", WebkitMaskImage: "-webkit-radial-gradient(white,black)" }}>
                <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline webkit-playsinline="true" />
                <span aria-hidden className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-12 rounded-full bg-black/60" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[78%] h-32 relative">
                    <CornerGuide pos="tl" />
                    <CornerGuide pos="tr" />
                    <CornerGuide pos="bl" />
                    <CornerGuide pos="br" />
                    <div style={{ background: RED }} className="absolute left-0 right-0 top-1/2 h-0.5 animate-pulse" />
                    <div style={{ background: RED }} className="absolute top-0 bottom-0 left-1/2 w-0.5 animate-pulse opacity-70" />
                  </div>
                </div>

                <div className="absolute top-3 right-3 flex flex-col gap-2">
                  {torchDisponivel && (
                    <button onClick={alternarTorch} aria-label={torchOn ? "Desligar a lanterna" : "Ligar a lanterna"} className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center">
                      {torchOn ? <Flashlight size={16} color="#FFD34D" /> : <FlashlightOff size={16} color="#fff" />}
                    </button>
                  )}
                  <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Trocar de câmera" className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center">
                    <SwitchCamera size={16} color="#fff" />
                  </button>
                </div>

                {status === "iniciando" && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="animate-spin" color="#fff" size={26} />
                    <p className="text-white text-xs">Abrindo câmera...</p>
                  </div>
                )}
                <div className="absolute bottom-3 left-2 right-2 text-center" role="status" aria-live="polite">
                  {recusado
                    ? <p className="text-[11px] font-semibold inline-block px-3 py-1.5 rounded-2xl leading-snug" style={{ background: "#FFF4E0", color: "#7A4B00" }}>Esse código não foi aceito. Pode apontar para outro: a câmera continua ligada.</p>
                    : <p className="text-white/90 text-[11px] font-medium bg-black/45 inline-block px-3 py-1 rounded-full">Código em pé ou deitado</p>}
                </div>
              </div>
            </div>
            {/* mãos do Bipi segurando o celular (por cima da moldura) */}
            <span aria-hidden className="absolute -left-3 top-[46%] h-9 w-9 rounded-full bg-white shadow-md" style={{ border: "3px solid #7DB4F0" }} />
            <span aria-hidden className="absolute -right-3 top-[46%] h-9 w-9 rounded-full bg-white shadow-md" style={{ border: "3px solid #7DB4F0" }} />
          </div>
        </div>
      )}

      {status === "erro" && (
        <div style={{ background: RED_SOFT }} className="mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} color={RED_DARK} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: RED_DARK }}>{erroMsg}</p>
            <button onClick={() => { setManualMode(false); }} className="text-xs font-semibold mt-1.5 flex items-center gap-1" style={{ color: RED_DARK }}>
              <RotateCcw size={12} /> Tentar novamente
            </button>
          </div>
        </div>
      )}
      {status === "sem-suporte" && (
        <div className="mt-3">
          <p style={{ color: T.subtext }} className="text-xs text-center">Este navegador não suporta leitura automática. Digite manualmente.</p>
          <button onClick={() => setManualMode(false)} className="w-full text-xs font-semibold mt-1.5 flex items-center justify-center gap-1" style={{ color: BLUE }}>
            <RotateCcw size={12} /> Tentar carregar a câmera de novo
          </button>
        </div>
      )}

      {!manualMode ? (
        <button onClick={() => setManualMode(true)} className="w-full mt-4 flex items-center justify-center gap-2 text-sm font-medium py-3 rounded-2xl border" style={{ borderColor: BLUE, color: BLUE }}>
          Digitar código manualmente
        </button>
      ) : (
        <div style={{ background: T.card, borderColor: T.border }} className="mt-4 rounded-2xl p-4 border shadow-lg shadow-black/5">
          <label style={{ color: T.subtext }} className="text-xs font-semibold mb-1.5 block">Código do produto (somente números)</label>
          <input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={14} value={manualCode}
            onChange={(e) => setManualCode(apenasNumeros(e.target.value, 14))}
            onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }} placeholder="Ex: 7891234567890"
            style={{ background: T.inputBg, color: T.text, borderColor: T.inputBorder }} className="w-full font-mono border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" />
          <p style={{ color: T.subtext }} className="text-[10px] mt-1">{manualCode.length}/14 dígitos {manualCode.length > 0 && manualCode.length < 4 ? "— mínimo 4 dígitos" : ""}</p>
          <button onClick={submitManual} disabled={manualCode.length < 4} style={{ background: manualCode.length >= 4 ? BLUE : "#C7CEDA" }} className="w-full mt-2 text-white text-sm font-semibold py-2.5 rounded-xl">
            Confirmar código
          </button>
          {status !== "erro" && status !== "sem-suporte" && (
            <button onClick={() => setManualMode(false)} style={{ color: T.subtext }} className="w-full mt-2 text-xs py-1">Voltar para a câmera</button>
          )}
        </div>
      )}

      <button onClick={() => { pararTudo(); onCancel(); }} style={{ color: T.subtext }} className="w-full mt-3 text-xs py-2">Cancelar</button>
    </div>
  );
}

// Cabeça do Bipi (cópia fiel de public/bipi-acenando.svg: antena, orelhas, cabeça e rosto; só o recorte muda).
// `alerta` = expressão oficial de atenção (olhos âmbar e boca em "o") quando um código é recusado.
function BipiCabeca({ alerta }) {
  const olho = alerta ? "#F5A524" : "#2ECC71";
  return (
    <svg aria-hidden viewBox="78 20 244 212" className="relative w-[168px] h-auto shrink-0">
      <path d="M200 74 V46" stroke="#7DB4F0" strokeWidth="7" strokeLinecap="round" />
      <circle cx="200" cy="38" r="12" fill="#E31E24" /><circle cx="196" cy="34" r="3.5" fill="#fff" opacity=".8" />
      <rect x="86" y="118" width="22" height="62" rx="11" fill="#0B4F9E" /><rect x="292" y="118" width="22" height="62" rx="11" fill="#0B4F9E" />
      <rect x="104" y="72" width="192" height="152" rx="48" fill="#EAF1FB" stroke="#7DB4F0" strokeWidth="4" />
      <rect x="124" y="94" width="152" height="108" rx="32" fill="#082F5E" />
      <rect x="152" y="112" width="28" height="36" rx="14" fill={olho} /><rect x="220" y="112" width="28" height="36" rx="14" fill={olho} />
      <circle cx="163" cy="124" r="5" fill="#fff" opacity=".85" /><circle cx="231" cy="124" r="5" fill="#fff" opacity=".85" />
      <path d="M116 166 H284" stroke="#E31E24" strokeWidth="16" strokeLinecap="round" opacity=".22" />
      <path d="M120 166 H280" stroke="#FF4A50" strokeWidth="5" strokeLinecap="round" />
      {alerta
        ? <circle cx="200" cy="187" r="6" fill="none" stroke="#fff" strokeWidth="4" />
        : <path d="M186 184 Q200 194 214 184" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />}
      <circle cx="262" cy="84" r="5" fill="#2ECC71" /><circle cx="262" cy="84" r="9" fill="#2ECC71" opacity=".3" />
    </svg>
  );
}

function CornerGuide({ pos }) {
  const estilosPorCanto = {
    tl: "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
    tr: "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
    bl: "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
    br: "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
  };
  return <div className={`absolute h-5 w-5 ${estilosPorCanto[pos]}`} style={{ borderColor: RED }} />;
}

export { CornerGuide, ScanView };
