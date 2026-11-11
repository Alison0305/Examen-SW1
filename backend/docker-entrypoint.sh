#!/bin/sh
# Arranque del backend en contenedor (Railway u otro):
#   1. descarga al volumen MODELS_DIR los modelos de IA que falten (solo la primera vez);
#   2. aplica las migraciones pendientes de Prisma;
#   3. arranca el backend en el puerto PORT de la plataforma, igual que en desarrollo (tsx).
# Fuentes de los modelos: docs/puds/use-cases/CU-08 (Qwen), CU-10 (Florence-2) y CU-09 (Vosk).
set -eu

MODELS_DIR="${MODELS_DIR:-/models}"
QWEN_FILE="$MODELS_DIR/Qwen3-1.7B-Q4_K_M.gguf"
QWEN_URL="https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf"
FLORENCE_DIR="$MODELS_DIR/Florence-2-base-ft"
FLORENCE_URL="https://huggingface.co/onnx-community/Florence-2-base-ft/resolve/e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f"
FLORENCE_FILES="config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json special_tokens_map.json added_tokens.json vocab.json merges.txt onnx/embed_tokens_quantized.onnx onnx/vision_encoder_quantized.onnx onnx/encoder_model_quantized.onnx onnx/decoder_model_merged_quantized.onnx"
VOSK_NAME="vosk-model-small-es-0.42"
VOSK_DIR="$MODELS_DIR/$VOSK_NAME"
VOSK_URL="https://alphacephei.com/vosk/models/$VOSK_NAME.zip"

# Descarga atómica: se escribe en .part y solo se renombra si terminó bien, así un corte no deja un archivo roto.
download() {
  if [ -s "$2" ]; then return 0; fi
  echo "[models] descargando $(basename "$2")"
  mkdir -p "$(dirname "$2")"
  curl -fL --retry 3 --retry-delay 5 -o "$2.part" "$1"
  mv "$2.part" "$2"
}

if [ "${DOWNLOAD_MODELS:-true}" != "false" ]; then
  mkdir -p "$MODELS_DIR"
  download "$QWEN_URL" "$QWEN_FILE"
  for file in $FLORENCE_FILES; do download "$FLORENCE_URL/$file" "$FLORENCE_DIR/$file"; done
  if [ ! -d "$VOSK_DIR" ]; then
    download "$VOSK_URL" "$MODELS_DIR/$VOSK_NAME.zip"
    unzip -q "$MODELS_DIR/$VOSK_NAME.zip" -d "$MODELS_DIR"
    rm -f "$MODELS_DIR/$VOSK_NAME.zip"
  fi
  echo "[models] modelos listos en $MODELS_DIR"
fi

# Las rutas solo se fijan si el modelo existe; una variable definida en la plataforma tiene prioridad.
if [ -z "${ASSISTANT_MODEL_PATH:-}" ] && [ -s "$QWEN_FILE" ]; then export ASSISTANT_MODEL_PATH="$QWEN_FILE"; fi
if [ -z "${VISION_MODEL_PATH:-}" ] && [ -d "$FLORENCE_DIR/onnx" ]; then export VISION_MODEL_PATH="$FLORENCE_DIR"; fi
if [ -z "${SPEECH_MODEL_PATH:-}" ] && [ -d "$VOSK_DIR" ]; then export SPEECH_MODEL_PATH="$VOSK_DIR"; fi

# Hilos de inferencia de Qwen. Sin fijarlos, node-llama-cpp usa un hilo por núcleo detectado, y en la nube el
# contenedor puede ver todos los núcleos del servidor físico aunque su cuota de CPU sea mucho menor: la inferencia se
# vuelve muy lenta. Si ASSISTANT_THREADS no está definida, se calcula con la cuota del cgroup (cpu.max) o, si no hay
# cuota, con los núcleos disponibles; siempre entre 1 y ASSISTANT_MAX_AUTO_THREADS (8 por defecto).
if [ -z "${ASSISTANT_THREADS:-}" ]; then
  cores="$(nproc 2>/dev/null || echo 1)"
  quota="$(cut -d' ' -f1 /sys/fs/cgroup/cpu.max 2>/dev/null || echo max)"
  period="$(cut -d' ' -f2 /sys/fs/cgroup/cpu.max 2>/dev/null || echo 100000)"
  if [ "$quota" != "max" ] && [ -n "$quota" ] && [ "${period:-0}" -gt 0 ] 2>/dev/null; then
    threads=$(( (quota + period - 1) / period ))
  else
    threads="$cores"
  fi
  limit="${ASSISTANT_MAX_AUTO_THREADS:-8}"
  [ "$threads" -gt "$limit" ] && threads="$limit"
  [ "$threads" -lt 1 ] && threads=1
  export ASSISTANT_THREADS="$threads"
  echo "[ia] hilos de inferencia: $ASSISTANT_THREADS (núcleos visibles: $cores, cuota cpu.max: $quota $period)"
else
  echo "[ia] hilos de inferencia: $ASSISTANT_THREADS (definidos en la plataforma)"
fi

# La base de datos puede tardar en aceptar conexiones (primer arranque o reinicio de la plataforma): se reintenta
# durante DB_MIGRATE_RETRIES × 5 s antes de rendirse.
echo "[db] aplicando migraciones"
attempt=1
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "${DB_MIGRATE_RETRIES:-24}" ]; then
    echo "[db] no se pudieron aplicar las migraciones tras $attempt intentos" >&2
    exit 1
  fi
  echo "[db] la base de datos aún no responde; reintento $attempt en 5 s"
  attempt=$((attempt + 1))
  sleep 5
done

export BACKEND_PORT="${PORT:-${BACKEND_PORT:-3001}}"
echo "[app] backend en el puerto $BACKEND_PORT"
exec node --import tsx src/main.ts
