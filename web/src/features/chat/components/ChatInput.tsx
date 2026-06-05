import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

interface Props {
  disabled: boolean;
  onSendText: (text: string) => void;
  onSendPhoto: (imageBase64: string) => void;
}

export function ChatInput({ disabled, onSendText, onSendPhoto }: Props) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!text.trim()) return;
    onSendText(text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? ""; // remove "data:...;base64,"
      if (base64) onSendPhoto(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Enviar foto de cupom"
          className="shrink-0 rounded-xl p-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
        >
          📎
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Mensagem…"
          className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand"
        />

        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
