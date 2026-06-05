import { Language } from "../models/User";

// Catálogo de mensagens fixas do bot, por idioma. O tipo Record<Language, Record<Key,...>>
// força o TypeScript a exigir TODAS as chaves em pt/en/es (rede de segurança contra faltas).
export type MessageKey =
  // genéricas / fluxo
  | "rate_limited"
  | "greeting_new"
  | "greeting_returning"
  | "finish_registration"
  | "photo_error"
  | "not_understood"
  // confirmação / compra
  | "purchase_confirm"
  | "purchase_cancelled"
  | "purchase_saved"
  | "purchase_save_error"
  // editar / excluir
  | "delete_invalid"
  | "delete_done"
  | "edit_usage"
  | "edit_invalid_value"
  | "edit_invalid_field"
  | "edit_failed"
  | "edit_done"
  // idioma
  | "language_set"
  | "language_usage"
  // categorias
  | "categories_add_usage"
  | "categories_added"
  | "categories_remove_usage"
  | "categories_removed"
  | "categories_default_label"
  | "categories_default_hint"
  | "categories_list"
  // orçamento
  | "budget_remove_usage"
  | "budget_removed"
  | "budget_none_label"
  | "budget_set_usage"
  | "budget_set"
  | "budget_empty"
  | "budget_list_header"
  | "budget_list_footer"
  | "budget_alert_over"
  | "budget_alert_warn"
  // lembretes
  | "reminder_add_usage"
  | "reminder_created"
  | "reminder_remove_invalid"
  | "reminder_removed"
  | "reminder_empty"
  | "reminder_list_header"
  | "reminder_list_footer"
  | "reminder_list_item"
  | "reminder_push"
  // vínculo (deep-link)
  | "link_success"
  | "link_invalid"
  // IA
  | "ia_usage"
  | "ia_invalid"
  | "ia_set"
  | "ai_not_understood"
  | "ai_error"
  // compras (lista)
  | "purchases_empty"
  | "purchases_header"
  | "purchases_item"
  | "purchases_page_info"
  | "purchases_more"
  | "purchases_fix_hint"
  // gastos
  | "spending_empty"
  | "spending_report"
  | "period_current_month"
  | "period_last_month"
  | "period_all"
  | "breakdown_category"
  | "breakdown_store"
  // onboarding (UserService)
  | "onboarding_ask_name"
  | "onboarding_ask_email"
  | "onboarding_name_too_short"
  | "onboarding_name_saved"
  | "onboarding_email_invalid"
  | "onboarding_complete"
  | "phone_updated"
  | "phone_saved";

