# `tasks` — o que fazer

Segundo módulo do Alfred, construído na Fase 1 do roadmap.

## O que ele sabe

Uma tarefa é uma coisa a fazer, com **prazo opcional**. Nasce pendente, é concluída
ou removida. `/tarefas` lista, `add` anota, `ok` conclui, `remover` apaga.

## Duas decisões que valem explicar

**É chaveada pelo `User._id`, não pelo canal.** O `Reminder` guarda
`(platform, externalId)` porque precisa saber *para onde* mandar o push — é a exceção
legada. A tarefa é da pessoa: ela anota no Telegram e conclui no web.

**Tarefa sem prazo vai para o fim da lista, e isso custou duas consultas.** O Mongo
ordena documento **sem** o campo *antes* dos que têm — ausente conta como null, e null
vem primeiro no crescente. Um `sort({ dueDate: 1 })` ingênuo poria justamente as
tarefas sem prazo no topo. Um teste pegou.

## O que ainda não existe

**A metade que importa: ser proativo.** Hoje o Alfred só diz o que vence se
perguntarem. `dueDate` e `TaskRepository.findDue` já existem pensando nisso — é a
Fase 2 do [roadmap](../../../../specs/project/ROADMAP.md).

E o caminho principal ainda é comando. *"lembra de renovar o seguro dia 10"* só vai
funcionar quando o roteador de intenção chegar (Fase 3). Por isso o parser de prazo
aceita só `DD/MM`: interpretar linguagem natural é trabalho da IA no fluxo de
conversa, não de um parser de comando — e atalho tem que ser previsível.

## Relação com `/lembretes`

`/lembretes` é do módulo fin e continua lá: ele é conta a pagar recorrente, com push
mensal. Uma tarefa é pontual. **Se os dois convergirem, a decisão vira ADR** — hoje
convivem de propósito.
