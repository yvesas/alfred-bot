// Contrato de um módulo do Alfred.
//
// O Alfred é um assistente pessoal com capacidades em módulos (fin, tarefas, projetos).
// Um módulo é uma CAPACIDADE DE NEGÓCIO: sabe o que é uma compra, uma tarefa, um projeto.
// O que roteia, conversa, chama modelo e entrega mensagem é o chassi — e o chassi não
// pode saber o que é "compra". Ver docs/adr/0004-alfred-modular.md.
//
// A forma deste contrato espelha de propósito o `ModuleDefinition` do `yas-harness`:
// quando o Alfred migrar para o chassi compartilhado, o registro daqui vira o registro
// de lá sem redesenho. `description` existe para o roteador — é o texto que um modelo
// barato lê para decidir qual módulo trata a mensagem.

import { MessageKey } from "../i18n";

export type ModuleId = "fin" | "tasks" | "projects";

export interface ModuleCommand {
  /** Nome sem a barra: "gastos" para `/gastos`. */
  name: string;
  /**
   * Chave de i18n com uma linha do que o comando faz. É o que o `/ajuda` mostra.
   *
   * **Chave, não texto.** O resumo é lido pelo usuário, e usuário tem idioma: um
   * literal em português apareceria cru dentro de uma ajuda em espanhol. O catálogo
   * é tipado, então chave nova exige pt, en e es — senão não compila.
   */
  summaryKey: MessageKey;
}

export interface ModuleDefinition {
  id: ModuleId;
  /**
   * Chave de i18n do nome que o usuário vê. Mesmo motivo do `summaryKey`.
   *
   * Sem emoji: o título também entra no meio de frases ("Projetos ainda não
   * disponível"), onde um emoji lido por leitor de tela vira ruído. A decoração é do
   * `icon`, que a ajuda usa e a frase ignora.
   */
  titleKey: MessageKey;
  /** Emoji do módulo na ajuda. Presentation-only — não é traduzido nem entra em frase. */
  icon: string;
  /**
   * O que este módulo trata, em linguagem natural.
   *
   * **Não é texto de usuário** — quem lê é o roteador, um modelo escolhendo qual
   * módulo trata a mensagem. Por isso fica em português direto no código, sem i18n:
   * traduzi-lo não ajudaria o modelo e criaria três textos para manter em sincronia.
   */
  description: string;
  /** Comandos que este módulo atende. Atalhos — a conversa é o caminho principal. */
  commands: ModuleCommand[];
  /**
   * Falso enquanto o módulo é só uma declaração de intenção.
   * Um comando de módulo não implementado responde "ainda não disponível" em vez de
   * cair no vazio — o `switch` do BotCore ignora silenciosamente o que não conhece,
   * e silêncio é a pior resposta possível.
   */
  implemented: boolean;
}
