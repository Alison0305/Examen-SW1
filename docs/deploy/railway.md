# Despliegue en Railway

Guía para publicar UML Studio (backend, frontend y PostgreSQL) en [Railway](https://railway.com) con la IA local. OpenSpec: `openspec/changes/feat-despliegue-railway/`.

## Arquitectura

```text
Navegador ─HTTPS─► frontend  (Next.js, frontend/Dockerfile)
         ─HTTPS/WSS─► backend (NestJS + Socket.IO + Qwen/Florence/Vosk, backend/Dockerfile)
                          ├─► PostgreSQL (servicio gestionado de Railway)
                          └─► volumen /models (modelos de IA, unos 1,5 GB)
```

- Los dos servicios se construyen desde la **raíz** del repositorio, porque necesitan los paquetes compartidos del monorepo.
- Cada servicio elige su Dockerfile con la variable `RAILWAY_DOCKERFILE_PATH`. No se usa `railway.json`: Railway lo marca como obsoleto, con soporte hasta el 2026-12-01.
- Los modelos no van en la imagen. El backend los descarga al volumen en el **primer arranque** y en los siguientes los reutiliza.
- Railway da a cada servicio un dominio `*.up.railway.app` con HTTPS, que el micrófono necesita.

## Requisitos

- Cuenta de Railway en el plan **Hobby**. El periodo de prueba solo permite 1 GB de RAM por servicio y la IA no cabe.
- Un **límite de gasto** configurado en *Workspace → Usage*.
- El repositorio conectado desde GitHub, con la rama `main`.

## Paso 1. PostgreSQL

1. En el proyecto, pulsa **+ New → Database → Add PostgreSQL**.
2. Espera a que el servicio `Postgres` quede activo. No hace falta configurar nada más.

## Paso 2. Backend

1. Usa el servicio que ya existe, conectado al repositorio. En **Settings** renómbralo a `backend`.
2. **Settings → Source:** la rama que se despliega (`main`, o `feat/despliegue-railway` mientras el despliegue está en prueba), con *Root Directory* vacío, que equivale a la raíz del repositorio.
3. **Volumen:** clic derecho sobre el servicio → **Attach Volume**, con *Mount path* `/models`.
4. **Settings → Networking → Generate Domain,** con el puerto **3001**, el mismo que `PORT` en las variables.
5. **Variables** (pestaña *Variables* → *Raw Editor*):

   ```env
   PORT=3001
   RAILWAY_DOCKERFILE_PATH=backend/Dockerfile
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<pega aquí un secreto aleatorio largo>
   JWT_EXPIRES_IN=8h
   FRONTEND_ORIGIN=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
   ASSISTANT_PRELOAD=true
   ```

   - **`JWT_SECRET`:** genera uno en PowerShell con la línea de abajo y pégalo. No lo guardes en el repositorio.

     ```powershell
     -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
     ```

   - **`FRONTEND_ORIGIN`** hace referencia al dominio del servicio `frontend` del paso 3. Si todavía no existe, déjala para el final.
   - **`ASSISTANT_PRELOAD=true`** carga Qwen al arrancar, para que la primera consulta no espere a la carga del modelo.
   - Las rutas de los modelos (`ASSISTANT_MODEL_PATH`, `VISION_MODEL_PATH`, `SPEECH_MODEL_PATH`) las fija el script de arranque. No las definas salvo que quieras otros modelos.
   - **`ASSISTANT_THREADS`** (opcional): hilos de inferencia de Qwen. Si no la defines, el script la calcula con la cuota de CPU del contenedor, con un máximo de 8, y lo escribe en el log (`[ia] hilos de inferencia: …`). Al cargar el modelo, el backend registra `assistant:model-loaded` con los núcleos que ve y los hilos que usa. Sin fijar los hilos, node-llama-cpp usa uno por núcleo detectado, y en la nube puede detectar todos los núcleos del servidor físico: la inferencia se vuelve tan lenta que agota el tiempo.
   - **`VISION_THREADS`** (opcional): hilos de ONNX Runtime para Florence-2 (imagen → UML). Si no la defines, usa `ASSISTANT_THREADS`. Al cargar el modelo de visión, el backend registra `vision:model-loaded` con los núcleos que ve y los hilos configurados.
6. **Health check:** déjalo vacío en el primer despliegue. El primer arranque descarga cerca de 1,5 GB antes de abrir el puerto. Cuando el servicio esté activo, puedes poner *Healthcheck Path* `/health`.

## Paso 3. Frontend

1. **+ New → GitHub Repo →** el mismo repositorio. Renombra el servicio a `frontend`.
2. **Settings → Source:** la misma rama que el backend, con *Root Directory* vacío.
3. **Settings → Networking → Generate Domain,** con el puerto **3000**.
4. **Variables:**

   ```env
   PORT=3000
   RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile
   NEXT_PUBLIC_API_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
   ```

   Next.js incrusta `NEXT_PUBLIC_API_BASE_URL` en el build. Si cambia el dominio del backend, hay que volver a desplegar el frontend.

## Paso 4. Orden del primer despliegue

1. Comprueba que existen los dos dominios (backend y frontend) y las variables de los pasos 2 y 3.
2. Despliega el **backend** con **Deploy** o **Redeploy**. En *Deploy Logs* debe aparecer:
   - `[models] descargando …` (solo la primera vez, varios minutos);
   - `[models] modelos listos en /models`;
   - `[db] aplicando migraciones` y `All migrations have been successfully applied.` o `No pending migrations to apply.`;
   - `[app] backend en el puerto …`.
3. Abre `https://<dominio-backend>/health`: debe responder `{"status":"ok"}`.
4. Despliega el **frontend** y abre su dominio.

## Paso 5. Verificación

1. **Cuentas:** registra dos cuentas, crea un proyecto e invita a la segunda como EDITOR.
2. **Colaboración:** con dos navegadores, los cambios de uno aparecen en el otro sin recargar.
3. **Mentor IA:** haz una consulta y anota cuánto tarda. En CPU es más lento que con GPU (ver «Rendimiento medido»).
4. **Voz:** dicta un comando. Requiere HTTPS y permiso del micrófono.
5. **Imagen:** importa una imagen limpia de un diagrama.
6. **Consumo:** revisa *Metrics* y *Usage* en Railway.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| «Railpack failed to prepare the build» | Falta `RAILWAY_DOCKERFILE_PATH` | Defínela y vuelve a desplegar |
| El build del frontend dice «Falta NEXT_PUBLIC_API_BASE_URL» | La variable no está definida | Añádela con el dominio del backend |
| El navegador bloquea las peticiones por CORS, o el WebSocket no conecta | `FRONTEND_ORIGIN` no es exactamente `https://<dominio-frontend>` | Corrígela, sin `/` final, y vuelve a desplegar el backend |
| El contenedor se reinicia por memoria (OOM) | El plan o la instancia no tienen RAM suficiente | Plan Hobby; si persiste, `ASSISTANT_PRELOAD=false` y `VISION_PRELOAD=false` |
| «Faltan las variables de entorno obligatorias JWT_SECRET y JWT_EXPIRES_IN» | Variables sin definir | Añádelas en el backend |
| El Mentor responde que no está disponible y el log muestra `"errorCode":"TIMEOUT"` | La inferencia en CPU supera `ASSISTANT_TIMEOUT_MS` (120 000 en la imagen). Visto en Railway el 2026-11-11 con los hilos sin fijar | Revisa `[ia] hilos de inferencia` y `assistant:model-loaded` en el log; prueba `ASSISTANT_THREADS` con 2, 4 u 8; si sigue lento, sube `ASSISTANT_TIMEOUT_MS` |
| Al importar una imagen: «El reconocimiento de la imagen superó el tiempo máximo» | La inferencia de Florence-2 en CPU supera `VISION_TIMEOUT_MS` (60 000). Visto en Railway el 2026-11-11 con los hilos de ONNX Runtime sin fijar | Revisa `vision:model-loaded` en el log (`configuredThreads`); prueba `VISION_THREADS` con 2, 4 u 8; si sigue lento, sube `VISION_TIMEOUT_MS` y activa `VISION_PRELOAD=true` |
| El Mentor responde que no está disponible y el log muestra `NOT_CONFIGURED` o `MODEL_NOT_FOUND` | El modelo no está en `/models` | Revisa el volumen y que `[models] modelos listos en /models` aparezca al arrancar |

## Rendimiento medido (prueba local en contenedor, 2026-11-11)

Medido con estas mismas imágenes en Docker Desktop (8 CPU), solo con CPU, Qwen3-1.7B Q4_K_M y los modelos en un volumen nativo. En Railway puede variar, porque la CPU es compartida: hay que medirlo allí.

| Medida | Resultado |
|---|---|
| Imagen del backend / del frontend | 2,56 GB / 1,23 GB |
| Arranque del backend con los modelos ya en el volumen | 36 s hasta `/health` |
| RAM del backend con Qwen cargado | 1,3-1,6 GB |
| Interpretar un comando (asistente de texto o voz) | 19-21 s por petición |
| Consulta del Mentor | 8,6 s |
| Primera petición tras la primera carga del modelo | 238 s (una sola vez; en los reinicios siguientes la carga tardó menos de 21 s) |

Con `ASSISTANT_PRELOAD=true` la carga del modelo ocurre al arrancar, no en la primera petición de un usuario. Tras un despliegue, espera unos minutos antes de la demo. La primera vez se descargan además los modelos (unos 1,5 GB).

## Coste

Railway cobra por consumo: RAM, CPU, volumen y tráfico. Con Qwen cargado el uso de RAM ronda los 2-3 GB. Es una estimación, así que revisa *Usage* después de unos días y ajusta el límite de gasto.

## Probar las imágenes en local (opcional)

Desde la raíz del repositorio, con Docker Desktop abierto:

```powershell
docker build -f backend/Dockerfile -t umlstudio-backend .
docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 -t umlstudio-frontend .
```
