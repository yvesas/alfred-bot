# `proactive` — o Alfred falando sem ser perguntado

Fase 2 do roadmap, e o diferencial do produto. É o que o Caddy vende:
*"tells you what needs your attention right now"* — e o que separa um assistente de um
formulário com IA.

## A fronteira, que aqui é o ponto todo

**O mecanismo é chassi; a regra é do módulo** (ADR-0004).

| Mora aqui | Mora no módulo |
|---|---|
| quando acordar, quanto pode falar, quando calar | *"esta tarefa vence hoje"* |
| deduplicar, escolher o melhor candidato, entregar | *"este orçamento estourou"* |
| medir se serviu | — |

Uma regra **não sabe** que existe teto de frequência. O motor **não sabe** o que é
orçamento. Regra nova entra em `modules/<módulo>/rules.ts` e se registra em
`rules.ts` — nada mais muda.

## A parte difícil não é falar. É calar.

Achar o que dizer é trivial: as regras fazem isso. O que custou desenho foi o resto,
e cada item existe porque a alternativa é ser silenciado:

- **Um aviso por ciclo, no máximo.** Três de uma vez é o caminho mais curto para
  alguém desativar.
- **Teto diário** (`PROACTIVE_DAILY_CAP`, default **2**). Baixo de propósito: é mais
  fácil afrouxar depois do que recuperar quem já silenciou.
- **Horário** (`PROACTIVE_START_HOUR`/`END_HOUR`). Ninguém quer saber de orçamento às
  três da manhã.
- **Nunca repetir.** A chave do candidato é a identidade do aviso, e a garantia é um
  índice único — não uma leitura anterior, porque entre ler e escrever cabe outro
  ciclo.
- **Silêncio é resposta válida.** Ciclo sem nada a dizer é o caso comum. Sair calado
  dele é a funcionalidade, não a ausência dela.

**Vem desligado** (`PROACTIVE_ENABLED=false`). Ligar é decisão consciente: mexe com a
paciência de quem recebe.

## Como se sabe se está ajudando

`ProactiveLog` guarda o que foi dito e se a pessoa **escreveu logo depois**
(`respondedAt`, janela de 30 min). É a única medida honesta de *"isto ajuda ou
incomoda"* — sem ela, ajustaríamos as regras no escuro.

Três métricas Prometheus: `proactive_sent_total{rule}`,
`proactive_suppressed_total{reason}` e `proactive_replied_total`. **Contar o que não
foi dito importa tanto quanto o que foi** — é assim que se descobre que o teto está
apertado demais ou o horário errado.

## O que ainda não existe

- **Preferência por usuário.** Hoje o horário é global e do fuso do servidor. O que
  realmente resolve é fuso por usuário — e o Alfred nem pergunta em que fuso a pessoa
  está.
- **Julgamento de IA.** As regras são explícitas de propósito: regra é auditável e
  barata. Modelo entra quando houver sinal, na métrica acima, de que a regra erra.
- **Desligar pelo chat.** Só por variável de ambiente, o que serve para o operador e
  não para o usuário.
