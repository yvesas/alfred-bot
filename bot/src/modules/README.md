# `modules/` — as capacidades do Alfred

O Alfred é **um assistente pessoal com capacidades em módulos**, não um bot de finanças.
Esta pasta é onde as capacidades se declaram.

## A fronteira

**Um módulo sabe o que é uma compra, uma tarefa, um projeto. O chassi não.**

Teste, emprestado do `yas-harness`: se um trecho de código não serviria **igual** num
assistente que nunca ouviu falar de dinheiro, ele **não** é do módulo — é do chassi.

| É módulo | É chassi |
|---|---|
| `Purchase`, `Product`, `Reminder`, orçamento, categoria, NFC-e | rotear a mensagem, chamar o modelo, entregar a resposta |
| a regra de "cupom já registrado não duplica" | identidade do usuário, vínculo entre plataformas |
| o texto de "orçamento estourado" | rate limit, idioma, consentimento, plano |

## Estado hoje

| Módulo | Estado | Onde o código está |
|---|---|---|
| **fin** | implementado | espalhado em `services/`, `repositories/`, `models/` — ainda **não** mudou para cá |
| **tasks** | declarado | só `module.ts` |
| **projects** | declarado | só `module.ts` |

Um módulo declarado e não implementado responde *"ainda não disponível"* — o `switch` do
`BotCore` ignoraria o comando em silêncio, e silêncio é a pior resposta possível.

## Por que declarar antes de mover

A declaração já paga sozinha, sem nenhum arquivo mudar de lugar:

1. **O catálogo de comandos passou a ter uma fonte só.** `KNOWN_COMMANDS` sai do registro;
   antes era uma constante solta que o `TelegramAdapter` repetia à mão.
2. **A fronteira fica escrita e testada** (`tests/modules.test.ts`), não combinada de boca.
3. **O `description` de cada módulo é o que o roteador vai ler.** Quando o Alfred ganhar
   triagem em modelo barato — no chassi, não aqui — o catálogo já existe.

Mover a pasta é refactor grande e mecânico. Declarar é barato e reversível. Nesta ordem.

## O que muda quando o fin migrar

Vem para `fin/`: `PurchaseService`, `BudgetService`, `ProductService`, `ReportService`,
`ExportService`, `PlanService`, os repositórios e modelos correspondentes,
`utils/fiscalKey.ts` e o prompt de extração de compra.

**Não** vem: `MessageProcessingService`, os processadores de IA, os providers de OCR,
`AuthService`, `MergeService`, `RateLimiter`, `OutboundRegistry`, os adapters. Isso é
chassi — e o destino dele é o [`yas-harness`](../../../specs/project/PLANO-ESTRUTURACAO.md),
não esta pasta.

## O contrato espelha o do harness de propósito

`ModuleDefinition` tem a forma do `ModuleDefinition` do `yas-harness` — `id`, `title`,
`description`, e as ferramentas que expõe. Quando o Alfred passar a rodar sobre o chassi
compartilhado, este registro vira o registro de lá sem redesenho. Ao mexer neste contrato,
olhe o de lá antes de divergir.
