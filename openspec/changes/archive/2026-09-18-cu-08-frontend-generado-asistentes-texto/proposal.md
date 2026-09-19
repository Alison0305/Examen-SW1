## Why

El backend generado ya publica CRUD, OpenAPI y el Domain Manifest v1, pero aún no existe una interfaz web generada que consuma esas capacidades ni una ruta segura para convertir texto en operaciones. CU-08 completa el resultado usable del Ciclo 3 sin alterar el contrato v1 ya producido.

## What Changes

- Incorporar el workspace `frontend-generator` para generar una aplicación Next.js App Router con Material UI a partir del `domain-manifest.json` v1 y de los contratos ya generados.
- Definir la responsabilidad de las fuentes: el generador proyecta metadatos en UI; la aplicación generada presenta y despacha acciones; `assistant-core` define, valida y ejecuta comandos; la integración CASE adapta intenciones UML a comandos existentes.
- Generar pantallas responsive de listado, detalle, creación y edición con búsqueda, filtros, paginación, ordenamiento, relaciones y estados de carga, error y vacío.
- Inferir controles UI determinísticamente desde tipos, obligatoriedad, identificadores, unicidad, relaciones y capacidades declaradas, sin ampliar `domain-manifest.json` v1.
- Para relaciones mutables contractuales, OpenAPI determina los campos CREATE/PATCH y el frontend usa un selector mínimo alimentado por el LIST existente del target, sin endpoint, dependencia ni cambio de Manifest nuevos.
- Incorporar el workspace `assistant-core` con un `AssistantCommand` cerrado, tipado e independiente de frases y URLs para `LIST`, `GET`, `SEARCH`, `CREATE`, `UPDATE`, `DELETE` y `COUNT`.
- Validar operaciones, entidades, campos, tipos, relaciones y capacidades contra el Domain Manifest antes de ejecutar; el executor solo podrá resolver llamadas permitidas hacia los contratos generados y no aceptará SQL, código ni URLs arbitrarias.
- Integrar texto para el editor CASE como propuestas de intención UML que se validan y se aplican exclusivamente mediante el `UmlCommandBus`; no se modifica directamente el modelo canónico ni el layout.
- Realizar un spike acotado de Qwen3 1.7B cuantizado que termina antes de descargar modelos, y definir/ejecutar un benchmark reproducible de comandos con métricas y resultados reales.

## Capabilities

### New Capabilities
- `generated-frontend`: Generación determinista de frontend CRUD desde el Domain Manifest v1 y contratos del backend generado.
- `assistant-core`: Lenguaje intermedio cerrado, validación y ejecución segura de acciones textuales declaradas.
- `case-text-assistant`: Adaptación segura de intenciones textuales UML al Command Bus existente del editor CASE.

### Modified Capabilities
- Ninguna.

## Impact

- Nuevos workspaces de código previstos: `frontend-generator` y `assistant-core`; la aplicación CASE solo recibe la integración mínima necesaria con su Command Bus existente.
- El `domain-manifest.json` v1, el backend Spring generado, OpenAPI y Postman no cambian de contrato en este CU.
- Se prevén plantillas Handlebars para el frontend y pruebas de generación, UI, validación, ejecución, integración CASE y benchmark; no se agregan dependencias ni se descargan modelos durante esta planificación.

## Validación Incremento 2

- El smoke manual del frontend generado validó LIST, GET, SEARCH, CREATE, UPDATE y COUNT contra el backend generado de fixture.
- DELETE se validó en dos fases: cancelar la confirmación no ejecutó IO destructivo y confirmar eliminó el registro temporal.
- `AssistantCommand` permanece semántico y Domain Manifest v1 no fue extendido. No existe parser de lenguaje natural ni integración Qwen en este incremento.

## Validación Incremento 3 — Task 3.1

