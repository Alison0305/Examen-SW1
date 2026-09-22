# CU-09 - Voz Vosk y Android Capacitor

## Objetivo

Incorporar una frontera STT local que entregue un transcript revisable sin ejecutar comandos directamente.

## Estado

Incremento 1 completado. Las tareas 1.1 a 1.4 estan validadas; los incrementos de benchmark, Capacitor y Android permanecen pendientes.

## Implementacion realizada

- Contrato STT runtime-neutral, worker Python Vosk local y adapter NestJS con PCM mono signed 16-bit a 16 kHz.
- Captura web explicita mediante MediaRecorder, conversion local a PCM, diagnosticos, cancelacion y limpieza de recursos.
- Transcript visible y editable en el asistente UML, que reutiliza el input y parser textual existentes.
- Endpoint local `POST /speech/recognize`; no hay cloud, descarga automatica ni persistencia de audio.

## Smoke Manual - Task 1.4

Fecha: 2026-09-19.

Se realizo un smoke en navegador web real con microfono fisico y Vosk local. La frase hablada fue `crear clase paciente` y el transcript obtenido fue `crear clase paciente`. El transcript aparecio en `Transcript de voz` y se sincronizo con `Instruccion UML`, sin crear clases automaticamente.

La persona usuaria edito el texto para usar `CREATE_CLASS name="Cliente"`. El parser UML existente de CU-08 usa gramatica estricta; la frase natural `crear clase cliente` no es una instruccion valida de `parseUmlTextProposal`. Esto es comportamiento esperado fuera del alcance de CU-09: la voz entrega texto revisable y reutiliza el pipeline textual existente.

Al presionar `Interpretar`, se mostro la propuesta con `Aprobar` y `Cancelar`; se uso `Cancelar` y el canvas no cambio. Una segunda captura se cancelo con `Cancelar voz`: se abandono `LISTENING`, no aparecio propuesta y no hubo mutacion UML. Como fallback textual, `CREATE_CLASS name="Producto"` tambien genero su propuesta sin usar microfono.

Resultado: captura, Vosk local, transcript revisable, revision previa, cancelacion y fallback textual aprobados. No existe ejecucion directa desde voz hacia `UmlCommandBus`.

## Pruebas

- Tests frontend de workspace y captura: aprobados.
- Tests de frontend-generator: aprobados.
- Smoke manual web de Task 1.4: aprobado.

## Corpus - Task 2.1

El corpus reproducible contiene cinco fixtures WAV PCM signed 16-bit, mono y 16 kHz con el golden inmutable `crear clase paciente`: baseline existente; ruido blanco aditivo derivado con SNR 15 dB y seed 42; habla humana lenta; habla humana rapida; y pronunciacion humana claramente articulada.

`backend/src/speech/vosk/fixtures/corpus.json` registra IDs estables, condiciones, origen y transformacion. Los tres fixtures humanos se registran solo como `human-local`, sin identidad, rutas absolutas ni datos biometricos. La prueba de integridad valida manifest, formato PCM, duracion, senal no silenciosa y condiciones. El corpus queda listo para Task 2.2, que medira reconocimiento y rendimiento.

## Benchmark STT - Task 2.2

El runner local `backend/tools/speech-stt-benchmark.py` consume `corpus.json`, usa Vosk 0.3.45 con el modelo local `vosk-model-small-es-0.42` y emite un reporte JSON por stdout. La normalizacion de metricas aplica NFKC, minusculas, trim, espacios consecutivos y puntuacion superficial; no corrige palabras. Se ejecutaron tres reconocimientos por fixture con el modelo cargado, manteniendo separado el cold start de carga.

Ejecucion observada el 2026-09-19 en Windows AMD64, Python 3.13.5 y Node v24.20.0: carga de modelo 689.677 ms; RAM baseline 34,672,640 bytes, tras carga 135,839,744 bytes, delta 101,167,104 bytes. Las 15 latencias de reconocimiento tuvieron p50 682.900 ms y p95 1,060.534 ms.

