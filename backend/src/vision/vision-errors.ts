export type VisionErrorCode =
  | "INVALID_FORMAT"
  | "INVALID_IMAGE"
  | "INVALID_DIMENSIONS"
  | "TOO_LARGE"
  | "NOT_CONFIGURED"
  | "MODEL_NOT_FOUND"
  | "RUNTIME_NOT_AVAILABLE"
  | "INFERENCE_ERROR"
  | "TIMEOUT"
  | "BUSY";

const messages: Record<VisionErrorCode, string> = {
  INVALID_FORMAT: "La imagen debe ser PNG o JPEG.",
  INVALID_IMAGE: "No se pudo leer la imagen.",
  INVALID_DIMENSIONS: "Las dimensiones de la imagen están fuera de los límites permitidos.",
  TOO_LARGE: "La imagen supera el tamaño máximo permitido.",
  NOT_CONFIGURED: "No se configuró un modelo local de visión.",
  MODEL_NOT_FOUND: "El modelo local de visión configurado no existe.",
  RUNTIME_NOT_AVAILABLE: "El runtime local de visión no está disponible.",
  INFERENCE_ERROR: "No se pudo completar el reconocimiento de la imagen.",
  TIMEOUT: "El reconocimiento de la imagen superó el tiempo máximo.",
  BUSY: "El reconocimiento de imágenes está ocupado; inténtalo nuevamente.",
};

export const VISION_ERROR_STATUS: Readonly<Record<VisionErrorCode, number>> = {
  INVALID_FORMAT: 415,
  INVALID_IMAGE: 422,
  INVALID_DIMENSIONS: 422,
  TOO_LARGE: 413,
  NOT_CONFIGURED: 503,
  MODEL_NOT_FOUND: 503,
  RUNTIME_NOT_AVAILABLE: 503,
  INFERENCE_ERROR: 500,
  TIMEOUT: 504,
  BUSY: 503,
};

export class VisionError extends Error {
  constructor(readonly code: VisionErrorCode, message: string = messages[code]) {
    super(message);
  }
}
