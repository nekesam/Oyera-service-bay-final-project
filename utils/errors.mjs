// Errors we expect and can explain to the user ("domain errors") carry an HTTP status.
// Anything else is a bug and is reported as a generic 500.

export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'We could not find what you were looking for.') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class InsufficientStockError extends DomainError {
  constructor(itemName, available, requested) {
    super(`Insufficient stock for ${itemName}. Available ${available}, requested ${requested}.`, 409);
    this.name = 'InsufficientStockError';
  }
}
