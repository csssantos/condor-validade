# Ambiente de teste (staging) do Bipi Validade

Objetivo: testar mudanças de banco e de app SEM tocar nos dados reais. Custo: R$ 0 (plano gratuito).

## Montagem (uma vez, ~20 min, feita pelo dono)
1. **Supabase**: criar um 2º projeto gratuito chamado `bipi-staging` (a conta gratuita aceita 2 projetos).
2. **Restaurar dados fictícios** (nunca os reais de produção com dado pessoal sem necessidade): o workflow `restaurar-teste.yml` do repositório privado de backup já sabe subir o backup num Postgres descartável. Para o staging, restaurar o `.sql.gz.gpg` mais novo no projeto novo (SQL Editor ou `psql`) e depois **anonimizar**: trocar `usuarios.nome/email`, `funcionarios_pendentes`, `login_auditoria.ip` por valores falsos.
3. **Vercel**: Settings → Environment Variables → criar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do staging **só no ambiente Preview**. Assim todo branch/PR abre uma prévia ligada ao banco de teste, e a `main` continua no banco real.
4. **Auth do staging**: ligar "Anonymous sign-ins" (convite de promotor) e colocar a URL da prévia em Redirect URLs.
5. **CSP e rota `/supa`**: o `vercel.json` só libera o endereço do Supabase REAL (img-src/connect-src) e o `/supa` repassa para ele. Para a prévia falar com o staging, é preciso incluir o endereço do staging na CSP (em um branch de teste, nunca na `main` com o do real misturado sem revisão). Peça isso ao Claude no momento de montar.
6. Telegram/Resend/Gemini: NÃO configurar no staging (ou usar um bot de teste separado).

## Regra de uso
- SQL novo: rodar primeiro no staging, conferir (`select diagnostico_schema();` ou a aba "Banco" na Gestão), só depois em produção.
- Nunca copiar chaves de serviço do projeto real para o staging.
- Se `VITE_SUPABASE_URL` do Preview não estiver definida, a prévia aponta para o banco REAL: confira antes de testar escrita.
