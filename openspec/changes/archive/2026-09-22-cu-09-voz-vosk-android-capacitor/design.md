## Context

CU-08 dejó dos rutas textuales seguras: comandos de datos validados contra Domain Manifest v1 y propuestas UML que se adaptan a comandos existentes mediante `UmlCommandBus`. El backend integra un worker STT Python local, sin captura de audio, Capacitor, proyecto Android ni Android SDK. El runtime Python aislado carga `vosk==0.3.45` en Python 3.13.5 x64 mediante el wheel Windows amd64; con el modelo local ignorado `vosk-model-small-es-0.42` reconoce el fixture PCM español `crear clase paciente` mediante worker y adapter. Véase `proposal.md` y los delta specs para el comportamiento comprometido.

## Goals / Non-Goals

**Goals:**

- Incorporar una frontera STT que entregue transcript, no comandos ni transporte.
- Ejecutar Vosk localmente en la estación anfitriona y permitir que clientes web/Android usen un host LAN configurable.
- Mantener revisión explícita, validación semántica y confirmaciones destructivas de CU-08.
- Verificar STT con métricas observadas y Android con un build real cuando exista toolchain.

**Non-Goals:**

- No instalar ni hacer obligatorio Qwen, node-llama-cpp, proveedores cloud, XMI, visión, Florence-2 ni funcionalidades de CU-10/CU-11.
- No procesar audio estrictamente dentro del teléfono, no descubrir hosts automáticamente ni persistir audio.
- No declarar una variante, tamaño o licencia concreta de modelo español antes de un spike de provisión separado.

## Decisions

### Frontera STT y responsabilidades

El runtime Vosk residirá en un worker Python local aislado y controlado por `backend/`, que conserva su responsabilidad de estación anfitriona Node/Nest. El backend iniciará el worker mediante `child_process.spawn` con `shell: false`, executable configurable administrativo, script fijo controlado por la aplicación y argumentos como array; no aceptará comandos, scripts, argumentos ni rutas de executable aportados por usuarios. El runtime validado actualmente es Python 3.13.5 x64 con `vosk==0.3.45`, instalado desde su wheel Windows amd64 y cargado sin compilación nativa de Vosk. Esa validación no convierte esa versión de Python en un requisito universal: la configuración debe seleccionar un runtime compatible con la distribución Vosk usada.

`pythonExecutable`, `modelPath` y `sampleRate` serán configuración administrativa/local. El entorno `backend/.venv` es una opción local de desarrollo ignorada por Git, no un runtime versionado ni una ruta universal. El frontend principal y generado capturarán audio y presentarán estados `IDLE`, `LISTENING`, `PROCESSING`, `RESULT` y `ERROR`; recibirán únicamente un transcript o diagnósticos estructurados como `MICROPHONE_DENIED`, `MODEL_NOT_FOUND`, `RUNTIME_NOT_AVAILABLE`, `AUDIO_ERROR`, `RECOGNITION_ERROR`, `HOST_UNAVAILABLE`, `TIMEOUT` o `CONNECTION_ERROR`.

El protocolo backend-worker será estricto y local: stdin recibirá exclusivamente PCM signed 16-bit mono crudo; stdout emitirá exclusivamente una línea JSON con el resultado o diagnóstico estructurado; stderr se consumirá como canal técnico acotado por el adapter y nunca se mezclará con el transcript. No existe un canal JSON Lines de control por stdin: la cancelación es responsabilidad del proceso padre NestJS, que cierra stdin, solicita terminación controlada y limpia recursos para no dejar workers huérfanos. El backend valida la salida estructurada antes de actuar. El worker transforma únicamente PCM en `transcript: string`; no puede producir `AssistantCommand`, `UmlCommand`, SQL, HTTP arbitrario, URLs, código ni mutaciones.

La interfaz del adaptador será runtime-neutral: audio entra a un `SpeechRecognitionAdapter` y su resultado es texto. Después de revisión explícita, el transcript usa los intérpretes textuales existentes: `AssistantCommand` sigue por validator/executor y las propuestas UML siguen por adaptación a `UmlCommand` y `UmlCommandBus`. El audio no produce comandos, HTTP arbitrario, SQL, código ni mutaciones directas.

