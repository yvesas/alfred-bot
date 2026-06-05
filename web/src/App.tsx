import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { ChatPage } from "./features/chat/ChatPage";
import { Dashboard } from "./pages/Dashboard";
import { Account } from "./pages/Account";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/painel" element={<Dashboard />} />
      <Route path="/conta" element={<Account />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
