# Backend NestJS + Socket.IO con la IA local (Qwen3 con node-llama-cpp en CPU, Florence-2 y Vosk).
# Contexto de build: raíz del repositorio (docker build -f backend/Dockerfile .).
# Los modelos no van en la imagen: docker-entrypoint.sh los descarga al volumen MODELS_DIR la primera vez.
FROM node:24-bookworm-slim

# Python para Vosk (CU-09), OpenSSL para el motor de Prisma, curl/unzip para descargar los modelos.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv openssl ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements-vosk.txt /tmp/requirements-vosk.txt
RUN python3 -m venv /opt/vosk \
  && /opt/vosk/bin/pip install --no-cache-dir -r /tmp/requirements-vosk.txt \
  && rm /tmp/requirements-vosk.txt

WORKDIR /app

# Manifiestos primero: la capa de npm ci se reutiliza mientras no cambien las dependencias.
# npm necesita todos los manifiestos de los workspaces declarados en la raíz.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY uml-core/package.json uml-core/
COPY xmi-core/package.json xmi-core/
COPY relational-core/package.json relational-core/
COPY spring-generator/package.json spring-generator/
COPY frontend-generator/package.json frontend-generator/
COPY assistant-core/package.json assistant-core/

# Solo el backend y los paquetes que usa (sin el frontend). Incluye las devDependencies: TypeScript para compilar
# los paquetes y tsx para arrancar. Sin GPU en la nube, se eliminan los binarios CUDA y Vulkan de node-llama-cpp.
RUN npm ci --no-audit --no-fund \
    --workspace backend --workspace uml-core --workspace relational-core \
    --workspace frontend-generator --workspace spring-generator --workspace assistant-core \
  && rm -rf node_modules/@node-llama-cpp/*-cuda* node_modules/@node-llama-cpp/*-vulkan* \
  && npm cache clean --force

COPY uml-core uml-core
COPY relational-core relational-core
COPY frontend-generator frontend-generator
COPY spring-generator spring-generator
COPY assistant-core assistant-core
COPY backend backend

# Compilación en orden de dependencias (npm ordena los workspaces por la lista de la raíz, no por dependencias).
# El sed protege el script de arranque si un checkout en Windows lo dejó con finales de línea CRLF.
RUN sed -i 's/\r$//' backend/docker-entrypoint.sh \
  && npm run build --workspace uml-core \
  && npm run build --workspace relational-core \
  && npm run build --workspace frontend-generator \
  && npm run build --workspace spring-generator \
  && npm run build --workspace assistant-core \
  && cd backend && npx prisma generate

ENV NODE_ENV=production \
    MODELS_DIR=/models \
    ASSISTANT_GPU=cpu \
    ASSISTANT_TIMEOUT_MS=120000 \
    SPEECH_PYTHON_EXECUTABLE=/opt/vosk/bin/python

WORKDIR /app/backend
EXPOSE 3001
ENTRYPOINT ["sh", "/app/backend/docker-entrypoint.sh"]
