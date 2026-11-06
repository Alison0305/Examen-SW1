## Context

CU-08 cerró sin implementar el runtime Qwen. El spike actual (`assistant-core/src/local-model-spike.ts`) solo define la interfaz `LocalTextModel` y devuelve siempre `RUNTIME_NOT_AVAILABLE`. El asistente UML del workspace y el panel del frontend generado solo aceptan gramática estricta. CU-09 (Vosk) ya entrega transcripts correctos, pero el texto natural se rechaza. Este correctivo implementa la inferencia real sin alterar los pipelines de validación y ejecución existentes.

## Goals / Non-Goals

**Goals:**

- Implementar `node-llama-cpp` con Qwen3 1.7B GGUF cuantizado exclusivamente en el backend NestJS.
- Crear un endpoint `POST /assistant/interpret` con modos aislados UML y data.
- Generar JSON Schema dinámico para restringir la salida del modelo a nombres válidos.
- Resolver propuestas UML por nombre sin que el modelo emita UUIDs.
- Integrar el endpoint en workspace CASE y frontend generado, con fallback a gramática estricta.
- Ejecutar benchmark real comparando cuantizaciones y GPU vs CPU.

**Non-Goals:**

- Nuevas operaciones UML más allá de CREATE_CLASS, RENAME_CLASS, DELETE_CLASS.
- Ejecutar LLM dentro del dispositivo Android (usa el host por LAN).
- Proveedores cloud ni API keys externas.
- Modificar Vosk, Spring, Domain Manifest v1 ni el schema de Prisma.
- CU-10 (XMI, visión) ni CU-11 (offline consolidado).

## Decisions

### node-llama-cpp vive solo en backend

El runtime nativo `node-llama-cpp` se instala únicamente en el workspace `backend`. El workspace `assistant-core` se usa también en el navegador (`browser.ts`) y debe permanecer como código puro TypeScript sin dependencias nativas. Por ello, `assistant-core` contendrá únicamente: construcción de prompts, construcción de JSON Schema y resolvedor por nombre. El backend importará `assistant-core` y agregará el runtime `LlamaTextModel` que implementa `LocalTextModel`.

Alternativa descartada: mover todo a `assistant-core`. Rompería el browser bundle y aumentaría el tamaño del frontend sin necesidad.

### Endpoint sin JWT, patrón de `/speech/recognize`

El endpoint `POST /assistant/interpret` no requiere autenticación JWT porque:
1. Sigue el mismo patrón de `/speech/recognize` (sin JWT, usable por LAN desde la app generada/Android).
2. No persiste datos, no muta el modelo UML ni ejecuta comandos directamente.
3. Solo propone; la aprobación y ejecución ocurren en el cliente autorizado.
4. Permite que la app generada Android invoque el intérprete por LAN sin requerir credenciales.

El CORS del backend ya permite `http://localhost` (WebView Capacitor).

### JSON Schema dinámico como gramática

`node-llama-cpp` soporta JSON Schema como restricción de salida. Construiremos un schema que:
- Para modo UML: `operation` enum `[CREATE_CLASS, RENAME_CLASS, DELETE_CLASS, UNSUPPORTED]`, `targetName` enum con los nombres de clases existentes, `className` para nuevas. Si la lista de clases está vacía, solo permite `CREATE_CLASS` y `UNSUPPORTED` (un enum vacío de `targetName` sería inválido).
- Para modo data: `entity` enum con entidades del manifest, `operation` enum con las 7 operaciones más `UNSUPPORTED`, campos como `oneOf` (una variante por entidad) donde cada variante lista las propiedades permitidas para esa entidad según el Domain Manifest.

La variante `UNSUPPORTED` es obligatoria: con gramática restringida, el modelo está forzado a producir una opción válida. Sin `UNSUPPORTED`, una frase como "hola cómo estás" terminaría convertida en un comando (falso positivo). Cuando el modelo emite `{ "operation": "UNSUPPORTED", "reason": "..." }`, el endpoint traduce a diagnóstico `OUT_OF_DOMAIN`, nunca a un comando ejecutable.

