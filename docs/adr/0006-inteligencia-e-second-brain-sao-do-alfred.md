# ADR-0006 — A inteligência e o second brain são do Alfred; o gateway de modelos, não

**Data:** 2026-08-17
**Status:** aceito
**Decisor:** Yves
**Corrige:** [ADR-0005](0005-caminho-hibrido-harness.md), que traçou a linha larga demais

## Contexto

O ADR-0005 fechou o caminho híbrido com uma regra curta: *"não construa roteador
de intenção nem provider novo de modelo aqui — é do chassi."*

A regra está certa para o **encanamento** e errada para o **produto**. Do jeito que
ficou escrita, ela empurraria para o `yas-harness` coisas que são o diferencial do
Alfred — e o harness, pela regra de ouro dele, não pode aceitá-las:

> *"se um trecho de código não serviria igual num tutor de línguas e num CRM, ele
> não pertence ao harness."*

Um second brain que sabe **quanto você gastou, o que você tem para fazer e como
seus projetos andam** é exatamente o oposto disso. É domínio, e domínio é do produto.

A lista mestre de referências já tinha registrado a mesma conclusão ao estudar o
Supermemory: *"como o second brain é **o diferencial** do produto, construir o
próprio faz sentido."*

## Decisão

**A linha é entre _como se fala com o modelo_ e _o que o assistente sabe_.**

| | Fica no chassi (`yas-harness`) | Fica no Alfred |
|---|---|---|
| **Modelos** | gateway, fallback, retry, contabilidade de custo, compressão de contexto | — |
| **Escolha do modelo** | o mecanismo: catálogo, tiers, rotas, cofre da chave | **a escolha do usuário** e o que ela significa no produto (plano, limite, BYOK) |
| **Roteamento** | rotear a mensagem ao módulo certo, na triagem barata | **o catálogo dos módulos** — quem existe e o que cada um trata |
| **Memória** | o mecanismo: chunking, embedding, busca vetorial, retenção | **o que merece ser lembrado**, como se conecta entre módulos, e o que fazer com isso |
| **Inteligência** | — | **RAG e second brain pessoal**, personalização, proatividade |

Três consequências que valem como regra:

**1. Trocar de modelo é infraestrutura; escolher o modelo é produto.** O Alfred
**precisa** deixar o usuário escolher — hoje já existe `/ia gpt|gemini` persistido
em `User.aiModel`. Isso continua e cresce (mais modelos, e no futuro a chave do
próprio cliente). O que o Alfred **não** constrói é o gateway por baixo: quem
chama o provedor, tenta o próximo e contabiliza o custo.

**2. Groq — ou qualquer outro — entra por configuração, não por código novo aqui.**
O harness já traz o Groq como provider `fast` no `models.example.json`. O trabalho
do Alfred é expor a escolha ao usuário e ligá-la ao plano, não escrever um
`GroqProcessor`.

**3. O second brain é do Alfred e não vai para o harness.** Nem quando a migração
acontecer. O harness empresta o mecanismo de memória; o que o Alfred lembra sobre
a vida de uma pessoa — e o que ele conclui disso — é o produto.

## O que isto muda no ADR-0005

Onde ele diz *"não construa roteador de intenção nem provider novo de modelo
aqui"*, leia-se: **não construa o gateway nem a triagem genérica**. Continua valendo.

O que **não** vale mais é a leitura ampla de que "IA é tudo do chassi". A camada de
inteligência do Alfred — RAG sobre os dados da pessoa, second brain, memória entre
módulos, proatividade — é deste projeto, é o diferencial, e é onde o esforço de
produto deve ir.

## Consequências

**O que isto compra.** A fronteira fica defensável nos dois sentidos: o harness não
incha com domínio, e o Alfred não terceiriza o que o torna diferente. E responde de
antemão a pergunta que ia aparecer na migração — *"a memória do usuário vai para o
chassi?"*. Não vai.

**O que custa.** O Alfred passa a ter uma camada a construir que não estava no
roadmap: a inteligência. Ela é maior que qualquer módulo isolado, e é pré-requisito
da proatividade (F2) — não dá para avisar "o que precisa da sua atenção agora" sem
uma memória que saiba o que é relevante.

**O que fica em aberto.**

- **Onde a memória mora fisicamente.** O harness usa Postgres com pgvector; o Alfred
  é Mongo (que tem busca vetorial no Atlas). Decisão junto com a da migração.
- **Construir ou usar o Supermemory self-hosted.** A lista mestre recomenda estudá-lo
  como livro-texto e verificar a licença antes de qualquer reuso.
- **O escopo do second brain v1.** Provavelmente não é "tudo sobre você", e sim o
  cruzamento que só o Alfred tem: gasto ↔ tarefa ↔ projeto.
