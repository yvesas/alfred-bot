# ADR-0007 — Copiar os contratos do `yas-harness`, não depender dele

**Data:** 2026-08-20
**Status:** aceito
**Decisor:** Yves
**Fecha o blocker:** BL-4 (`STATE.md`)
**Precedente:** o Niklas tomou a mesma decisão em 2026-07-29
([`niklas/docs/adr/0004`](https://github.com/yvesas/niklas))

## Contexto

O [ADR-0005](0005-caminho-hibrido-harness.md) deixou em aberto: o `yas-harness`
entra como **dependência npm** — ele já está empacotado — ou por **fork**? E o Mongo
continua, ou o Alfred vai para Postgres com pgvector, como o chassi?

Enquanto isso ficava indefinido, todo trabalho de infraestrutura vinha com uma
pergunta embutida: *"vale construir isto, ou o harness resolve depois?"*

**O Niklas já respondeu essa pergunta**, pelas mesmas razões, três semanas antes:

> *"**Copiar** contratos, padrões e trechos — nunca depender do harness como
> biblioteca. E copiar **desde o primeiro commit**: os conectores nascem no formato
> do contrato do harness, não são adaptados depois."*

Não faz sentido cada produto YAS descobrir isso do zero.

## Decisão

**Copiar a forma, não consumir o pacote.** O Alfred segue com base própria e
adota os **contratos** do harness onde eles se aplicam.

Três consequências práticas:

**1. Nada de dependência npm por enquanto.** Amarraria o ritmo do Alfred ao de um
projeto open source ainda instável — o harness ainda está fechando a Fase 7 e a
memória dele nunca foi exercitada de verdade. E obrigaria a publicar versão antes
da hora.

**2. O Mongo fica.** A migração para Postgres+pgvector só se justificaria para
consumir o harness como biblioteca, o que acabou de ser descartado. O Atlas tem busca
vetorial quando o second brain precisar. **Isto também fecha o C16 e o C17** como
"não vale a pena agora": migrar `Purchase.userId` para `ObjectId` era, em parte,
preparação para uma migração que não vai acontecer.

**3. Onde a IA mais funda vai entrar, existe um ponto de encaixe isolado.** O
`MessageProcessingService` já é esse ponto para modelos. Quando o second brain
chegar, ele nasce atrás de uma interface própria — mock hoje, implementação depois —
e não espalhado pelo `BotCore`.

O que **continua valendo** do ADR-0005: não construir aqui gateway de modelos genérico
nem triagem genérica. O que muda é o *como* — quando isso for necessário, copia-se a
forma do harness em vez de importá-lo.

## O que a forma do harness já nos deu

O contrato `ModuleDefinition` de `modules/` foi copiado do harness em 2026-08-14
(ADR-0004), antes desta decisão — e é exatamente o padrão que ela agora oficializa.

## Alternativas descartadas

**Dependência npm.** Acopla o roadmap do Alfred ao de um projeto em construção. E o
harness é Apache 2.0 enquanto o Alfred é proprietário — a assimetria de licença pede
cuidado que não vale a pena assumir agora.

**Fork.** Herda o histórico inteiro e a obrigação de acompanhar o upstream, para
usar uma fração. Pior dos dois mundos.

**Migrar para Postgres agora.** Trocar de banco sem um consumidor que exija isso é
custo puro. O ADR-0005 já dizia que empilhar troca de chassi com troca de banco
esconde qual dos dois quebrou.

## Consequências

**O que compra.** O BL-4 sai da frente: nenhuma decisão de infraestrutura do Alfred
fica mais esperando por ele. E o `C16`/`C17` deixam de ser dívida a pagar e viram
decisão registrada.

**O que custa.** Divergência entre as duas bases é esperada e aceita. O que **não**
pode divergir é a forma dos contratos — `ModuleDefinition` hoje, o de conector e o de
memória quando chegarem.

**Trecho copiado carrega a licença de origem.** O harness é Apache 2.0; o Alfred é
proprietário. Arquivo copiado preserva o cabeçalho de atribuição.

**Revisitar quando** o harness estabilizar e tiver versão publicada. Aí pode passar a
valer a pena consumi-lo de verdade — e este ADR é substituído, como o do Niklas
prevê para si.
