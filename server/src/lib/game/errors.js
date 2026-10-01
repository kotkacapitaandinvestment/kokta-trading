// A refusal the trader should see, with its HTTP status and a machine code.
export class GameError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.expose = true;
    this.status = status;
    this.code = code;
  }
}
