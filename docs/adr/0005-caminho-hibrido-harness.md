# ADR-0005 — Caminho híbrido: consertar agora, migrar para o `yas-harness` depois

**Data:** 2026-08-14
**Status:** aceito, **corrigido em parte pelo [ADR-0006](0006-inteligencia-e-second-brain-sao-do-alfred.md)**
**Decisor:** Yves
**Contexto completo:** `specs/project/PLANO-ESTRUTURACAO.md`

> ⚠️ **Leia o ADR-0006 junto.** A regra "não construa roteador nem provider aqui"
> vale para o **gateway** e para a **triagem genérica**. Ela **não** vale para a
> camada de inteligência do Alfred — RAG, second brain pessoal, memória entre
> módulos e a escolha de modelo pelo usuário são deste projeto, não do chassi.

## Contexto

Ao especificar a frente "camada de IA" — tirar o modelo do código, colocar um roteador
barato na frente, avaliar o Groq — descobriu-se que o `yas-harness` **já tem tudo isso**,
testado e empacotado:

| O que o Alfred ia construir | O que o harness já tem |
|---|---|
| modelo, preço e região em configuração | `config/models.json` com tiers, preços e ordem de fallback (ADR-0002 de lá) |
| roteador de intenção em modelo barato | `src/router/` com `confidence`, `reason` e eval (ADR-0003 de lá) |
| provider Groq | `models.example.json` já traz o Groq como provider `fast` |
| custo por chamada | tabela `model_usage` |

Somado ao princípio já escrito na visão do portfólio — *"reusar, não reconstruir"* —
construir aquilo dentro do `alfred-bot` seria reconstruir o chassi.

Ao mesmo tempo, dois fatos impedem migrar de uma vez:

- **O módulo fin está quebrado.** O `gemini-2.0-flash-lite-001`, hardcoded em dois
  arquivos e usado por padrão para texto e para cupom, foi desligado no Vertex AI em
  2026-06-01 — o mesmo mês em que o trabalho parou. Ver C0.
- **Os bancos não são o mesmo.** O harness pede PostgreSQL com pgvector; o Alfred é
  MongoDB.

## Decisão

**Caminho híbrido.** Consertar o mínimo agora, registrar o destino agora, executar a
migração depois.

**Agora, no `alfred-bot`:**

1. Modelo, região e provider saem do código para `infra/config.ts`, com um teste que
   trava a lição (nenhum modelo já aposentado pode voltar a ser default).
2. Falha de OCR sobe como erro tipado (`OcrError`) em vez de virar texto do cupom.
3. A fronteira módulo/chassi fica declarada e testada (ADR-0004).

**Não agora, e explicitamente:**

- **Não** construir roteador de intenção dentro do `alfred-bot`.
- **Não** construir um provider Groq dentro do `alfred-bot`.

Os dois são trabalho do chassi. Construí-los aqui seria jogar fora depois.

**Depois, em ADR próprio:** o Alfred passa a rodar sobre o `yas-harness`, o domínio fin
vira módulo do chassi, e os adapters de Telegram/WhatsApp/Web viram canais. Fica em aberto
se o harness entra como dependência npm (ele já está empacotado) ou por fork, e se o
MongoDB continua ou o Alfred vai para Postgres.

## Alternativas descartadas

**Seguir autônomo** (reconstruir o chassi no Alfred). Descartado por contrariar
"reusar, não reconstruir" e por multiplicar manutenção — todo produto YAS precisaria do
mesmo gateway.

**Migrar já.** Descartado por empilhar dois projetos: trocar de chassi e trocar de banco
ao mesmo tempo esconde qual dos dois quebrou.

## Consequências

**O que isto compra.** O bot volta a funcionar sem trabalho descartável. Nada do que foi
construído se perde: o domínio fin — 189 testes, LGPD, multi-plataforma, NFC-e com dígito
verificador e deduplicação — é exatamente o que o harness não faz e não deve fazer.

**O que custa.** Um período com dois chassis no mundo: o caseiro rodando e o compartilhado
esperando. Enquanto durar, toda mudança no chassi caseiro é dívida — e por isso o
`modules/README.md` diz, por escrito, o que sai na migração.

**O que fica pendente.** A frente F1 do roadmap perdeu as etapas 2 e 3 (roteador e Groq).
O que sobrou dela — a etapa 1 — está feito.
