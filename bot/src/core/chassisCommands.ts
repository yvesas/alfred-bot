import {
  anonymous,
  registered,
  CommandDefinition,
  CommandContext,
  RegisteredCommandContext,
} from "./CommandContext";
import { langOf } from "./format";
import { isValidEmail } from "../utils/validation";
import { Language } from "../models/User";
import { t } from "../i18n";
import { logger } from "../infra/logger";
import { buildHelp } from "./help";

// Os comandos do chassi: conta, identidade e preferências.
//
// Não pertencem a módulo nenhum — existiriam iguais num assistente que nunca ouviu
// falar de dinheiro, que é o teste de fronteira do ADR-0004. Por isso ficam em
// `core/`, ao lado do contrato, e não em `modules/`.

// ---------- Onboarding e vínculo (rodam ANTES do cadastro) ----------

// `/start`. Também é a porta do deep-link de vínculo: o Telegram entrega
// `t.me/bot?start=<token>` como "/start <token>".
const start = anonymous("start", async ({ msg, reply, platform, externalId, lang, deps }) => {
  const { user, question } = await deps.userService.ensureUser(
    platform,
    externalId,
    msg.profile,
    lang,
  );
  const userLang = langOf(user);
  const name = user.name ? `, ${user.name}` : "";

  // No WhatsApp o número já é verificado → registra/auto-vincula (Fase 6).
  await deps.accountLinking.autoLinkWhatsappPhone(platform, externalId);

  const startToken = msg.command?.args?.[0] ?? "";
  if (startToken) {
    const linked = await deps.accountLinking.tryLink(platform, externalId, startToken);
    await reply.text(t(userLang, linked ? "link_success" : "link_invalid"));
    return;
  }

  if (user.status === "complete") {
    await reply.text(t(userLang, "greeting_returning", { name }));
    return;
  }

  await reply.text(t(userLang, "greeting_new", { name, question }), { requestPhone: true });
});

// `/vincular <token>` (WhatsApp/Web/Telegram). Não exige cadastro: garante a
// identidade e funde — exigir cadastro antes tornaria o vínculo impossível.
const vincular = anonymous(
  "vincular",
  async ({ msg, reply, platform, externalId, lang, args, deps }) => {
    const token = args[0] ?? "";
    await deps.userService.ensureUser(platform, externalId, msg.profile, lang);
    const linked = token ? await deps.accountLinking.tryLink(platform, externalId, token) : false;
    await reply.text(t(lang, linked ? "link_success" : "link_invalid"));
  },
);

// ---------- Verificação de e-mail no chat (Magic Auth — Fase 6, parte 4) ----------

const email = registered("email", async ({ reply, platform, externalId, lang, args, deps }) => {
  if (!deps.authService.canVerifyEmail()) {
    await reply.text(t(lang, "verification_unavailable"));
    return;
  }
  const address = (args[0] ?? "").trim().toLowerCase();
  if (!address) {
    await reply.text(t(lang, "email_usage"));
    return;
  }
  if (!isValidEmail(address)) {
    await reply.text(t(lang, "email_invalid_address"));
    return;
  }

  try {
    await deps.authService.sendEmailCode(address);
    await deps.pendingEmails.set(platform, externalId, address);
    await reply.text(t(lang, "email_sent", { email: address }));
  } catch (error) {
    logger.error({ err: error }, "Falha ao enviar código de verificação de e-mail");
    await reply.text(t(lang, "verification_unavailable"));
  }
});

const codigo = registered("codigo", async ({ reply, platform, externalId, lang, args, deps }) => {
  const address = await deps.pendingEmails.get(platform, externalId);
  if (!address) {
    await reply.text(t(lang, "code_no_pending"));
    return;
  }
  const code = (args[0] ?? "").trim();
  if (!code) {
    await reply.text(t(lang, "code_usage"));
    return;
  }

  const ok = await deps.authService.verifyEmailCode(address, code);
  if (!ok) {
    await reply.text(t(lang, "code_invalid")); // mantém a pendente para nova tentativa
    return;
  }

  await deps.pendingEmails.clear(platform, externalId);
  // E-mail verificado → grava e auto-vincula com a conta web do mesmo e-mail.
  await deps.mergeService.linkVerifiedEmail(platform, externalId, address);
  await reply.text(t(lang, "email_verified"));
});

// ---------- Perfil, idioma e modelo ----------

// `/nome` — direito de correção (LGPD).
const nome = registered("nome", async ({ reply, platform, externalId, lang, args, deps }) => {
  const trimmed = args.join(" ").trim();
  if (trimmed.length < 2) {
    await reply.text(t(lang, "name_usage"));
    return;
  }
  await deps.userService.setName(platform, externalId, trimmed);
  await reply.text(t(lang, "name_updated", { name: trimmed }));
});

const idioma = registered("idioma", async ({ reply, platform, externalId, lang, args, deps }) => {
  const chosen = (args[0] ?? "").toLowerCase();
  if (chosen !== "pt" && chosen !== "en" && chosen !== "es") {
    await reply.text(t(lang, "language_usage"));
    return;
  }
  await deps.userService.setLanguage(platform, externalId, chosen as Language);
  // Confirma já no idioma novo — é a primeira prova de que a troca funcionou.
  await reply.text(t(chosen as Language, "language_set"));
});

const ia = registered("ia", async ({ reply, platform, externalId, lang, args, deps }) => {
  const model = args[0];
  if (!model) {
    await reply.text(t(lang, "ia_usage"));
    return;
  }
  const response = await deps.messageProcessingService.setUserModel(
    platform,
    externalId,
    model.toLowerCase(),
    lang,
  );
  await reply.text(response);
});

// ---------- Exclusão de conta (LGPD) ----------

const excluirConta = registered("excluir_conta", async ({ reply, lang, user, args, deps }) => {
  // Exige a palavra "confirmar": apagar conta não pode acontecer por engano de digitação.
  if ((args[0] ?? "").toLowerCase() !== "confirmar") {
    await reply.text(t(lang, "account_delete_warn"));
    return;
  }
  await deps.accountService.deleteAccount(user);
  await reply.text(t(lang, "account_deleted"));
});

// ---------- Ajuda ----------

// Anônimo de propósito: quem ainda não terminou o cadastro é justamente quem mais
// precisa saber o que dá para fazer aqui.
const ajuda = anonymous("ajuda", async ({ reply, lang }) => {
  await reply.text(buildHelp(lang));
});

export const CHASSIS_COMMAND_HANDLERS: CommandDefinition[] = [
  start,
  ajuda,
  vincular,
  email,
  codigo,
  nome,
  idioma,
  ia,
  excluirConta,
];

export type { CommandContext, RegisteredCommandContext };
