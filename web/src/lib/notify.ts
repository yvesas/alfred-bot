// Notificações do navegador: "push leve" para lembretes/mensagens quando a aba não está
// em foco. Sem Service Worker — depende da página estar aberta (basta não estar focada).
// Web Push real (com Service Worker + VAPID) fica para uma evolução futura.

export function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

// Mostra uma notificação apenas se a aba NÃO estiver em foco (em foco, a própria UI já exibe).
export function notifyIfHidden(title: string, body: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    new Notification(title, { body });
  } catch {
    // ambiente sem suporte — ignora
  }
}
