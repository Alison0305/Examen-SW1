## 1. Incremento 1 - STT local y frontera de transcript

- [x] 1.1 Definir en `backend/` el contrato runtime-neutral de reconocimiento, sus estados, diagnósticos y configuración local de modelo español sin auto-download; verificar unitariamente ausencia de ruta/configuración y errores `MODEL_NOT_FOUND` y `RUNTIME_NOT_AVAILABLE`.
- [x] 1.2 Integrar el worker Python Vosk local del host con `vosk==0.3.45`, `pythonExecutable`, `modelPath` y `sampleRate` configurables, `child_process.spawn` seguro, entrada PCM mono, transcript estructurado, cancelación y diagnósticos de audio/reconocimiento sin exponer transporte arbitrario; verificar mediante fixtures y que no existe provider cloud, descarga, resolución remota de modelos ni persistencia de audio.
- [x] 1.3 Incorporar en frontend principal y generado captura iniciada por usuario, detener/cancelar, transcript visible y revisable, manejo de permiso denegado/revocado y fallback textual; verificar con React Testing Library los estados sin requerir micrófono real.
- [x] 1.4 Conectar solamente transcripts aprobados al pipeline textual existente de datos o UML; verificar integración sin ejecución directa, DELETE con confirmación, DeleteClass con confirmación separada y smoke manual web de micrófono, revisión y cancelación.

## 2. Incremento 2 - Corpus y benchmark STT

- [x] 2.1 Crear corpus español ligero reproducible con fixtures de audio permitidos, transcripts golden y condiciones de ruido, velocidad y pronunciación; verificar IDs estables, ausencia de modelos pesados y que el runner no efectúa DELETE, HTTP destructivo ni Command Bus.
- [x] 2.2 Implementar y ejecutar un runner STT separado de `npm test`; verificar reporte de WER, command-success rate, latencia, RAM, carga, hardware y fallos reales, o N/A/bloqueo explícito si Vosk/modelo no están disponibles.

## 3. Incremento 3 - Capacitor, Android y LAN

- [x] 3.1 Evaluar y adaptar el build web de Next.js para Capacitor, resolviendo rutas App Router, APIs browser-only y `webDir` antes de crear Android; verificar el artefacto web compatible sin asumir static export.
- [x] 3.2 Agregar Capacitor y el proyecto Android con `RECORD_AUDIO`, solicitud de permiso tras interacción, configuración LAN host/puerto sin hardcodes y errores de host no disponible; verificar configuración, tests de cliente y fallback textual.
- [x] 3.3 Ejecutar build Android real cuando Android SDK y toolchain estén disponibles; verificar que no se cierra este incremento con mocks, que outputs/modelos/estado Gradle están ignorados y que no se versionan APK/AAB ni pesos.
- [x] 3.4 Ejecutar gates relevantes, validación OpenSpec strict, smoke manual Android con micrófono/LAN/sin Internet y documentación fiel de CU-09; verificar build Android, permisos concedido/denegado/revocado, transcript, confirmaciones destructivas y `docs/STATUS.md`/handoff antes del cierre.
