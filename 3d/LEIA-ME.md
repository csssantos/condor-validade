# Bipi em 3D

Mascote do Condor · Alerta de Validade (mesmo desenho de `public/mascote.svg`), modelado em 3D.

- `bipi.glb`: modelo glTF 2.0 binário (abre no Blender, Three.js, visualizadores de 3D do Windows/Mac). Cada parte tem nome (`cabeca`, `olhoL`, `feixe`, `bracoR`, `etiqueta`...) para animar. Materiais PBR nas cores oficiais; olhos, feixe e LEDs têm emissão.
- `bipi-3d.html`: visualizador de arquivo único (arraste para girar, botão Acenar). Abre direto no navegador.
- `bipi-3d-previa.png`: 4 ângulos.
- `fonte/make_bipi_glb.py`: gera o .glb (só precisa de numpy): `python3 make_bipi_glb.py bipi.glb`.
- `fonte/bipi3d.js`: renderizador WebGL próprio usado no visualizador e no vídeo.

Regra do projeto: nunca criar outro mascote; mudar só pose/cena.
