# ADR-0004 — O Alfred é um assistente pessoal modular, não um bot de finanças

**Data:** 2026-08-14
**Status:** aceito
**Decisor:** Yves
**Substitui parcialmente:** o escopo assumido em `specs/project/PROJECT.md` até esta data

## Contexto

O repositório nasceu como "bot de Telegram que registra gastos" e cresceu até ter
três plataformas, painel web, login, planos e LGPD — mas sempre como **produto
financeiro**.

Três coisas, lidas juntas, mostraram que isso é pequeno demais:

1. **A visão do portfólio** (`docs_yaslab/10-arquitetura-portfolio.md`) já classificava o
   Alfred como **plataforma**, não como micro-SaaS: *"nasce modular, de uma vez, não como
   peças soltas. Um assistente onde você conversa sobre tudo."*
2. **O concorrente-espelho já é modular.** O HeyAlfred entrega finanças, calendário,
   tarefas, projetos, atas e busca de documentos por £9,99/mês. Um bot só de finanças não
   compete com isso.
3. **O Caddy mostra o que é o produto de verdade.** Ele não se vende como app de tarefas:
   *"keeps an eye on your calendars, chats, and tasks, then tells you what needs your
   attention right now."* O valor não está em cada capacidade — está em **uma cabeça só
   olhando tudo**.

E do lado técnico: o `alfred-bot` já é um harness artesanal (roteador por `switch`,
gateway de modelos improvisado, camada de canal própria), com o domínio financeiro
misturado ao chassi. Sem separar os dois, todo módulo novo aumenta o `BotCore` — que já
tem 1042 linhas e a menor cobertura do projeto.

## Decisão

**O Alfred é um assistente pessoal com capacidades em módulos.** Os módulos do escopo
atual são **fin**, **tarefas** e **projetos**.

Quatro consequências que valem como regra:

**1. Módulo sabe domínio; chassi não sabe.** O teste é o mesmo do `yas-harness`: se o
código não serviria igual num assistente que nunca ouviu falar de dinheiro, não é módulo.
A fronteira está escrita em `bot/src/modules/README.md` e testada em
`bot/src/tests/modules.test.ts`.

**2. Declarar antes de mover.** Os três módulos se declaram agora
(`bot/src/modules/*/module.ts`) mesmo com o código do fin ainda espalhado em `services/`.
A declaração já paga sozinha: o catálogo de comandos passou a ter uma fonte só, e o campo
`description` de cada módulo é exatamente o texto que um roteador em modelo barato vai ler
para escolher o módulo. Mover a pasta é refactor grande e mecânico; declarar é barato e
reversível.

**3. Módulo declarado e não construído responde.** `implemented: false` faz `/tarefas` e
`/projetos` responderem *"ainda não disponível"*. O `switch` do `BotCore` ignora em
silêncio o que não conhece, e silêncio é a pior resposta possível.

**4. O contrato espelha o do `yas-harness`.** `ModuleDefinition` tem a forma do
`ModuleDefinition` de lá, para que a migração para o chassi compartilhado seja mecânica —
ver ADR-0005.

## Alternativas descartadas

**Continuar só financeiro e renomear.** Era o plano do catálogo (doc 02): concluir o Fin e
reservar "Alfred" para o secretário. Descartado porque o mercado já respondeu — o
concorrente direto entrega o pacote inteiro, e um app só de gasto vira commodity.

**Três produtos separados** (um de finanças, um de tarefas, um de projetos). Descartado
pela razão que torna o Alfred interessante: o cruzamento. "Quanto este projeto já me
custou" só existe se finanças e projetos forem módulos do **mesmo** assistente.

**Construir tarefas e projetos agora.** Descartado: o módulo fin está quebrado
(ver C0) e o chassi ainda não foi separado. Declarar primeiro, construir depois.

## Consequências

**O que isto compra.** O escopo do produto passa a caber no que o mercado espera. A
fronteira módulo/chassi vira código e teste, não intenção. E o roteador — quando existir —
encontra o catálogo pronto.

**O que custa.** Escopo maior com o mesmo tempo. A regra de contenção do doc 10 continua
valendo: **os módulos estão declarados, não em construção.** Construir `tasks` antes de o
`fin` funcionar seria trocar profundidade por largura no pior momento possível.

**O que ainda não está resolvido.**

- **A proatividade**, que é o coração do Caddy e o que o Alfred não tem. Hoje o assistente
  só fala quando falam com ele; a única exceção é o `ReminderScheduler`. A infraestrutura
  existe (`OutboundRegistry` entrega push nas três plataformas) — falta o que decide *o que
  merece ser dito*. É a próxima decisão de produto, não desta ADR.
- **O nome comercial.** "Alfred" segue como codinome interno: o HeyAlfred ocupa o nome.
- **Onde o domínio fin mora.** Continua em `services/`. A migração para `modules/fin/`
  tem escopo definido no README da pasta e data nenhuma.