| Condicion | Transcript raw | Exact match | WER | Latencia p50/p95 ms |
| --- | --- | --- | --- | --- |
| baseline | `crear clase paciente` | si | 0.000 | 578.369 / 616.531 |
| ruido blanco 15 dB | `crear clase pacientes` | no | 0.333 | 598.989 / 637.929 |
| velocidad lenta | `crear clase paciente` | si | 0.000 | 1,053.555 / 1,060.534 |
| velocidad rapida | `crear clase paciente` | si | 0.000 | 682.900 / 688.364 |
| pronunciacion clara | `crear clase paciente` | si | 0.000 | 730.223 / 737.330 |

Resultado agregado: 4/5 exact matches (0.800), WER 0.0667, una sustitucion, sin inserciones ni eliminaciones y sin fallos tecnicos. No existen thresholds, tuning ni comparacion de modelos definidos para esta tarea. Este resultado se limita al corpus v1 de cinco fixtures; no representa una evaluacion general del espanol ni selecciona un modelo definitivo.

## Build web para Capacitor - Task 3.1

El frontend objetivo para empaquetado es el generado por `frontend-generator`, no el frontend principal de la herramienta CASE. La evaluación confirmó que solo contiene la ruta raiz de App Router y que las APIs exclusivas de navegador (microfono, `MediaRecorder` y `AudioContext`) se usan dentro de componentes con `"use client"` y tras una interaccion de la persona usuaria.

La plantilla `next.config.ts` ahora configura `output: "export"` e imagenes no optimizadas. Por ello, el artefacto compatible previo a Capacitor es `out/`, que sera el `webDir` de una configuracion Capacitor futura. Se genero un frontend temporal, cuya dependencia `file:../../../assistant-core` resolvio dentro del repositorio a `assistant-core`. Tras instalar exclusivamente sus dependencias declaradas con `npm install --ignore-scripts`, `npm run build` genero `out/` con `index.html`, `404.html` y bundles `_next/static`; las rutas exportadas fueron `/` y `/_not-found`.

El artefacto se sirvio temporalmente en `127.0.0.1` y respondio HTTP 200 para `/` y un bundle de `app/page`. No requiere servidor Next en runtime. Next ajusto solamente el `tsconfig.json` del output temporal durante el build; no se modifico la plantilla de TypeScript. El output temporal, sus dependencias, lockfile y artefactos de build se eliminaron tras la verificacion.

No se creo configuracion Capacitor ni directorio `android/`. La configuracion LAN, permisos `RECORD_AUDIO`, sincronizacion y build Android pertenecen exclusivamente a Tasks 3.2 a 3.4.

## Capacitor y Android - Task 3.2

El frontend generado fija Capacitor 7.6.9 para `@capacitor/core`, `@capacitor/cli` y `@capacitor/android`. Genera `capacitor.config.ts` con `appId` `com.examen.sw1.generated`, nombre `Examen SW1` y `webDir` `out`, sin `server.url`.

El smoke genero y sincronizo `android/` sin Android SDK. El manifest resultante declara `android.permission.RECORD_AUDIO`, conserva `INTERNET` para el host LAN y no agrega permisos de camara, contactos, ubicacion ni almacenamiento. Se habilita cleartext HTTP globalmente porque el host LAN es configurable y no puede restringirse a un dominio desconocido; no hay URL ni IP fijada en el codigo.

La captura pide microfono solamente desde `Iniciar voz`. El frontend generado solicita host IPv4/hostname y puerto 1..65535, rechaza localhost del telefono, construye solo `http://host:port/speech/recognize` y convierte timeout, error de red o HTTP no exitoso en un diagnostico visible. La entrada textual permanece independiente como fallback. No se ejecuto build Gradle ni se genero APK/AAB.

## Build Android real - Task 3.3

