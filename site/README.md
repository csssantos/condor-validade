# Site da Bip Labs (usebipi.com)

Página estática (HTML + CSS + JS, sem build, sem biblioteca externa). CSP estrita em `vercel.json`.

## Publicar (quem faz: o dono)
1. Vercel → Add New → Project → importar `csssantos/condor-validade`.
2. **Root Directory = `site`**, Framework Preset = Other, sem build command. Esse é um projeto SEPARADO do app.
3. Primeiro publicar o branch `site-usebipi` como prévia e conferir; só depois ligar o domínio.
4. Domains → adicionar `usebipi.com` (e `www.usebipi.com` redirecionando). DNS na IONOS: apontar o apex/`www` como a Vercel mostrar, SEM mexer em MX/SPF/DKIM/TXT do e-mail (`mail.usebipi.com`) nem no CNAME de `app`.
5. Criar a caixa `contato@usebipi.com` (ou trocar o endereço em `index.html`).

## Combinado
- Só afirmar o que o produto já faz; o resto fica marcado "Em planejamento" ou "Ideia".
- Sem número de clientes, métricas ou depoimentos inventados.
- Sem script/estilo inline (a CSP bloqueia). Fonte do sistema, sem rastreadores, sem cookies.
- Página de privacidade pública do site: ainda a fazer (hoje a Privacidade está dentro do app).
