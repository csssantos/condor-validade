# Inteligência operacional — configuração

## O que foi criado

| Parte | Onde |
|---|---|
| Telas (Previsão, Prevenção de Perdas, Assistente IA, Registrar perda) | `src/inteligencia.jsx` |
| Integração com rondas, menu lateral, menu "Mais" | `src/App.jsx` |
| Tabelas, colunas e visão `v_perdas` | `supabase/migrations/20261030185900_inteligencia_base.sql` |
| Funções de análise, risco, previsão, perdas, ações e ronda inteligente | `supabase/migrations/20261030190000_inteligencia_analises.sql` |
| Assistente de IA (servidor) | `supabase/functions/assistente-ia/index.ts` |

Tudo isso **já está aplicado** no projeto Supabase `fbovltxucooeoldjfckk` (migrations e Edge Function publicadas).

## Assistente de IA

Usa a API **gratuita** do Google Gemini (Google AI Studio), pela Edge Function `assistente-ia`.
A chave nunca vai para o navegador.

Secrets (Supabase → Edge Functions → Secrets):

| Nome | Obrigatório | Valor |
|---|---|---|
| `GEMINI_API_KEY` | sim (já configurado) | chave gratuita em https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | não | força um modelo. Vazio = escolhe sozinho um Flash disponível e pula modelos sobrecarregados |
| `IA_LIMITE_DIARIO` | não | perguntas por usuário por dia (padrão 500) |
| `GEMINI_PREFERIR_PRO` | não | `nao` desliga o Pro. Padrão: tenta o Gemini Pro mais novo e, se a chave não tiver acesso ou estiver no limite, usa o Flash |

Diagnóstico (sem dados da loja), com a chave anon:

```
POST /functions/v1/assistente-ia   {"acao":"status"}             → testa a chave e o modelo
POST /functions/v1/assistente-ia   {"acao":"teste_ferramentas"}  → testa o ciclo de ferramentas
```

## Regras de acesso

- Funcionário (nível 6): só **Registrar perda**, e só do próprio setor.
- Encarregado (5): análises, previsão, ações e IA **só do próprio setor**.
- Gerência (≤4): todos os setores da loja. Diretoria/desenvolvedor (≤2): qualquer loja.
- A IA consulta o banco com o token do próprio usuário: vê exatamente o que ele vê.
- A IA nunca cria nada sozinha: devolve uma proposta e o app pede confirmação, usando as mesmas
  funções das telas (`criar_ronda_inteligente`, `criar_ocorrencia`, `criar_acao_preventiva`).

## Indicador de risco (0–100)

Calculado por `analise_risco_produtos`, só com histórico real:

| Fator | Pontos |
|---|---|
| Vencimentos nos últimos 90 dias (peso extra para os últimos 30) | até 30 |
| Irregularidades em rondas (90 dias) | até 20 |
| Conferências com "atenção" (90 dias) | até 8 |
| Lote atual: vencido 30 · ≤7 dias 18 · ≤15 dias 10 · ≤30 dias 4 | até 30 |
| Outras perdas (avaria, quebra…) em 90 dias | até 10 |
| Tempo sem conferir: nunca/30+ dias 6 · 14+ dias 3 | até 6 |

Alto ≥ 60 · Médio ≥ 30 · Baixo < 30. Risco alto **não** significa produto vencido.

## Conversas

As conversas com a IA **não são salvas**: ficam só na tela e recomeçam quando o app é reaberto (ou em "Nova conversa").
As tabelas `ia_conversas`/`ia_mensagens` não são mais usadas.
