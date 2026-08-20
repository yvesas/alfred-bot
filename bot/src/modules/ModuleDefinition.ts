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

export type ModuleId = "fin" | "tasks" | "projects";

export interface ModuleCommand {
  /** Nome sem a barra: "gastos" para `/gastos`. */
  name: string;
  /** Uma linha, em português, do que o comando faz — vai para o `/ajuda` e para o roteador. */
  summary: string;
}

export interface ModuleDefinition {
  id: ModuleId;
  /** Nome que o usuário vê. */
  title: string;
  /** O que este módulo trata, em linguagem natural. É o que o roteador lê. */
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