**Límite de tamaño del schema:** Si el manifest es grande (muchas entidades/campos), el schema JSON puede crecer significativamente. Se documenta un límite práctico basado en el tamaño máximo de grammar que `node-llama-cpp` puede procesar eficientemente. Si se excede, se puede segmentar por entidad o reducir el nivel de detalle de campos.

Esto elimina alucinaciones de nombres inexistentes a nivel de gramática. El validador existente se ejecuta como segunda línea de defensa.

### El modelo nunca emite UUIDs

Los UUIDs son internos al modelo canónico. El modelo LLM produce `targetName` (string legible). Un resolvedor determinista en `assistant-core` (`resolveUmlProposalByName`) busca el nombre en la lista de clases:
- Si hay exactamente una coincidencia exacta (case-insensitive), devuelve el `classId`.
- Si hay cero coincidencias, devuelve `NAME_NOT_FOUND`.
- Si hay múltiples coincidencias, devuelve `NAME_AMBIGUOUS`.

Para CREATE_CLASS, el resolvedor valida que el nombre no exista ya.

### Parámetros de muestreo deterministas

Para reproducibilidad:
- `temperature: 0` (greedy decoding).
- `top_p: 1`, `top_k: -1` (sin filtrado probabilístico).
- `/no_think` o mecanismo equivalente para desactivar el modo thinking de Qwen3.
- `seed` fijo opcional para benchmarks.

El modo thinking de Qwen3 (`/think`) produce tokens adicionales de razonamiento que no queremos. Se desactiva explícitamente.

### Singleton lazy con cola de concurrencia

El modelo se carga una vez al primer uso (singleton lazy) para evitar consumir 2-4 GB de VRAM/RAM si nadie usa el intérprete. Opcionalmente, se puede precargar al iniciar el servidor con una variable de entorno.

Solo una inferencia puede ejecutarse a la vez (limitación de `node-llama-cpp` con GPU). Las solicitudes adicionales entran en una cola. Si la cola supera un límite (configurable, default 5), se devuelve `BUSY`.

Se aplica límite de longitud del texto de entrada (configurable, default 500 caracteres) y timeout de inferencia (`ASSISTANT_TIMEOUT_MS`, default 30000 ms).

### Diagnósticos alineados con LocalTextModelStatus

Los diagnósticos del intérprete usan los estados existentes más nuevos según necesidad:
- `NOT_CONFIGURED`: `ASSISTANT_MODEL_PATH` no definido.
- `MODEL_NOT_FOUND`: el archivo no existe.
- `RUNTIME_NOT_AVAILABLE`: `node-llama-cpp` no puede cargar.
- `INVALID_OUTPUT`: el modelo produjo JSON inválido.
- `INFERENCE_ERROR`: error durante la inferencia.
- `TIMEOUT`: inferencia excedió el límite.
- `BUSY`: cola llena.
- `NAME_NOT_FOUND`, `NAME_AMBIGUOUS`: específicos del resolvedor UML.

### Fallback obligatorio

Si `ASSISTANT_MODEL_PATH` no está configurado o el modelo falla, la gramática estricta actual sigue funcionando. El flujo es:
1. ¿El texto coincide con gramática estricta? → Usar parser estricto, no llamar modelo.
2. ¿El modelo está disponible? → Llamar modelo.
3. Modelo no disponible → Intentar gramática estricta. Si falla → Error explicativo.

### Ubicación del benchmark con modelo real

La decisión 1 prohíbe `node-llama-cpp` en `assistant-core` (debe permanecer puro para el browser bundle). Por tanto:
- **Corpus y cálculo de métricas:** permanecen en `assistant-core/src/benchmark/` como funciones puras (definición de casos de prueba, cálculo de accuracy, parsing de resultados).
- **Runner con modelo real:** vive en backend (`backend/tools/benchmark-runner.ts` o script npm del workspace backend). El runner:
  - Importa el corpus y las funciones de métricas desde `assistant-core`.
  - Utiliza `LlamaTextModel` directamente (no por HTTP) para medir RAM, VRAM, tiempo de carga y latencia del propio proceso.
  - Genera un reporte con todas las métricas requeridas por AGENTS.md §18.

