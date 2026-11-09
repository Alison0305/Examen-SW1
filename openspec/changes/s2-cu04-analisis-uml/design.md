## Context

CU-2P-01 dejó en `main` un runtime de texto local compartido: `AssistantModule` exporta `ASSISTANT_LOCAL_MODEL` (`QueuedLocalTextModel | undefined`) con `generateText({ systemPrompt, userPrompt }): Promise<string>`, una sola secuencia, `temperature: 0`, cola con `maxQueue` 5 y timeout de 30 s por defecto, `contextSize` 4096 y 256 tokens de salida.

El repositorio ya dispone del modelo canónico (`CanonicalUmlModel`), de su validador (`validateCanonicalUmlModel`) y del mapper relacional (`mapToRelationalModel`). CU-2P-04 los reutiliza y no duplica sus reglas.

## Goals / Non-Goals

**Goals:**

- Explicar una clase, una relación o el modelo completo de un proyecto autorizado, incluido VIEWER.
- Determinar sin IA qué existe, sus multiplicidades, dónde está cada FK, su nulabilidad, las tablas intermedias, los diagnósticos y lo que ShareGrams no soporta.
- Usar la IA solo para explicar, resumir y formular observaciones identificadas como tales.
- Reutilizar el mismo Qwen local que CU-2P-01, sin crear otra instancia.

**Non-Goals:**

- Modificar el modelo, proponer o aplicar cambios (CU-2P-06), historial (CU-2P-07) o memoria (CU-2P-03).
- Aceptar texto libre del usuario en esta versión: el disparador es la selección.
- Corregir defectos de `relational-core` o del `DtoValidationPipe` compartido.

## Decisions

### Pipeline

```text
UmlAnalysisController            POST /projects/:id/mentor/analysis
        ↓
UmlAnalysisService               requireView → findProject → contexto → prompt → proveedor
        ↓
buildUmlAnalysisContext
        ├── buildUmlAnalysisFragment     (primero; si falla, no se ejecuta nada más)
        ├── validateCanonicalUmlModel
        ├── mapToRelationalModel         (una vez, sobre el modelo completo)
        └── buildRelationalFacts
        ↓
buildUmlAnalysisPrompt           (proyección compacta; ready | too-large)
        ↓
UML_ANALYSIS_AI_PROVIDER
        ↓
LocalQwenUmlAnalysisProvider
        ↓
ASSISTANT_LOCAL_MODEL            (singleton compartido con CU-2P-01 y CU-08)
        ↓
Qwen3 local
```

`mapToRelationalModel` valida internamente el modelo para emitir sus diagnósticos `REL_UML_*`; por eso hay dos llamadas a `validateCanonicalUmlModel` por solicitud, una de ellas dentro del mapper. El contexto descarta los `REL_UML_*`: el validador canónico es la única fuente de diagnósticos UML.

### Contexto determinista

- `uml-analysis-fragment`: fragmento serializable del foco. Conserva multiplicidades sin asumir 1, roles semánticos (hija/padre, todo/parte), referencias rotas e identificadores; nunca resuelve un elemento por nombre.
- `relational-facts`: lee el resultado del mapper y lo correlaciona por `SourceReference.elementId`. Organiza FK, tablas intermedias, tablas de clase asociativa y herencia JOINED; procesa resultados parciales con `success === false`; señala multiplicidades que el esquema no garantiza (`MINIMUM_MULTIPLICITY_NOT_ENFORCED`, `MAXIMUM_MULTIPLICITY_NOT_ENFORCED`) y detecta columnas FK duplicadas (`DUPLICATE_FOREIGN_KEY_COLUMN`).
- `uml-analysis-context`: separa hechos, diagnósticos (`uml` y `relational`), conflictos y limitaciones (`unsupportedFeatures`, `editor`, `schema`), con un resumen `hasUmlErrors`, `hasRelationalErrors` y `relationalDerivable`. Un relacional no derivable no invalida el análisis UML.

### Multiplicidades

La multiplicidad escrita junto a un extremo cuenta instancias de ese extremo por cada instancia del opuesto. Para `Cliente` (source, `sourceMultiplicity = 1`) y `Pedido` (target, `targetMultiplicity = 0..*`), el prompt contiene:

```text
Asociación: Cliente [1] — [0..*] Pedido.
Por cada Cliente: 0..* Pedido.
Por cada Pedido: 1 Cliente.
```

Las frases se derivan del fragmento, nunca de la orientación gráfica. Invertir source y target conserva los mismos hechos físicos (FK `pedido.cliente_id`).

### Prompt compacto y presupuesto

`MAX_PROMPT_CHARACTERS = 8960 = (4096 contexto − 256 salida − 256 plantilla y margen) × 2,5 caracteres por token`, para el system prompt y el user prompt juntos. Es una aproximación conservadora, no una medición con el tokenizer real de Qwen; usar el tokenizer queda como refinamiento futuro. Una prueba mantiene las constantes alineadas con `getAssistantConfig()`.

El prompt usa nombres en lugar de UUID (un UUID solo distingue dos elementos homónimos), bloques fijos (FOCO, ESTADO, HECHOS UML, HECHOS RELACIONALES, DIAGNÓSTICOS, CONFLICTOS, LIMITACIONES, RECORTE) y un system prompt fijo que pide español, máximo 120 palabras, no inventar ni contradecir hechos, y marcar las sugerencias con `Observación:`.

