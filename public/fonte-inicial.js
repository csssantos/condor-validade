// Aplica o tamanho de letra salvo ANTES do app abrir (evita a tela "pular"). Arquivo separado por causa da CSP (sem script inline).
try {
  var p = JSON.parse(localStorage.getItem("condor-validade:preferencias") || "null");
  var f = p && p.fonte;
  if (f === "grande") document.documentElement.style.fontSize = "112.5%";
  else if (f === "maior") document.documentElement.style.fontSize = "125%";
} catch (e) { /* sem armazenamento */ }
