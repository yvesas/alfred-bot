import { IncomingMessage, Platform } from "./IncomingMessage";
import { Replier } from "./Replier";
import { IUser, Language } from "../models/User";
import { UserService } from "../services/UserService";
import { PurchaseService } from "../services/PurchaseService";
import { ProductService } from "../services/ProductService";
import { ReminderService } from "../services/ReminderService";
import { ExportService } from "../services/ExportService";
import { AccountService } from "../services/AccountService";
import { AuthService } from "../services/AuthService";
import { MergeService } from "../services/MergeService";
import { MessageProcessingService } from "../services/MessageProcessingService";
import { AccountLinking } from "./AccountLinking";
import { PendingEmailStore } from "./PendingEmailStore";
import { PurchaseFlow } from "../modules/fin/PurchaseFlow";

// Contrato de um comando.
//
// Antes, os 19 comandos eram um `switch` de 19 casos dentro do `BotCore`, cada um
// chamando um método privado do mesmo arquivo de 1042 linhas (C4). Aqui, um comando é
// um objeto: sabe seu nome, se exige cadastro, e como se resolver. O `BotCore` volta a
// ser o que deveria — normalizar, resolver o usuário e despachar.
//
// Comando de módulo mora no módulo (`modules/fin/commands.ts`), como manda o ADR-0004.

/** Serviços que um comando pode alcançar. O BotCore monta uma vez e repassa. */
export interface CommandDeps {
  userService: UserService;
  purchaseService: PurchaseService;
  productService: ProductService;
  reminderService: ReminderService;
  exportService: ExportService;
  accountService: AccountService;
  authService: AuthService;
  mergeService: MergeService;
  messageProcessingService: MessageProcessingService;
  accountLinking: AccountLinking;
  pendingEmails: PendingEmailStore;
  purchaseFlow: PurchaseFlow;
}

/** O que todo comando recebe. */
export interface CommandContext {
  msg: IncomingMessage;
  reply: Replier;
  platform: Platform;
  externalId: string;
  args: string[];
  lang: Language;
  deps: CommandDeps;
}

/**
 * Comando que exige cadastro completo — a maioria. O `BotCore` só chama depois de
 * resolver o usuário, então `user` e `userId` são garantidos aqui e o handler não
 * precisa checar.
 */
export interface RegisteredCommandContext extends CommandContext {
  user: IUser;
  /** `String(user._id)` — a identidade canônica (Fase 6), não o id da plataforma. */
  userId: string;
}

export interface RegisteredCommand {
  name: string;
  requiresRegistration: true;
  handle(ctx: RegisteredCommandContext): Promise<void>;
}

export interface AnonymousCommand {
  name: string;
  requiresRegistration: false;
  handle(ctx: CommandContext): Promise<void>;
}

export type CommandDefinition = RegisteredCommand | AnonymousCommand;

/**
 * Açúcar para o comando que roda ANTES do cadastro. São dois — `/start` e
 * `/vincular` — e é de propósito: quem chega por deep-link ainda não tem conta, e
 * exigir cadastro antes de vincular tornaria o vínculo impossível.
 */
export function anonymous(
  name: string,
  handle: (ctx: CommandContext) => Promise<void>,
): AnonymousCommand {
  return { name, requiresRegistration: false, handle };
}

/** Açúcar para declarar um comando que exige cadastro, sem repetir a flag. */
export function registered(
  name: string,
  handle: (ctx: RegisteredCommandContext) => Promise<void>,
): RegisteredCommand {
  return { name, requiresRegistration: true, handle };
}