Prioridades:

```text
P0  foco, extremos, multiplicidades, hechos relacionales vinculados, diagnósticos,
    conflictos y limitaciones directamente relevantes        → nunca se recorta
P1  atributos de clases relacionadas / encabezados de clase (modelo)
P2  relaciones y clases adicionales (modelo completo)
P3  catálogo general de características no soportadas
```

Si no cabe todo, se recorta en orden P3 → P2 → P1, se declara en `contextTruncation` y en el bloque RECORTE. Si P0 no cabe, el resultado es `too-large` con `CONTEXT_TOO_LARGE` y no se llama a Qwen.

### Proveedor y singleton compartido

`UmlAnalysisAiProvider.explain({ systemPrompt, userPrompt })` es la frontera propia de CU-2P-04; no reutiliza `MENTOR_AI_PROVIDER`, que pertenece a CU-2P-01 y usa otro contexto y otro prompt. `LocalQwenUmlAnalysisProvider` entrega exactamente los dos prompts a `generateText`, valida la salida (`INVALID_OUTPUT`) y envuelve los fallos (`GENERATION_FAILED`) sin reintentos.

`MentorAnalysisModule` importa `AssistantModule`, `AuthModule` y `ProjectsPersistenceModule`, no `MentorModule`. Registra `UML_ANALYSIS_AI_PROVIDER` con un factory inyectado con `ASSISTANT_LOCAL_MODEL`; el `QueuedLocalTextModel` compartido satisface estructuralmente `UmlAnalysisTextGenerator` y se pasa sin adaptador. Si `ASSISTANT_MODEL_PATH` no está configurado, el factory usa un generador que rechaza con `LocalModelError("NOT_CONFIGURED")`, que termina en 503. Una prueba de módulo verifica que el factory del modelo se ejecuta una sola vez y que CU-2P-01, CU-2P-04 y el intérprete de CU-08 reciben la misma instancia.

### Seguridad

- JWT obligatorio (`JwtAuthGuard`) y `requireView` antes de cargar el proyecto; VIEWER puede analizar; sin acceso, 404.
- El proyecto y su UML se cargan solo en el servidor; el cliente envía únicamente el foco. `userId` sale del token, `projectId` de la ruta (`ParseUUIDPipe`); el DTO rechaza propiedades adicionales.
- Sin persistencia, sin comandos UML y sin ejecución de código, SQL o endpoints a partir de la respuesta de la IA.
- `UmlAnalysisBodyPipe` rechaza con 400 un cuerpo que no es objeto antes de delegar en el `DtoValidationPipe` compartido.

### Modelo de respuesta y errores

Respuesta `200`: `projectRevision`, `focus` (`kind`, `id`, `name` de presentación), `analysis` (hechos, diagnósticos, conflictos, limitaciones, resumen) y `explanation` (`text`, `contextTruncation`), siempre separados, más `diagnostic` opcional.

| Situación | HTTP | `analysis` | `explanation` | `diagnostic` |
|---|---|---|---|---|
| Análisis completo | 200 | sí | sí | — |
| Modelo vacío | 200 | null | null | `EMPTY_MODEL` |
| Clase o relación inexistente | 200 | null | null | `ELEMENT_NOT_FOUND` |
| ID de foco inválido | 200 | null | null | `INVALID_FOCUS_ID` |
| Extremo inexistente | 200 | null | null | `INCONSISTENT_REFERENCE` |
| P0 no cabe en el prompt | 200 | sí | null | `CONTEXT_TOO_LARGE` |
| Cuerpo inválido | 400 | — | — | — |
| Sin token | 401 | — | — | — |
| Sin acceso o proyecto inexistente | 404 | — | — | — |
| Documento persistido inválido | 422 | — | — | — |
| Mentor IA no configurado o con fallo | 503 | — | — | — |

El 503 tiene el mismo cuerpo que CU-2P-01: `{ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." }`; la causa se conserva en la excepción, no en el cuerpo.

### Frontend

El panel Mentor IA tiene dos funciones independientes: la consulta libre (CU-2P-01) y la sección "Análisis UML" (CU-2P-04), con estados de carga y error separados. "Explicar selección" admite clase y relación; con una enumeración o sin selección queda deshabilitado con un mensaje. "Explicar modelo" siempre está disponible. El resultado se titula con el foco que devolvió el servidor, muestra la explicación como texto plano, el diagnóstico, el aviso de contexto resumido y hasta seis observaciones deterministas. No hay acciones para aplicar o modificar el modelo.

## Risks / Trade-offs

- Qwen3 1.7B puede contradecir hechos aunque el prompt los contenga. Mitigación: frases direccionales precalculadas, temperatura 0 y suite real con invariantes semánticos; pendiente de ejecución con el modelo.
- El presupuesto en caracteres es una estimación; un tokenizer real podría permitir más contexto o exigir menos.
- Con 256 tokens de salida, la explicación del modelo completo es necesariamente breve.
- La cola es compartida con CU-08 y CU-2P-01: bajo carga se obtiene `BUSY`, que termina en 503.
- Las enumeraciones no se analizan individualmente.
