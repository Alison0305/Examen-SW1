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
- [x] 3.2 Despliegue en Railway (plan Hobby) con PostgreSQL, backend con volumen y frontend; dominios HTTPS. Backend en línea el 2026-11-11: `/health` responde 200 con certificado válido y Socket.IO ofrece WebSocket.
- [x] 3.4 Corregir los `TIMEOUT` de Qwen en Railway: la consulta del Mentor y la creación de propuestas agotaban los 120 s (`mentor-proposal:structured-generation` con `TIMEOUT`), cuando en la prueba local en contenedor tardaban unos 20 s. Causa probable: node-llama-cpp usaba un hilo por núcleo detectado y, en la nube, el contenedor puede ver todos los núcleos del servidor físico. Hecho en código: `ASSISTANT_THREADS` opcional (`maxThreads` en `getLlama` y `threads` en `createContext`; sin la variable, el comportamiento local no cambia), cálculo automático en `docker-entrypoint.sh` con la cuota de `cpu.max` y tope de 8, y log `assistant:model-loaded` con núcleos e hilos. Pruebas unitarias y simulación de `cpu.max`. Verificado en Railway el 2026-11-11 (commit `4f44a00`): el contenedor veía 48 núcleos con una cuota de 8 CPU (`cpu.max` `800000 100000`), así que node-llama-cpp usaba un hilo por cada uno de los 48 núcleos; ahora usa 8. El usuario confirmó que la consulta del Mentor y la creación de propuestas funcionan. Latencias pendientes de medir en 3.3.
- [ ] 3.5 Corregir el `TIMEOUT` de la importación de imagen en Railway («El reconocimiento de la imagen superó el tiempo máximo»). Causa probable, la misma que en 3.4: ONNX Runtime de Florence-2 crea hilos según los núcleos detectados (48) con una cuota de 8 CPU. La carga del modelo no cuenta para el tiempo (`warmup` antes del reloj), así que lo que agota los 60 s es la inferencia. Hecho en código: `VISION_THREADS` opcional, con `ASSISTANT_THREADS` como respaldo, pasado como `session_options.intraOpNumThreads` a `from_pretrained`, y log `vision:model-loaded`; sin variables, el comportamiento local no cambia. Pruebas unitarias. Pendiente: desplegar y verificar en Railway.
- [ ] 3.3 Verificación en la nube: dos navegadores, Mentor IA, voz e imagen; latencia medida y documentada.

## 4. Cierre

- [ ] 4.1 `.env.example`, STATUS y HANDOFF actualizados.
- [ ] 4.2 Aceptación del usuario, archivo del OpenSpec, commit y push.