- El parser estricto convierte únicamente `CREATE_CLASS`, `RENAME_CLASS` y `DELETE_CLASS` sin punto y coma en propuestas UML tipadas y revisables.
- La aprobación adapta la propuesta a `UmlCommand` existente y la ejecuta mediante el flujo CASE `applyCommand` y `UmlCommandBus`; conserva Undo/Redo sin mutar directamente `CanonicalUmlModel`, `ProjectDocument` ni `DiagramLayout`.
- Las propuestas inválidas y las propuestas válidas canceladas no mutan el proyecto. DELETE exige una segunda confirmación; cancelarla no muta y confirmarla elimina la clase, que Undo restaura.
- El Inspector expone el ID semántico de la clase como solo lectura para usar `targetId` sin DevTools.
- El smoke manual aprobado verificó CREATE, Undo/Redo, rechazo, cancelación, RENAME, DELETE con cancelación y confirmación, y restauración por Undo.
- `AssistantCommand` CRUD permanece separado, Domain Manifest v1 no cambió y todavía no existe integración ni descarga de Qwen.

## Validación Incremento 3 — Task 3.2

- El spike define `Qwen3` de `1.7B` cuantizado como objetivo local futuro mediante una configuración declarativa: runtime previsto `node-llama-cpp`, formato esperado `GGUF`, proveedor `none` y ruta local opcional.
- No se instaló `node-llama-cpp` ni otro runtime nativo, no se descargaron pesos, GGUF, safetensors o binarios, y no se agregó ningún proveedor remoto, URL, API key ni cliente HTTP de inferencia.
- La inspección local solo comprueba si la ruta configurada existe; sin ruta devuelve `NOT_CONFIGURED`, con ruta inexistente devuelve `MODEL_NOT_FOUND`, y una ruta existente queda en `RUNTIME_NOT_AVAILABLE`. No descarga ni ejecuta inferencia.
- La frontera `LocalTextModel` es neutral al runtime. El parser cerrado de salida estructurada acepta únicamente la forma de `AssistantCommand`, rechaza campos de transporte como URL y deja la autorización semántica a `validateAssistantCommand`.
- Para UML, cualquier salida futura sigue siendo una propuesta estructurada que pasa por revisión, adaptación a `UmlCommand` existente y `UmlCommandBus`; el modelo no puede ejecutar HTTP, SQL, código, filesystem ni mutaciones directamente.
- `.gitignore` ya protege `models/`, `*.gguf`, `*.onnx` y `*.safetensors`. La verificación del repositorio no encontró pesos ni binarios LLM.

## Validación Incremento 3 — Task 3.3

- Se ejecutó `npm run benchmark --workspace assistant-core` una vez, sin red, modelo, runtime nativo, proveedor remoto ni mutaciones. El corpus reproducible contiene 19 casos: 13 CRUD y 6 UML, con IDs estables, golden outputs estructurales y fixtures UML de UUID fijo.
- El runner evalúa únicamente parser/adaptador y validación dry-run: `AssistantCommand` pasa por `validateAssistantCommand`; las propuestas UML pasan por el parser existente y la verificación semántica de IDs sin invocar `UmlCommandBus`. DELETE nunca llega a HTTP ni muta documentos.
- El reporte real quedó en `assistant-core/.benchmark-output/` ignorado por Git. Registró 68.42% de validez estructurada, 100% de accuracy, 0 false positives, 47.37% de rechazo, 100% de rechazos correctos, p50 de 0.0279 ms, p95 de 0.3976 ms, RAM baseline de 44,306,432 bytes, pico de 44,347,392 bytes y delta de 40,960 bytes; no hubo fallos.
- El entorno medido fue Intel Core i5-10300H x64, 8,355,172,352 bytes de RAM total y 2,014,781,440 bytes libres al inicio. Qwen3 1.7B, node-llama-cpp y los pesos no estuvieron disponibles: inferencia Qwen, VRAM de inferencia, RAM de Qwen y model load time son N/A. Las métricas no se atribuyen a Qwen.

## Validación Final — Task 3.4

- Los gates raíz lint, typecheck, test y build, los tests de workspaces, el smoke del backend generado y `openspec validate cu-08-frontend-generado-asistentes-texto --type change --strict` aprobaron.
- El smoke del frontend generado aprobó en modo npm estrictamente offline (`npm_config_offline=true`, `npm_config_ignore_scripts=true`) usando paquetes ya presentes en caché local. Su output temporal `frontend-generator/.generated-assistant-smoke/` está ignorado y se limpia al finalizar.
- La app generada consume `assistant-core/dist/browser.js`, que excluye el spike y benchmark Node del bundle cliente. No se descargaron dependencias, modelos ni binarios, y no se añadió un provider remoto.
