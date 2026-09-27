/** Error de la API con su código; sin dependencias nativas, para poder usarlo en cualquier parte. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
