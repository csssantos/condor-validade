// Parte do App (separado de App.jsx em 2026-11-05). Mudanças de comportamento: ver CLAUDE.md.
import { useRef, useState, useCallback, useEffect } from "react";
import { Flashlight, FlashlightOff, SwitchCamera, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import TelaBiparCracha from "../TelaBiparCracha";
import { BLUE, RED, RED_DARK, RED_SOFT, ZXING_CDN } from "../lib/constantes";
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
          if (codes && codes.length > 0) { pararTudo(); onDetected(codes[0].rawValue); return; }
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
              if (codes && codes.length > 0) { pararTudo(); onDetected(codes[0].rawValue); return; }
            } catch (e) {
              // idem — segue tentando
            }
          }
        }
      }
      scanLoopNativo();
    });
  }, [onDetected, pararTudo, obterFonteRotacionada]);

  // Leitor alternativo (Safari/iOS, que não tem BarcodeDetector nativo): em vez de depender do método
  // "contínuo" da própria lib (que tem se mostrado instável no Safari), controlamos o loop nós mesmos —
  // desenhamos cada frame do vídeo num canvas e pedimos pra biblioteca decodificar só aquele frame.
  // É o mesmo padrão usado acima pro leitor nativo, então o comportamento fica consistente e mais fácil de confiar.
  // Correção: a build do ZXing carregada pelo CDN não tem o método "decodeFromCanvas" (é isso que
  // aparecia como erro no diagnóstico do iPhone). O método público e confirmado nessa versão é
  // "decode(elemento)", que aceita o próprio <video> direto — ele mesmo cuida do canvas interno.
  const canvasZXingRef = useRef(null);
  const scanLoopZXing = useCallback((codeReader) => {
    function decodeUmFrame(video, angulo) {
      const fonte = obterFonteRotacionada(video, angulo);
      if (typeof codeReader.decode === "function") return codeReader.decode(fonte);
      // fallback pra builds antigas que só tenham decodeFromCanvas
      if (!canvasZXingRef.current) canvasZXingRef.current = document.createElement("canvas");
      const canvas = canvasZXingRef.current;
      const largura = fonte.videoWidth || fonte.width, altura = fonte.videoHeight || fonte.height;
      canvas.width = largura;
      canvas.height = altura;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(fonte, 0, 0, largura, altura);
      return codeReader.decodeFromCanvas(canvas);
    }
    // Mesma correção do leitor nativo: no Safari/iPhone (que cai nesse caminho, sem BarcodeDetector),
    // o ciclo de ângulos fazia o app só tentar a leitura "normal" (0°) 1 a cada 4 frames, e cada
    // rotação de canvas tem custo alto de CPU no iOS — juntos, isso derrubava a taxa de leitura a
    // ponto de nunca bipar. Agora todo frame tenta 0° primeiro (direto no vídeo, sem canvas) e só
    // testa um ângulo rotacionado a cada 3 frames, como reforço pra código na vertical/de lado.
    function tentarFrame() {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const resultado = decodeUmFrame(video, 0);
          if (resultado) { pararTudo(); onDetected(resultado.getText()); return; }
        } catch (e) {
          // "não encontrou código neste frame" é esperado na maioria das tentativas — segue tentando
        }
        tentativasRef.current += 1;
        if (tentativasRef.current % 3 === 0) {
          const angulo = ANGULOS_TENTATIVA[(tentativasRef.current / 3) % ANGULOS_TENTATIVA.length];
          if (angulo !== 0) {
            try {
              const resultado = decodeUmFrame(video, angulo);
              if (resultado) { pararTudo(); onDetected(resultado.getText()); return; }
            } catch (e) {
              // idem — segue tentando
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tentarFrame);
    }
    tentarFrame();
  }, [onDetected, pararTudo, obterFonteRotacionada]);

  function carregarZXing() {
    return new Promise((resolve, reject) => {
      if (window.ZXing) { resolve(window.ZXing); return; }
      const script = document.createElement("script");
      script.src = ZXING_CDN;
      script.async = true;
      script.onload = () => resolve(window.ZXing);
      script.onerror = () => reject(new Error("zxing-load-fail"));
      document.head.appendChild(script);
    });
  }
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
        requestAnimationFrame(() => scanLoopZXing(codeReader));
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
        <div className="relative rounded-[28px] overflow-hidden bg-black" style={{ aspectRatio: "3/4" }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline webkit-playsinline="true" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[78%] h-40 relative">
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
              <button onClick={alternarTorch} className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center">
                {torchOn ? <Flashlight size={16} color="#FFD34D" /> : <FlashlightOff size={16} color="#fff" />}
              </button>
            )}
            <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center">
              <SwitchCamera size={16} color="#fff" />
            </button>
          </div>

          {status === "iniciando" && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
              <Loader2 className="animate-spin" color="#fff" size={26} />
              <p className="text-white text-xs">Abrindo câmera...</p>
            </div>
          )}
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <p className="text-white/90 text-xs font-medium bg-black/40 inline-block px-3 py-1 rounded-full">Aponte para o código — na horizontal ou na vertical</p>
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