Alternativa descartada: colocar Vosk en `assistant-core`. Mezclaría runtime y transporte con el lenguaje intermedio reutilizable. Alternativa descartada: `vosk` npm basado en `ffi-napi`/`ref-napi`, por el riesgo de compatibilidad y compilación nativa con Node 24 en Windows x64. Vosk WASM en navegador o nativo Android tampoco son la primera ruta porque duplicarían runtimes antes de demostrar la ruta mínima de host local.

### Modelo, audio y privacidad

El modelo español será una ruta local configurable mediante `modelPath`, fuera de Git y sin descarga automática ni resolución remota. El worker construirá el modelo solo desde esa ruta explícita, sin helpers de idioma, nombre, listado o descarga. Su ausencia bloquea reconocimiento de forma controlada, no el fallback textual. `vosk-model-small-es-0.42` puede usarse como candidato de smoke futuro, pero la selección definitiva requiere benchmark de Incremento 2.

El formato esperado inicial del worker es PCM signed 16-bit, mono y `sampleRate` de 16 kHz. Task 1.2 valida ese formato con modelo y fixture real; el benchmark posterior medirá precisión y rendimiento más ampliamente. El audio solo se procesa en host local o viaja por LAN al host configurado; no se envía a Internet ni se almacena permanentemente. Python no disponible o import Vosk fallido se mapean a `RUNTIME_NOT_AVAILABLE`; `modelPath` ausente o inexistente a `MODEL_NOT_FOUND`; audio inválido a `AUDIO_ERROR`; y fallos de modelo o recognizer a `RECOGNITION_ERROR`.

### Benchmark STT

El benchmark estará separado de `npm test` y usará corpus español ligero versionado, audio fixtures permitidos y golden transcripts. Cuando haya runtime/modelo medirá WER, command-success rate, latencia, RAM, tiempo de carga, ruido, velocidad, pronunciación y condiciones de micrófono. Si faltan runtime o modelo, registrará N/A y el bloqueo; nunca usará resultados del parser para fingir métricas Vosk. No invocará executor destructivo ni `UmlCommandBus`.

### Capacitor y Android

Antes de crear Android, una task comprobará si el frontend actual puede generar un artefacto web compatible con Capacitor. `webDir`, static export y rutas App Router se decidirán solo tras esa comprobación; no se presupone `frontend/out`. Capacitor y Android se configurarán después con host/puerto LAN explícitos, sin direcciones hardcodeadas. `RECORD_AUDIO` se solicitará después de interacción y los estados denegado/revocado conservan fallback textual.

El Incremento 3 requiere Android SDK, toolchain y un build Android real. Los mocks no permiten cerrar ese incremento. Los outputs Android, APK/AAB, estado Gradle local y modelos Vosk requerirán reglas `.gitignore` antes de introducirlos.

Alternativa descartada: empaquetar Android antes de validar build web. Ocultaría incompatibilidades de SSR, APIs browser-only y rutas dinámicas de Next.js.

## Risks / Trade-offs

- [Android SDK, adb y emulador no están disponibles] → Declarar prerequisito bloqueante y no cerrar Incremento 3 sin build real.
- [El modelo Vosk puede ser grande o incompatible] → Spike de provisión antes de descarga y protección Git previa.
- [Next App Router puede no exportar las rutas actuales] → Task de compatibilidad web previa, sin asumir static export.
- [Audio sobre LAN introduce latencia y exposición local] → Host/puerto configurables, errores estructurados y sin cloud ni persistencia.
- [Reconocimiento ambiguo] → Transcript revisable, fallback textual y confirmaciones existentes antes de cualquier efecto.

## Migration Plan

1. Añadir contratos STT y UI sin habilitar captura hasta que runtime/modelo configurados estén disponibles.
2. Integrar Vosk host con configuración local y validar fixtures antes de micrófono manual.
3. Medir benchmark, documentar límites y limpiar outputs temporales.
4. Validar empaquetado web, configurar Capacitor y Android, y ejecutar build real con toolchain disponible.

El rollback elimina contratos/UI nuevos, configuración Capacitor y proyecto Android; no requiere migración de datos, cambios a Domain Manifest v1 ni cambios al modelo canónico.
