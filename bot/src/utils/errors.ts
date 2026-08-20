export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class NetworkError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

// Falha ao extrair texto da imagem. Existe para que a falha NÃO possa se disfarçar de
// conteúdo do cupom: antes, os providers devolviam a string "Erro ao processar a imagem."
// e ela seguia para a IA como se fosse o texto lido — o usuário via "não entendi" em vez
// de "o OCR falhou". Ver C12 em specs/codebase/CONCERNS.md.
export class OcrError extends BaseError {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
  }
}
