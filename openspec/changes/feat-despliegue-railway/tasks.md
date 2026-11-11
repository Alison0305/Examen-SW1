## 1. Contenedores

- [x] 1.1 `.dockerignore` en la raíz, sin secretos, dependencias, compilados ni modelos.
- [x] 1.2 `backend/Dockerfile`: Node 24 slim, Python con Vosk, dependencias del backend y sus paquetes, compilación ordenada, Prisma generado y sin binarios GPU de `node-llama-cpp`.
- [x] 1.3 `backend/docker-entrypoint.sh`: descarga idempotente de modelos, `prisma migrate deploy` con reintentos mientras la base no responde, y arranque en `PORT`.
- [x] 1.4 `frontend/Dockerfile`: build de Next.js con `NEXT_PUBLIC_API_BASE_URL` obligatoria y `next start` en `PORT`.

## 2. Verificación local

- [x] 2.1 Construir ambas imágenes con Docker y arrancarlas contra PostgreSQL. Hecho el 2026-11-11 con Docker Desktop y PostgreSQL 18:
  - imágenes de 2,56 GB (backend) y 1,23 GB (frontend), sin binarios CUDA ni Vulkan;
  - 7 migraciones aplicadas sobre una base vacía y «No pending migrations» al rearrancar;
  - `/health` responde 200; registro, inicio de sesión y creación de proyecto funcionan;
  - CORS acepta solo `FRONTEND_ORIGIN`, y Socket.IO completa el handshake y ofrece WebSocket;
  - el frontend sirve `/`, `/login`, `/projects` y `/workspace` con la URL del backend incrustada, y su build falla con un mensaje claro sin `NEXT_PUBLIC_API_BASE_URL`.

  Encontrado y corregido: el backend intentaba migrar antes de que PostgreSQL aceptara conexiones (P1001), y ahora reintenta. El script corregido se probó montado sobre la imagen; la imagen definitiva la construye Railway.
- [ ] 2.2 Comprobar en el contenedor la descarga de modelos, la IA en CPU, la voz y la imagen, y medir la latencia. Hecho en parte:
  - **IA en CPU:** interpretar un comando, 19-21 s; consulta del Mentor, 8,6 s y registrada en el historial; 1,3-1,6 GB de RAM. La primera petición tras la primera carga del modelo tardó 238 s (una vez); los reinicios siguientes, menos de 21 s.
  - **Descarga de modelos:** URLs verificadas con peticiones HEAD, con tamaños iguales a los documentados. Los modelos se copiaron al volumen en vez de descargarse, así que la descarga real queda para Railway.
  - **Pendiente:** voz e imagen dentro del contenedor.

## 3. Railway

- [x] 3.1 Guía `docs/deploy/railway.md`: servicios, volumen, variables, dominios, orden de despliegue y verificación.
- [ ] 3.2 Despliegue en Railway (plan Hobby) con PostgreSQL, backend con volumen y frontend; dominios HTTPS.
- [ ] 3.3 Verificación en la nube: dos navegadores, Mentor IA, voz e imagen; latencia medida y documentada.

## 4. Cierre

- [ ] 4.1 `.env.example`, STATUS y HANDOFF actualizados.
- [ ] 4.2 Aceptación del usuario, archivo del OpenSpec, commit y push.
