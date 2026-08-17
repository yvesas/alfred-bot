# Alfred — visão do projeto

> **"Alfred" é codinome interno.** O nome comercial ainda não existe: o
> [HeyAlfred](https://heyalfredapp.com) já ocupa o nome nesse exato espaço.

## O que é

Um **assistente pessoal que vive no chat**, com capacidades em módulos.

A pessoa conversa — ou manda uma foto, ou um áudio — e o Alfred entende, guarda e
devolve. Hoje sobre **finanças**; no plano, também **tarefas** e **projetos**,
sob a mesma conversa e a mesma conta.

Está no Telegram, no WhatsApp e num chat web, com a **mesma conta** nos três.

## Por que existe

A logística da vida adulta é fragmentada: gasto numa planilha, tarefa num app,
projeto noutro, e nada conversa. Cada ferramenta exige que você abra a ferramenta.

O chat inverte isso — o registro acontece onde a pessoa já está, em uma frase,
sem formulário. E o valor não está em cada capacidade isolada: está em **uma
cabeça só olhando tudo**. "Quanto este projeto já me custou" só existe se
finanças e projetos forem módulos do mesmo assistente.

A aposta técnica é que **IA multimodal barata** torna viável o que antes exigia
OCR rígido e parser frágil: uma foto de cupom vira dados estruturados numa
chamada só.

## Objetivos

1. **Registrar tem que custar uma frase.** Se exigir mais que isso, falhou.
2. **Um usuário, várias plataformas, vários módulos.** Registrar no Telegram e
   consultar no painel web é o mesmo dado, sem configuração.
3. **Entender, não obedecer.** Comando é atalho; o caminho principal é conversa.
4. **Ser proativo, não só responsivo.** É o que separa um assistente de um
   formulário com IA — e é o que o Alfred ainda **não** tem.
5. **Virar produto pago.** Free generoso, Pro para quem usa de verdade.
6. **Privacidade como requisito, não como página.** LGPD desde o schema.

## Os módulos

| Módulo | Estado | O que trata |
|---|---|---|
| **fin** | implementado | gastos, cupons fiscais, orçamento, contas a pagar, despensa |
| **tarefas** | declarado | o que fazer, prazo, o que vence hoje |
| **projetos** | declarado | trabalhos que agrupam tarefas — e custo |

Declarados **não** significa em construção. Ver
[ADR-0004](../../docs/adr/0004-alfred-modular.md) e a regra de contenção abaixo.

## Referências que orientam o produto

- **[Caddy](https://caddy.app)** — o espelho do que queremos ser. Vive nas
  mensagens, aceita voz, entra em grupo, e sobretudo **é proativo**: *"keeps an
  eye on your calendars, chats, and tasks, then tells you what needs your
  attention right now."* Personaliza a ponto de dizer *"no two Caddys are alike"*.
- **[HeyAlfred](https://heyalfredapp.com)** — o concorrente direto, já no ar:
  finanças, calendário, tarefas, projetos, atas e busca de documentos por
  £9,99/mês. Prova que o mercado existe; define a régua.
- **O que nos deixa espaço:** os dois são individuais e em inglês. Português,
  realidade brasileira (Pix, boleto, NF, NFC-e), LGPD, e uma camada Business com
  equipe — que nenhum dos dois cobre.

## Princípios

- **Módulo sabe domínio; chassi não sabe.** Se o código não serviria igual num
  assistente que nunca ouviu falar de dinheiro, não é módulo. Ver
  [ADR-0004](../../docs/adr/0004-alfred-modular.md).
- **Reusar, não reconstruir — o encanamento.** O chassi de agente é o
  `yas-harness`, compartilhado entre os produtos YAS. Ver
  [ADR-0005](../../docs/adr/0005-caminho-hibrido-harness.md).
- **A inteligência é nossa.** RAG, second brain pessoal, memória entre módulos e
  personalização são o diferencial do Alfred e não vão para o chassi — nem na
  migração. O usuário escolhe o modelo; o que o Alfred sabe sobre ele é do Alfred.
  Ver [ADR-0006](../../docs/adr/0006-inteligencia-e-second-brain-sao-do-alfred.md).
- **A regra de conversa mora num lugar só.** Toda plataforma nova é um adapter,
  nunca uma cópia da lógica. Ver [ADR-0001](../../docs/adr/0001-botcore-e-adapters.md).
- **Fornecedor externo fica atrás de uma interface**, com o domínio ignorando o
  formato dele. Vale para OCR, IA e mensageria.
- **Payload despadronizado é normalizado na borda**, numa camada só
  (`infra/converters/`). O resto do código vê o tipo do domínio.
- **A identidade canônica é o `User._id`.** Id de plataforma é só uma chave de
  entrada. Ver [ADR-0002](../../docs/adr/0002-identidade-canonica.md).
- **Falhar cedo no startup, degradar graciosamente em runtime.** Falta variável
  obrigatória: aborta. Falha um canal ou um modelo: os outros seguem.
- **Teste anda na mesma task do código**, não numa fase de testes no fim.
- **Custo de IA é decisão de produto.** Modelo, provider e modo de OCR são
  configuráveis porque a conta importa.

## Stack em uma linha

TypeScript + Node 20 · Telegraf · Baileys · WebSocket · Inversify · Mongoose /
MongoDB · Gemini (Vertex AI) e GPT · WorkOS · React + Vite + Tailwind ·
Jest e Vitest · Docker. Detalhe em [`specs/codebase/STACK.md`](../codebase/STACK.md).

## Escopo — o que o Alfred **não** é

- Não é agregador bancário. Não conecta em Open Finance nem lê extrato — a mesma
  decisão de privacidade que o HeyAlfred vende como diferencial.
- Não é contabilidade nem emissor fiscal. Lê a NFC-e para registrar a compra, não
  para apurar imposto.
- Não é gerenciador de projeto de time. Projetos aqui são os **seus**, não um
  Jira — equipe é a camada Business, fase posterior.
- Não é multiusuário/família neste momento. Uma conta = uma pessoa.
- Não é conselheiro de investimento.

## A regra de contenção

Do perfil de execução registrado na visão do portfólio: **uma peça por vez até o
lançamento.** Escopo maior não significa frente maior.

Na prática, hoje: **`tasks` e `projects` estão declarados, não em construção.**
Construir tarefas antes de o módulo fin voltar a funcionar seria trocar
profundidade por largura no pior momento possível.

## Público

Pessoa física brasileira sobrecarregada com a logística da vida — quem quer saber
para onde vai o dinheiro e o que precisa fazer, sem manter planilha nem abrir três
apps. Interface em pt/en/es; o domínio fiscal (NFC-e, CNPJ, chave de acesso) é
brasileiro.

## Estado

Funcional ponta a ponta nas três plataformas, com painel web, login, planos e
LGPD fases 1 e 2. **Sem cobrança e sem deploy** — nunca foi para produção.
Ver [`STATE.md`](STATE.md) e [`ROADMAP.md`](ROADMAP.md).
