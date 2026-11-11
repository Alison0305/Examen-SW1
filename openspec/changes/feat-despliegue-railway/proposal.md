## Why

La herramienta solo se ejecuta en local (`npm run dev`). Hace falta publicarla en la nube para la evaluación, con HTTPS (el micrófono del navegador lo exige), colaboración por WebSocket, PostgreSQL y la IA local (Qwen, Florence-2 y Vosk). Se eligió Railway (plan Hobby) frente a Render, por el apagado por inactividad y el coste, y frente a un VPS, por el HTTPS y el dominio incluidos y porque no hay servidor que administrar.

## What Changes

- Imagen Docker del backend (`backend/Dockerfile`):
  - Node 24 en Debian slim, con Python y Vosk en un entorno virtual y OpenSSL para Prisma;
  - los paquetes del monorepo que usa el backend, compilados en orden;
  - el cliente Prisma generado para Linux;
  - sin los binarios CUDA y Vulkan de `node-llama-cpp`, porque no hay GPU.
- Script de arranque (`backend/docker-entrypoint.sh`):
  - descarga los modelos en un volumen persistente solo si faltan (Qwen3-1.7B Q4_K_M, Florence-2 q8 en su revisión fijada y Vosk small-es-0.42);
  - aplica `prisma migrate deploy`;
  - arranca el backend en el puerto `PORT` de Railway con el mismo arranque que en desarrollo (`node --import tsx src/main.ts`).
- Imagen Docker del frontend (`frontend/Dockerfile`): compila `uml-core`, `xmi-core` y Next.js con `NEXT_PUBLIC_API_BASE_URL` recibida como argumento de build, y sirve con `next start` en `PORT`.
- `.dockerignore` en la raíz, que deja fuera secretos, dependencias, compilados y modelos.
- Guía paso a paso `docs/deploy/railway.md`: servicios, volumen, variables, dominios, orden de despliegue y verificación.
- `.env.example` documenta las variables nuevas del arranque en contenedor (`MODELS_DIR`, `DOWNLOAD_MODELS`).

## Capabilities

### New Capabilities

- `cloud-deployment`: empaquetado reproducible en contenedores y despliegue en Railway de backend, frontend y PostgreSQL, con la IA local y sin secretos en el repositorio.

### Modified Capabilities

Ninguna. El comportamiento funcional de la aplicación no cambia.

## Impact

- Archivos nuevos de despliegue y documentación; sin cambios en el código de la aplicación, el esquema Prisma ni las migraciones.
- No se usa `railway.json`, porque Railway marca el *config as code* como obsoleto con soporte hasta el 2026-12-01. Cada servicio apunta a su Dockerfile con la variable `RAILWAY_DOCKERFILE_PATH`.
- La IA corre en CPU compartida. En CU-08 se midieron entre 9 y 19 s por frase con Q4_K_M en CPU; la latencia en Railway debe medirse después del despliegue.
- Coste según consumo en el plan Hobby; el límite de gasto se configura en Railway.
