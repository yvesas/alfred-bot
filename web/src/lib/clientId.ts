const KEY = "alfred_client_id";

// Identidade anônima do navegador (T0): um UUID persistente no localStorage.
// Vira o externalId no backend (platform "web"). Limpar o storage = "novo usuário".
export function getClientId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