En Windows, con OpenJDK 21.0.12.1 LTS, Android SDK Platform 35, Build Tools 34.0.0, Gradle Wrapper 8.11.1 y Android Gradle Plugin 8.7.2, se ejecuto manualmente desde el proyecto temporal: `./gradlew.bat assembleDebug --no-daemon --no-parallel --max-workers=1 --no-watch-fs --console=plain`.

El build real termino `BUILD SUCCESSFUL in 12m 22s`, con 85 tareas accionables: 51 ejecutadas y 34 up-to-date. Produjo `android/app/build/outputs/apk/debug/app-debug.apk`, con 4,464,838 bytes. El APK no se instalo ni se versiono; permanece dentro del output temporal ignorado. El modelo Vosk no se copio al proyecto Android ni al APK: la arquitectura sigue siendo Android mediante LAN hacia el backend host con Vosk local.

Durante la verificacion se observo una incidencia local de cache Gradle en Windows al mover un workspace temporal de transforms a su ubicacion inmutable. Se resolvio sobre ese workspace temporal y no representa un requisito ni comportamiento del producto.

## Correccion pre-smoke Android

Antes del smoke manual se corrigio la allowlist CORS del backend. Conserva `FRONTEND_ORIGIN` con el default `http://localhost:3000` y permite explicitamente `http://localhost`, origin de la WebView Capacitor Android. No se permiten origins arbitrarios, wildcard ni la IP LAN del host. Las pruebas HTTP verifican el header CORS para ambos origins permitidos, un origin web personalizado y el rechazo de `http://evil.example`.

Durante el smoke en Samsung Galaxy A05 se encontro un defecto adicional: Android mostraba `RECORD_AUDIO` como concedido, pero despues de conceder el dialogo iniciado por `Iniciar voz`, la WebView devolvia `NotAllowedError` y la interfaz mostraba `MICROPHONE_DENIED`. La causa fue que Capacitor 7.6.9, en `BridgeWebChromeClient.onPermissionRequest()`, requiere conjuntamente `MODIFY_AUDIO_SETTINGS` y `RECORD_AUDIO` para conceder el recurso WebView `RESOURCE_AUDIO_CAPTURE`; el manifest generado solo declaraba el segundo permiso.

La plantilla permanente `configure-android.mjs.hbs` ahora declara tambien `android.permission.MODIFY_AUDIO_SETTINGS`. No se conceden recursos WebView fuera de audio ni se agregan permisos de camara, ubicacion, contactos o almacenamiento. El test estructural del generador exige ambos permisos y la ausencia de camara/ubicacion. El output temporal corregido se regenero en `frontend-generator/.generated-task-3-4-fix/`; su manifest contiene `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` e `INTERNET`. El build real `assembleDebug` termino `BUILD SUCCESSFUL in 2m 29s` y produjo `frontend-generator/.generated-task-3-4-fix/frontend/android/app/build/outputs/apk/debug/app-debug.apk` de 4,464,865 bytes. El APK esta ignorado y no versionado. Aun no se instalo ni se repitio el smoke fisico.

En el siguiente smoke del Galaxy A05, la captura de microfono funciono: alcanzo `LISTENING`, `Cancelar voz` detuvo la captura y una grabacion de `crear clase paciente` fallo al detenerse con `HOST_UNAVAILABLE: Failed to fetch`. Chrome del mismo dispositivo alcanzo `http://192.168.1.4:3001/health` y recibio `{"status":"ok"}`. Esto confirma que LAN, TCP, firewall y backend eran operativos; el defecto estaba entre la WebView y el backend HTTP LAN.

El `capacitor.config.ts` del APK que fallo no definia `server.androidScheme`: Capacitor 7.6.9 uso su default `https`, con hostname `localhost` y `android.allowMixedContent` en `false`. La URL de voz se construye correctamente como `http://192.168.1.4:3001/speech/recognize`, por lo que la WebView HTTPS estaba sujeta tanto a contenido mixto como a que `https://localhost` no figuraba en CORS. `android:usesCleartextTraffic="true"` del manifest permite transporte HTTP Android, pero no equivale a habilitar mixed content en la WebView.

