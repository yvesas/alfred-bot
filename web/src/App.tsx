import { ChatPage } from "./features/chat/ChatPage";
import { I18nProvider } from "./lib/i18n";

export default function App() {
  return (
    <I18nProvider>
      <ChatPage />
    </I18nProvider>
  );
}
