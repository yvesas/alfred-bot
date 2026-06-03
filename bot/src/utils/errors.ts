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
