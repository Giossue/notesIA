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

/** El cambio quedó en el teléfono y se enviará al volver la conexión. */
export class OfflineQueuedError extends ApiError {
  constructor() {
    super(
      "Sin internet: lo guardamos en tu teléfono y se enviará cuando vuelva la conexión.",
      "OFFLINE_QUEUED",
    );
    this.name = "OfflineQueuedError";
  }
}
