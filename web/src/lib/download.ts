// Dispara o download de um Blob no navegador.
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Converte base64 (vindo do WS) em Blob e baixa.
export function downloadBase64(filename: string, mimeType: string, base64: string): void {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  triggerDownload(new Blob([arr], { type: mimeType }), filename);
}
