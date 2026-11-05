# Bipi em 3D

Mascote do Condor · Alerta de Validade (mesmo desenho de `public/mascote.svg`), em 3D. REGRA FIXA: o Bipi padrão NÃO tem placa na mão. A placa (check) existe só em `bipi-placa.glb`, para versões futuras.

- `bipi.glb`: Bipi padrão (glTF 2.0; abre no Blender, Three.js, visualizadores 3D). Nós com nome para animar: `cabeca`, `olhoL/R`, `cejaL/R`, `boca` (escala Y = abertura), `sorriso`, `feixe`, `antenaPivo`, braços em 2 segmentos (`bracoL/R`, `antebracoL/R`) com mãos (`maoL/R`, `polegar`, `dedo`).
- `bipi-celular.glb`: Bipi com celular (a tela usa textura dinâmica; o renderizador troca a imagem a cada quadro). `bipi-placa.glb`: versão com placa.
- `bipi-3d.html`: visualizador (arraste para girar; botões Acenar e Falar). `bipi-3d-previa.png`, `bipi-3d-celular.png`: prévias.
- `fonte/`: `make_bipi_glb.py` (`python3 make_bipi_glb.py bipi.glb [--celular] [--placa]`, só numpy), `bipi3d.js` (renderizador WebGL próprio), `bipi_rig.js` (IK dos braços).
- `video-fonte/`: roteiro do vídeo de 45 s (HTML determinístico `frame(t)`, captura por Playwright, trilha em numpy). As telas vêm do harness do app (scratchpad), não ficam no git.