La correccion permanente fija `server.androidScheme: "http"` en la plantilla Capacitor para el prototipo LAN: WebView y backend usan HTTP y no se habilita `android.allowMixedContent`. Se conserva `usesCleartextTraffic="true"` exclusivamente para el backend HTTP LAN configurable; no es una recomendacion para produccion. El backend permite explicitamente `https://localhost` ademas de los origins localhost previos, sin wildcard ni IP LAN como origin, y un test cubre el preflight `POST /speech/recognize`. El output nuevo se regenero en `frontend-generator/.generated-task-3-4-fetch-fix/`; `assembleDebug` termino `BUILD SUCCESSFUL in 49s` y produjo `frontend-generator/.generated-task-3-4-fetch-fix/frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Aun no se instalo ni se realizo el re-smoke fisico.

El re-smoke de transporte en Galaxy A05 confirmo que microfono, cancelacion, LAN, Vosk, `RESULT` y transcript editable funcionan. Sin embargo, el frontend generado no expone `Interpretar`, propuesta, `Aprobar` ni `Cancelar` para `CREATE_CLASS name="Paciente"`. No es un control oculto: el flujo UML de CU-08 vive exclusivamente en `frontend/app/workspace/workspace-client.tsx`, donde `WorkspaceTextAssistant` conserva `ProjectDocument`, llama `parseUmlTextProposal` y aplica una propuesta aprobada mediante el `UmlCommandBus` del workspace. La aplicacion generada solo monta una captura de voz aislada, `AssistantPanel` de operaciones de datos y CRUD; no contiene modelo UML ni Command Bus. `Ejecutar` corresponde a `AssistantCommand` de datos y no equivale a `Interpretar`.

Por tanto, conectar `CREATE_CLASS` al APK generado requeriria introducir un segundo estado UML/Command Bus o convertir la aplicacion generada en el workspace CASE, ambos fuera del alcance del frontend generado y contrarios a la arquitectura vigente. Task 3.4 permanece bloqueada hasta definir el destino correcto del transcript generado: un comando de datos validado por `assistant-core`, o empaquetar el workspace CASE que ya posee el pipeline UML. No se agrego parser, autoejecucion ni mutacion nueva.

## Smoke Android fisico pendiente

- [ ] Instalar `app-debug.apk` manualmente y abrir la app.
- [ ] Confirmar que no solicita microfono al iniciar.
- [ ] Revalidar con `ipconfig` la IPv4 Wi-Fi del PC; `192.168.1.4` fue solo el valor observado durante pre-smoke.
- [ ] Configurar Host LAN con esa IPv4, sin `http://`, y Puerto LAN `3001`.
- [ ] Iniciar el backend en foreground con `BACKEND_PORT=3001`, `FRONTEND_ORIGIN=http://localhost`, `SPEECH_PYTHON_EXECUTABLE` y `SPEECH_MODEL_PATH` locales, y un `JWT_SECRET` temporal no versionado; comprobar `/health` por LAN.
- [ ] Conceder microfono tras `Iniciar voz`; comprobar `LISTENING`, `PROCESSING`, `RESULT` y transcript visible/editable.
- [ ] Confirmar que el transcript no ejecuta UML automaticamente; editar a `CREATE_CLASS name="Paciente"`, verificar propuesta y probar Aprobar/Cancelar.
- [ ] Confirmar que una operacion destructiva exige confirmacion explicita.
- [ ] Denegar permiso y revocarlo desde Ajustes; comprobar error controlado y fallback textual.
- [ ] Usar host no disponible o detener backend; comprobar `HOST_UNAVAILABLE` o `TIMEOUT` y que la app no crashea.
- [ ] Desactivar datos moviles y mantener Wi-Fi/LAN; comprobar reconocimiento sin servicio cloud.
- [ ] Registrar evidencia manual antes de cerrar Task 3.4.