const MESSAGES: Record<Language, Record<MessageKey, string>> = {
  pt: {
    rate_limited: "⏳ Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente.",
    greeting_new: "👋 Olá{name}! Eu registro suas compras e gastos. {question}",
    greeting_returning:
      'Olá de novo{name}! 👋 Envie uma compra (ex.: "agua 7"), um cupom fiscal, ou use /gastos.',
    finish_registration: "Antes disso, vamos concluir seu cadastro. {question}",
    photo_error: "Houve um erro ao processar a imagem. Tente novamente.",
    not_understood: "❌ Não consegui identificar os dados. Pode repetir com mais detalhes?",
    purchase_confirm:
      'Confirmar esta compra?\n\n🛒 {description} — R$ {total}\n\nResponda "sim" para salvar ou "não" para cancelar.',
    purchase_cancelled: "Ok, cancelei essa compra. 👍",
    purchase_saved: "🛒 Compra registrada: {description} - Total de R$ {total}",
    purchase_save_error:
      "❌ Não consegui registrar essa compra. Verifique os valores e tente novamente.",
    delete_invalid: 'Número inválido. Use /compras para ver a lista (ex.: "/excluir 2").',
    delete_done: "🗑️ Excluído: {description} — R$ {total}",
    edit_usage: 'Uso: /editar <nº> <total|descrição> <valor>. Ex.: "/editar 2 total 10".',
    edit_invalid_value: "Valor inválido. Ex.: /editar 2 total 10",
    edit_invalid_field: 'Campo inválido. Use "total" ou "descrição".',
    edit_failed: "Não consegui editar essa compra.",
    edit_done: "✏️ Atualizado: {description} — R$ {total}",
    language_set: "✅ Idioma definido para Português.",
    language_usage: "Use: /idioma pt | en | es",
    categories_add_usage: 'Uso: /categorias add <nome>. Ex.: "/categorias add Mercado".',
    categories_added: "✅ Categoria adicionada.\n📂 Suas categorias: {list}",
    categories_remove_usage: "Uso: /categorias remover <nome>.",
    categories_removed: "🗑️ Categoria removida.\n📂 Suas categorias: {list}",
    categories_default_label: "(usando as padrão)",
    categories_default_hint:
      'Você usa as categorias padrão. Crie as suas com "/categorias add Mercado".',
    categories_list:
      '📂 Suas categorias: {list}\n\n"/categorias add <nome>" ou "/categorias remover <nome>".',
    budget_remove_usage: "Uso: /orcamento remover <categoria>.",
    budget_removed: "🗑️ Orçamento removido.\n💰 Seus orçamentos:\n{list}",
    budget_none_label: "(nenhum)",
    budget_set_usage: 'Uso: /orcamento <categoria> <valor>. Ex.: "/orcamento Alimentação 500".',
    budget_set:
      "✅ Orçamento de {category} definido em R$ {limit} por mês. Eu te aviso ao chegar perto.",
    budget_empty:
      'Você ainda não tem orçamentos. Crie com "/orcamento Alimentação 500" (limite mensal por categoria).',
    budget_list_header: "💰 Orçamentos deste mês:",
    budget_list_footer:
      '"/orcamento <categoria> <valor>" para alterar, "/orcamento remover <categoria>".',
    budget_alert_over: "🚨 Orçamento de {category} estourado: R$ {spent} de R$ {limit} ({pct}%).",
    budget_alert_warn:
      "🔔 Você já usou {pct}% do orçamento de {category}: R$ {spent} de R$ {limit}.",
    reminder_add_usage:
      'Uso: /lembretes add <dia 1-28> <descrição>. Ex.: "/lembretes add 10 Conta de luz".',
    reminder_created: '⏰ Lembrete criado: "{description}" — todo dia {day}. Eu te aviso por aqui.',
    reminder_remove_invalid: "Número inválido. Use /lembretes para ver a lista.",
    reminder_removed: '🗑️ Lembrete removido: "{description}".',
    reminder_empty:
      'Você não tem lembretes. Crie com "/lembretes add 10 Conta de luz" (dia do mês + descrição).',
    reminder_list_header: "⏰ Seus lembretes:",
    reminder_list_footer: '"/lembretes add <dia> <descrição>" ou "/lembretes remover <nº>".',
    reminder_list_item: "{index}. dia {day} — {description}",
    reminder_push: "🔔 Lembrete: {description} (vence dia {day}).",
    link_success: "✅ Conta vinculada! Agora seus gastos somam numa conta só.",
    link_invalid: "❌ Código de vínculo inválido ou expirado. Gere um novo no app web.",
    ia_usage: "Use: /ia gpt ou /ia gemini",
    ia_invalid: 'Modelo inválido! Escolha entre "gpt" ou "gemini".',
    ia_set: "🤖 Modelo atualizado para {model}!",
    ai_not_understood: "🤖 Não entendi. Pode reformular?",
    ai_error: "🤖 Erro ao processar a mensagem.",
    purchases_empty: "Você ainda não tem compras registradas.",
    purchases_header: "📋 Suas compras:",
    purchases_item: "{index}. {description}: R$ {total} em {date}",
    purchases_page_info: "📄 Página {current}/{pages} — {total} compra(s) no total.",
    purchases_more: 'Ver mais: "/compras {next}".',
    purchases_fix_hint: 'Para corrigir: "/editar 2 total 10" ou "/excluir 2".',
    spending_empty: "Você não tem gastos registrados {period}.",
    spending_report: "📊 Gastos {period}: R$ {total} em {count} compra(s).",
    period_current_month: "deste mês",
    period_last_month: "do mês passado",
    period_all: "no total",
    breakdown_category: "Por categoria",
    breakdown_store: "Por loja",
    onboarding_ask_name: "Para começar, como você se chama? 🙂",
    onboarding_ask_email:
      "Me informe seu e-mail 📧 (ou envie /pular). Se quiser, toque no botão abaixo para compartilhar seu telefone.",
    onboarding_name_too_short: "Por favor, me diga seu nome. 🙂",
    onboarding_name_saved: "Prazer, {name}! {askEmail}",
    onboarding_email_invalid:
      "Hmm, esse e-mail não parece válido. Pode digitar novamente? (ou /pular)",
    onboarding_complete:
      '✅ Cadastro concluído! Agora é só me enviar uma compra (ex.: "agua 7") ou um cupom fiscal. Use /gastos para ver seus gastos.',
    phone_updated: "📱 Telefone atualizado com sucesso!",
    phone_saved: "📱 Telefone salvo! {askEmail}",
  },
  en: {
    rate_limited: "⏳ Too many messages in a short time. Please wait a moment and try again.",
    greeting_new: "👋 Hi{name}! I keep track of your purchases and spending. {question}",
    greeting_returning:
      'Hello again{name}! 👋 Send a purchase (e.g., "water 7"), a receipt, or use /gastos.',
    finish_registration: "First, let's finish your sign-up. {question}",
    photo_error: "Something went wrong processing the image. Please try again.",
    not_understood: "❌ I couldn't identify the data. Could you repeat with more detail?",
    purchase_confirm:
      'Confirm this purchase?\n\n🛒 {description} — $ {total}\n\nReply "sim" to save or "não" to cancel.',
    purchase_cancelled: "Okay, I cancelled that purchase. 👍",
    purchase_saved: "🛒 Purchase saved: {description} - Total $ {total}",
    purchase_save_error: "❌ I couldn't save that purchase. Check the values and try again.",
    delete_invalid: 'Invalid number. Use /compras to see the list (e.g., "/excluir 2").',
    delete_done: "🗑️ Deleted: {description} — $ {total}",
    edit_usage: 'Usage: /editar <no.> <total|description> <value>. E.g., "/editar 2 total 10".',
    edit_invalid_value: "Invalid value. E.g., /editar 2 total 10",
    edit_invalid_field: 'Invalid field. Use "total" or "descrição".',
    edit_failed: "I couldn't edit that purchase.",
    edit_done: "✏️ Updated: {description} — $ {total}",
    language_set: "✅ Language set to English.",
    language_usage: "Use: /idioma pt | en | es",
    categories_add_usage: 'Usage: /categorias add <name>. E.g., "/categorias add Market".',
    categories_added: "✅ Category added.\n📂 Your categories: {list}",
    categories_remove_usage: "Usage: /categorias remover <name>.",
    categories_removed: "🗑️ Category removed.\n📂 Your categories: {list}",
    categories_default_label: "(using defaults)",
    categories_default_hint:
      'You are using the default categories. Create your own with "/categorias add Market".',
    categories_list:
      '📂 Your categories: {list}\n\n"/categorias add <name>" or "/categorias remover <name>".',
    budget_remove_usage: "Usage: /orcamento remover <category>.",
    budget_removed: "🗑️ Budget removed.\n💰 Your budgets:\n{list}",
    budget_none_label: "(none)",
    budget_set_usage: 'Usage: /orcamento <category> <value>. E.g., "/orcamento Food 500".',
    budget_set:
      "✅ Budget for {category} set to $ {limit} per month. I'll warn you as you get close.",
    budget_empty:
      'You don\'t have any budgets yet. Create one with "/orcamento Food 500" (monthly limit per category).',
    budget_list_header: "💰 This month's budgets:",
    budget_list_footer:
      '"/orcamento <category> <value>" to change, "/orcamento remover <category>".',
    budget_alert_over: "🚨 Budget for {category} exceeded: $ {spent} of $ {limit} ({pct}%).",
    budget_alert_warn:
      "🔔 You've already used {pct}% of the {category} budget: $ {spent} of $ {limit}.",
    reminder_add_usage:
      'Usage: /lembretes add <day 1-28> <description>. E.g., "/lembretes add 10 Power bill".',
    reminder_created:
      '⏰ Reminder created: "{description}" — every {day}th. I\'ll remind you here.',
    reminder_remove_invalid: "Invalid number. Use /lembretes to see the list.",
    reminder_removed: '🗑️ Reminder removed: "{description}".',
    reminder_empty:
      'You have no reminders. Create one with "/lembretes add 10 Power bill" (day of month + description).',
    reminder_list_header: "⏰ Your reminders:",
    reminder_list_footer: '"/lembretes add <day> <description>" or "/lembretes remover <no.>".',
    reminder_list_item: "{index}. day {day} — {description}",
    reminder_push: "🔔 Reminder: {description} (due on the {day}th).",
    link_success: "✅ Account linked! Your spending now adds up in a single account.",
    link_invalid: "❌ Invalid or expired link code. Generate a new one in the web app.",
    ia_usage: "Use: /ia gpt or /ia gemini",
    ia_invalid: 'Invalid model! Choose between "gpt" or "gemini".',
    ia_set: "🤖 Model updated to {model}!",
    ai_not_understood: "🤖 I didn't get it. Could you rephrase?",
    ai_error: "🤖 Error processing the message.",
    purchases_empty: "You don't have any purchases yet.",
    purchases_header: "📋 Your purchases:",
    purchases_item: "{index}. {description}: $ {total} on {date}",
    purchases_page_info: "📄 Page {current}/{pages} — {total} purchase(s) total.",
    purchases_more: 'See more: "/compras {next}".',
    purchases_fix_hint: 'To fix: "/editar 2 total 10" or "/excluir 2".',
    spending_empty: "You have no spending recorded {period}.",
    spending_report: "📊 Spending {period}: $ {total} across {count} purchase(s).",
    period_current_month: "this month",
    period_last_month: "last month",
    period_all: "in total",
    breakdown_category: "By category",
    breakdown_store: "By store",
    onboarding_ask_name: "To start, what's your name? 🙂",
    onboarding_ask_email:
      "Please share your email 📧 (or send /pular). If you like, tap the button below to share your phone.",
    onboarding_name_too_short: "Please tell me your name. 🙂",
    onboarding_name_saved: "Nice to meet you, {name}! {askEmail}",
    onboarding_email_invalid:
      "Hmm, that email doesn't look valid. Could you type it again? (or /pular)",
    onboarding_complete:
      '✅ Sign-up complete! Now just send me a purchase (e.g., "water 7") or a receipt. Use /gastos to see your spending.',
    phone_updated: "📱 Phone updated successfully!",
    phone_saved: "📱 Phone saved! {askEmail}",
  },
  es: {
    rate_limited: "⏳ Demasiados mensajes en poco tiempo. Espera un momento e inténtalo de nuevo.",
    greeting_new: "👋 ¡Hola{name}! Registro tus compras y gastos. {question}",
    greeting_returning:
      '¡Hola de nuevo{name}! 👋 Envía una compra (ej.: "agua 7"), un recibo, o usa /gastos.',
    finish_registration: "Antes, terminemos tu registro. {question}",
    photo_error: "Hubo un error al procesar la imagen. Inténtalo de nuevo.",
    not_understood: "❌ No pude identificar los datos. ¿Puedes repetir con más detalle?",
    purchase_confirm:
      '¿Confirmar esta compra?\n\n🛒 {description} — $ {total}\n\nResponde "sim" para guardar o "não" para cancelar.',
    purchase_cancelled: "Vale, cancelé esa compra. 👍",
    purchase_saved: "🛒 Compra registrada: {description} - Total $ {total}",
    purchase_save_error:
      "❌ No pude registrar esa compra. Revisa los valores e inténtalo de nuevo.",
    delete_invalid: 'Número inválido. Usa /compras para ver la lista (ej.: "/excluir 2").',
    delete_done: "🗑️ Eliminado: {description} — $ {total}",
    edit_usage: 'Uso: /editar <n.º> <total|descripción> <valor>. Ej.: "/editar 2 total 10".',
    edit_invalid_value: "Valor inválido. Ej.: /editar 2 total 10",
    edit_invalid_field: 'Campo inválido. Usa "total" o "descrição".',
    edit_failed: "No pude editar esa compra.",
    edit_done: "✏️ Actualizado: {description} — $ {total}",
    language_set: "✅ Idioma configurado a Español.",
    language_usage: "Use: /idioma pt | en | es",
    categories_add_usage: 'Uso: /categorias add <nombre>. Ej.: "/categorias add Mercado".',
    categories_added: "✅ Categoría añadida.\n📂 Tus categorías: {list}",
    categories_remove_usage: "Uso: /categorias remover <nombre>.",
    categories_removed: "🗑️ Categoría eliminada.\n📂 Tus categorías: {list}",
    categories_default_label: "(usando las predeterminadas)",
    categories_default_hint:
      'Estás usando las categorías predeterminadas. Crea las tuyas con "/categorias add Mercado".',
    categories_list:
      '📂 Tus categorías: {list}\n\n"/categorias add <nombre>" o "/categorias remover <nombre>".',
    budget_remove_usage: "Uso: /orcamento remover <categoría>.",
    budget_removed: "🗑️ Presupuesto eliminado.\n💰 Tus presupuestos:\n{list}",
    budget_none_label: "(ninguno)",
    budget_set_usage: 'Uso: /orcamento <categoría> <valor>. Ej.: "/orcamento Comida 500".',
    budget_set: "✅ Presupuesto de {category} fijado en $ {limit} al mes. Te aviso al acercarte.",
    budget_empty:
      'Aún no tienes presupuestos. Crea uno con "/orcamento Comida 500" (límite mensual por categoría).',
    budget_list_header: "💰 Presupuestos de este mes:",
    budget_list_footer:
      '"/orcamento <categoría> <valor>" para cambiar, "/orcamento remover <categoría>".',
    budget_alert_over: "🚨 Presupuesto de {category} superado: $ {spent} de $ {limit} ({pct}%).",
    budget_alert_warn: "🔔 Ya usaste {pct}% del presupuesto de {category}: $ {spent} de $ {limit}.",
    reminder_add_usage:
      'Uso: /lembretes add <día 1-28> <descripción>. Ej.: "/lembretes add 10 Factura de luz".',
    reminder_created:
      '⏰ Recordatorio creado: "{description}" — todos los días {day}. Te aviso por aquí.',
    reminder_remove_invalid: "Número inválido. Usa /lembretes para ver la lista.",
    reminder_removed: '🗑️ Recordatorio eliminado: "{description}".',
    reminder_empty:
      'No tienes recordatorios. Crea uno con "/lembretes add 10 Factura de luz" (día del mes + descripción).',
    reminder_list_header: "⏰ Tus recordatorios:",
    reminder_list_footer: '"/lembretes add <día> <descripción>" o "/lembretes remover <n.º>".',
    reminder_list_item: "{index}. día {day} — {description}",
    reminder_push: "🔔 Recordatorio: {description} (vence el día {day}).",
    link_success: "✅ ¡Cuenta vinculada! Ahora tus gastos suman en una sola cuenta.",
    link_invalid: "❌ Código de vínculo inválido o expirado. Genera uno nuevo en la app web.",
    ia_usage: "Use: /ia gpt o /ia gemini",
    ia_invalid: '¡Modelo inválido! Elige entre "gpt" o "gemini".',
    ia_set: "🤖 ¡Modelo actualizado a {model}!",
    ai_not_understood: "🤖 No entendí. ¿Puedes reformular?",
    ai_error: "🤖 Error al procesar el mensaje.",
    purchases_empty: "Aún no tienes compras registradas.",
    purchases_header: "📋 Tus compras:",
    purchases_item: "{index}. {description}: $ {total} el {date}",
    purchases_page_info: "📄 Página {current}/{pages} — {total} compra(s) en total.",
    purchases_more: 'Ver más: "/compras {next}".',
    purchases_fix_hint: 'Para corregir: "/editar 2 total 10" o "/excluir 2".',
    spending_empty: "No tienes gastos registrados {period}.",
    spending_report: "📊 Gastos {period}: $ {total} en {count} compra(s).",
    period_current_month: "de este mes",
    period_last_month: "del mes pasado",
    period_all: "en total",
    breakdown_category: "Por categoría",
    breakdown_store: "Por tienda",
    onboarding_ask_name: "Para empezar, ¿cómo te llamas? 🙂",
    onboarding_ask_email:
      "Indícame tu correo 📧 (o envía /pular). Si quieres, toca el botón de abajo para compartir tu teléfono.",
    onboarding_name_too_short: "Por favor, dime tu nombre. 🙂",
    onboarding_name_saved: "¡Encantado, {name}! {askEmail}",
    onboarding_email_invalid:
      "Mmm, ese correo no parece válido. ¿Puedes escribirlo de nuevo? (o /pular)",
    onboarding_complete:
      '✅ ¡Registro completo! Ahora solo envíame una compra (ej.: "agua 7") o un recibo. Usa /gastos para ver tus gastos.',
    phone_updated: "📱 ¡Teléfono actualizado con éxito!",
    phone_saved: "📱 ¡Teléfono guardado! {askEmail}",
  },
};

export type TParams = Record<string, string | number>;

// Substitui {chave} pelos valores informados. Chaves ausentes ficam como estão.
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

export function t(lang: Language, key: MessageKey, params?: TParams): string {
  const template = MESSAGES[lang]?.[key] ?? MESSAGES.pt[key] ?? key;
  return interpolate(template, params);
}

// Idioma (código) → rótulo para o prompt da IA.
const LANG_LABEL: Record<Language, string> = {
  pt: "português do Brasil",
  en: "English",
  es: "Español",
};

export function languageLabel(lang: Language): string {
  return LANG_LABEL[lang] ?? LANG_LABEL.pt;
}
