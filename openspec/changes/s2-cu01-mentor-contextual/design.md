## Context

CU-08 ya dispone de Qwen3 1.7B local con `node-llama-cpp`, pero su interfaz solo acepta prompts con JSON Schema y devuelve propuestas estructuradas para comandos UML/datos. No existe proveedor, API, variable de entorno, adaptador ni endpoint de Claude/Anthropic. CU-2P-01 requiere una respuesta textual fundamentada en el proyecto autorizado.

## Goals / Non-Goals

**Goals:**

- Consultar el mentor desde un proyecto autorizado, incluyendo OWNER, EDITOR y VIEWER.
- Construir contexto exclusivamente desde `ProjectDocument.uml` y la revisión persistida.
- Responder con un contrato pequeño: `answer`, `grounded`, `projectRevision` y `diagnostic` opcional.
- Reutilizar de forma segura el runtime local configurado mediante una frontera de proveedor.
- Registrar la interacción completada mediante un contrato reemplazable.

**Non-Goals:**

- Claude, Anthropic, APIs cloud, dependencias nuevas, claves o cambios en `.env`.
- Persistencia de historial o memoria, identidad avanzada, análisis UML, propuestas o mutaciones.
- Cambios en CU-08/CU-09, CU-10, Prisma, el diagrama o `DiagramLayout`.

## Decisions

### Authorization precedes project loading

`MentorService` recibe `projectId`, `userId` y pregunta. Primero llama `ProjectAccessService.requireView`; solo después carga el proyecto con `ProjectsPersistenceService`. Por tanto, un usuario sin acceso obtiene el mismo `404` que un proyecto inexistente y nunca obtiene el contexto.

### Deterministic semantic context

`MentorContextBuilder` proyecta `project.name`, `project.revision`, clases, atributos (nombre, tipo y multiplicidad), enumeraciones y relaciones. Las multiplicidades de una relación se normalizan en dos enunciados direccionales: cada uno expresa cuántas instancias del extremo opuesto se relacionan con una instancia del sujeto, sin depender de que el modelo interprete las etiquetas de extremos UML. Los ids internos, layout, timestamps, propietario, membresías, secretos y cualquier otro dato se excluyen. Las listas se ordenan por nombre para hacer el contexto estable y se acotan para conservar el límite del runtime local.

### Provider boundary and local Qwen adapter

`MentorAiProvider.ask(context, question)` es una frontera propia de Mentor. `LocalQwenMentorProvider` adapta el modelo local existente; no depende el servicio de `node-llama-cpp`. El engine y su cola añaden una generación textual serializada, con el mismo timeout/cola del runtime de CU-08. La ruta `/assistant/interpret` conserva JSON Schema y no cambia.

El prompt exige responder solo con el contexto, no inventar elementos ausentes e indicar insuficiencia. El servicio evita llamar al proveedor si no hay clases y detecta menciones inequívocas de una clase inexistente.

### Interaction recorder is intentionally ephemeral

`MentorInteractionRecorder.record(interaction)` recibe proyecto, usuario, revisión, pregunta y respuesta completada. El adaptador inicial es no-op para no crear una segunda fuente de verdad antes de CU-2P-03/CU-2P-07. Puede reemplazarse por Prisma sin cambiar `MentorService`.

### HTTP and UI contract

La ruta protegida recibe solamente `{ "question": string }`, con trim y máximo de 500 caracteres. La respuesta es:

```ts
type MentorQueryResponse = {
  answer: string;
  grounded: boolean;
  projectRevision: number;
  diagnostic?: "INSUFFICIENT_CONTEXT" | "ELEMENT_NOT_FOUND";
};
```

Los errores de proveedor se traducen a `503 Service Unavailable`; entradas inválidas a `400`. El frontend muestra el panel solo desde `/projects/:id/workspace`, usa el `ApiClient` autenticado y nunca envía el documento desde el navegador.

## Risks / Trade-offs

- Sin modelo local configurado, RF-03 no puede producir una respuesta IA; la API devuelve un error controlado y la UI lo informa. No se añade un proveedor cloud como sustituto.
- La detección de elementos inexistentes es deliberadamente conservadora: solo nombres con formato de identificador y coincidencia clara. Las preguntas generales se delegan al proveedor.
- El contexto se limita para proteger el runtime de 4096 tokens; modelos muy grandes pueden requerir segmentación en un CU posterior.