## Resultado final

Task 3.4 esta completa y CU-09 alcanza 10/10. En Galaxy A05, el APK final API-LAN confirmo que el transcript es editable, `PREPARAR COMANDO` genera una propuesta, `CANCELAR` la descarta sin ejecutar y una segunda propuesta aprobada ejecuta `{"operation":"LIST","entity":"rol"}` por el pipeline `AssistantCommand` validado. Con Host API `192.168.1.4` y Puerto API `8080` como valores ingresados en runtime, el resultado fue el JSON real de Spring `{"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0}` y nunca HTML. La IP es evidencia temporal del smoke y no esta fijada en el producto.

## Backend Spring para smoke de datos

Se genero `spring-generator/.generated-task-3-4-api-smoke/` desde `frontend-generator/src/frontend-fixture.ts`, usando exactamente su `relationalModel` con las entidades `rol` y `usuario`. El output contiene `entities/Rol.java` y `controllers/RolController.java`; este ultimo declara `@RequestMapping("/api/v1/rol")` y `@GetMapping` para `listRol`, por lo que el endpoint es `GET /api/v1/rol`.

El output no define `server.port` ni `server.address`. En el arranque controlado de 2026-09-21, Spring Boot 4.1.1 inicializo Tomcat en el puerto HTTP 8080 antes de detenerse por configuracion de datasource ausente. Sin `server.address`, no hay restriccion generada a loopback; para el smoke LAN se debe conservar el bind por defecto de Spring Boot y usar la IPv4 Wi-Fi vigente, sin fijarla en el codigo.

El runtime declarado usa el driver PostgreSQL, pero no genera `spring.datasource.url`, `spring.datasource.username` ni `spring.datasource.password`, ni compose, Flyway o Liquibase. Por tanto `bootRun` requiere PostgreSQL externo y esas tres propiedades. El test generado usa PostgreSQL Testcontainers y `spring.jpa.hibernate.ddl-auto=create-drop` solo bajo perfil `test`; no inicia una base para `bootRun`. El build compilo y empaqueto correctamente con Java 21 y Gradle Wrapper 8.14.4; su fase de test no pudo iniciar porque Docker no estaba disponible para Testcontainers.

El CORS generado aplica a `/api/v1/**` y toma `app.cors.allowed-origin` de `APP_CORS_ALLOWED_ORIGIN`, con default `http://localhost:3000`. Para la WebView Capacitor debe arrancarse con `APP_CORS_ALLOWED_ORIGIN=http://localhost`, sin wildcard ni cambio de plantilla.

La validacion manual posterior uso PostgreSQL local `localhost:5432/examen_sw1_smoke`. Spring arranco en `0.0.0.0:8080` con CORS `http://localhost`; `GET http://localhost:8080/api/v1/rol` devolvio HTTP 200 y JSON `{"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0}`. El Galaxy A05 accedio por LAN a `http://192.168.1.4:8080/api/v1/rol` y mostro el mismo JSON. La IP es evidencia puntual del smoke, no una configuracion persistida.

Se reconstruyo el output `frontend-generator/.generated-task-3-4-api-lan-fix/`, se sincronizo Capacitor 7.6.9 y `assembleDebug` concluyo correctamente en 1m31s. El APK resultante es `frontend-generator/.generated-task-3-4-api-lan-fix/frontend/android/app/build/outputs/apk/debug/app-debug.apk` (4,467,046 bytes), ignorado y no versionado. Conserva `webDir: out`, `server.androidScheme: "http"`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET` y `usesCleartextTraffic="true"`, sin mixed content. El re-smoke completo de este APK confirmo Cancelar sin ejecucion y Aprobar con JSON Spring real para `LIST rol`.