Esta separación permite que `assistant-core` siga siendo un bundle ligero para el navegador mientras el benchmark real se ejecuta en el entorno del servidor.

### Discrepancia Node 24 LTS vs Node v26.13.0

AGENTS.md especifica Node.js 24 LTS. El entorno actual reporta Node v26.13.0. `node-llama-cpp` debe verificar compatibilidad con ambas versiones. Este riesgo se documenta y se verifica durante la implementación del Incremento 1. Si hay incompatibilidad, se evalúa como bloqueante.

## Risks / Trade-offs

- [Incompatibilidad node-llama-cpp con Node v26] → Verificar antes de instalar; si falla, documentar y escalar.
- [GPU NVIDIA no detectada] → Soportar fallback a CPU con degradación de latencia documentada.
- [Modelo grande (2-4 GB)] → No commitear; documentar descarga manual; lazy loading.
- [Latencia de primera inferencia] → Lazy load + timeout apropiado; precarga opcional.
- [Alucinaciones del modelo] → JSON Schema dinámico + validador existente + aprobación humana.
- [Ambigüedad de nombres de clases] → Rechazar explícitamente; no adivinar.

## Migration Plan

1. Descargar modelo GGUF y configurar `ASSISTANT_MODEL_PATH` en `.env` (prerequisito para tests reales).
2. Instalar `node-llama-cpp` en backend con versión exacta; verificar compatibilidad Node y CUDA.
3. Implementar funciones puras en `assistant-core`: schemas (con `UNSUPPORTED`), prompts (con ejemplos de rechazo), resolvedor.
4. Implementar `LlamaTextModel` en backend con singleton, cola y diagnósticos.
5. Implementar `AssistantInterpretController` con endpoint y dos modos.
6. Verificar CORS para frontend generado en navegador de escritorio.
7. Agregar tests unitarios con modelo fake y tests de integración que se saltan si falta modelo.
8. Integrar en workspace CASE: enviar texto natural al endpoint, mostrar propuesta.
9. Integrar en frontend generado: enviar texto natural al endpoint, mostrar propuesta.
10. Implementar corpus ampliado en `assistant-core` (incluyendo frases fuera de dominio).
11. Implementar runner de benchmark en `backend/tools/` usando `LlamaTextModel` directamente.
12. Ejecutar benchmark real con modelo, comparar configuraciones.
13. Documentar en CU-08, actualizar STATUS.md.

Rollback: desinstalar `node-llama-cpp` del backend; los fallbacks a gramática estricta permanecen operativos.

## Notas de implementación (Incremento 1)

- `LlamaTextModel` se implementó como dos piezas: `NodeLlamaCppEngine` (carga perezosa del runtime y una generación con gramática) y `QueuedLocalTextModel` (implementa `LocalTextModel`; cola, `BUSY` y `TIMEOUT`). Así la concurrencia y los límites se prueban sin el runtime nativo.
- `node-llama-cpp` 3.22.2 es ESM con top-level await; el backend CommonJS lo carga con `import()` dinámico.
- `ASSISTANT_GPU` admite `auto | vulkan | cuda | cpu`. En el equipo de desarrollo CUDA no está disponible (driver sin CUDA runtime) y `auto` selecciona Vulkan sobre la GTX 1660 SUPER.
- Variables adicionales: `ASSISTANT_MAX_QUEUE` (por defecto 5) y `ASSISTANT_PRELOAD` (por defecto `false`).
- El frontend generado en navegador de escritorio (`next dev`) usa un origen no permitido por CORS; Android usa `http://localhost`, que sí está permitido. Es la misma limitación que ya tenía `/speech/recognize`.
