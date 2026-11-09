# CU-2P-01 - Consultar al Mentor IA con contexto del proyecto

## Estado

Segundo parcial. Cierre técnico automatizado completado; pendiente de prueba manual con Qwen, revisión del compañero y del usuario, aceptación, archivado y commit. No altera el historial ni el estado de CU-10 del primer parcial.

## Objetivo

Permitir una consulta al Mentor IA desde el workspace de un proyecto autorizado, usando únicamente el contexto semántico vigente de su `ProjectDocument`.

## Alcance

- RF-01: acceso desde el proyecto activo.
- RF-02: contexto técnico autorizado antes de la consulta.
- RF-03: pregunta y contexto al proveedor configurado con respuesta contextual.
- RF-04: diagnóstico claro si el modelo no aporta información suficiente.

## Auditoría Inicial De IA

No existe integración runtime de Claude/Anthropic en el repositorio: no hay dependencias, variables, servicios, adaptadores ni endpoints de ese proveedor. Las dos menciones a Claude describen la herramienta usada durante desarrollo, no una API de producción.

La integración real es Qwen3 1.7B GGUF local mediante `node-llama-cpp`, expuesta por `POST /assistant/interpret` para salidas JSON restringidas de CU-08/CU-09. CU-2P-01 reutiliza ese runtime solo detrás de una frontera nueva de proveedor textual y no cambia ese endpoint ni sus pipelines de comandos.

## Decisiones

- La autorización `requireView` ocurre antes de cargar el proyecto; VIEWER puede consultar.
- `CanonicalUmlModel` es la fuente del contexto; `DiagramLayout` no participa.
- El registrador inicial no persiste memoria ni historial; CU-2P-03/CU-2P-07 podrán sustituirlo.
- No se agregan proveedores cloud, secretos, migraciones Prisma ni mutaciones UML.

## Implementación Realizada

- `backend/src/mentor/` contiene el controlador JWT `POST /projects/:id/mentor/query`, el servicio, el constructor de contexto, los contratos de proveedor/registro y el adaptador Qwen local.
- La consulta primero llama `ProjectAccessService.requireView`; solo después carga el documento. OWNER, EDITOR y VIEWER pueden consultar. Sin acceso se conserva el `404` y no se lee el documento.
- El contexto ordenado contiene nombre y revisión del proyecto, clases, atributos, tipos, enumeraciones y relaciones con multiplicidades normalizadas en ambos sentidos. Para evitar invertir la semántica UML, cada enunciado expresa las instancias del extremo opuesto por cada instancia del sujeto. Excluye ids, layout, membresías, credenciales y otros proyectos.
- Proyectos sin clases y referencias explícitas a clases ausentes devuelven una respuesta determinista fundamentada sin invocar el proveedor.
- El runtime de CU-08 conserva su generación JSON restringida y suma generación textual serializada para `LocalQwenMentorProvider`.
- `MentorModule` importa `AuthModule` para resolver `JwtAuthGuard` sin dependencia circular. `MentorService` traduce cualquier fallo de proveedor a `503` sin filtrar detalles internos.
- El registrador inicial es efímero/no-op: su interfaz recibe proyecto, usuario, revisión, pregunta y respuesta y puede sustituirse por persistencia en CU-2P-03/CU-2P-07.
- El panel `Mentor IA` vive dentro de `/projects/:id/workspace`; muestra carga, respuesta, insuficiencia y error, y nunca envía el documento desde el cliente.

## Contrato

Solicitud: `POST /projects/:id/mentor/query` con JWT Bearer y `{ "question": string }` entre 1 y 500 caracteres tras trim.

Respuesta exitosa: `answer`, `grounded`, `projectRevision` y `diagnostic` opcional (`INSUFFICIENT_CONTEXT` o `ELEMENT_NOT_FOUND`).

## Pruebas Y Evidencia

- `npm run lint`, `npm run typecheck` y `npm run build`: correctos en la raíz.
- `npm run test`: 516 correctas y 8 omitidas en los workspaces. Frontend 173/173; backend 104/104, con 5 Qwen y 3 Vosk reales omitidas.
- `npx vitest run src/mentor`: 12/12 pruebas correctas, incluida integración HTTP, acceso previo a carga, error de proveedor seguro y multiplicidades direccionales.
- `npm run test --workspace backend -- --run src/assistant`: 18 correctas; 5 de runtime real omitidas.
- `npm run test --workspace frontend -- --run app/workspace/mentor-panel.test.tsx app/auth/auth.test.tsx`: 17/17 correctas.
- `npm run test --workspace @examen-sw1/spring-generator`: 57/57 correctas.
- `openspec validate s2-cu01-mentor-contextual --strict`: correcto.

## Estado De RF

- RF-01: implementado y cubierto automáticamente mediante el panel del workspace, `ApiClient` autenticado y ruta JWT.
- RF-02: implementado y cubierto automáticamente: `requireView` precede la carga y el contexto usa solo `ProjectDocument.uml`.
- RF-03: implementado y cubierto con proveedor simulado, cola compartida y regresiones de Assistant. La inferencia real Qwen no quedó validada: el test real fue omitido (5/5).
- RF-04: implementado y cubierto automáticamente para modelo vacío, elemento explícitamente inexistente y fallo del proveedor.

## Limitaciones

- No se aprobó la prueba manual: falta contrastar dos proyectos con modelos distintos y consultar una clase inexistente con Qwen real.
- La comprobación de `process.env.ASSISTANT_MODEL_PATH` estuvo disponible en el proceso de esta sesión, pero `npx vitest run src/assistant/node-llama-cpp.real.integration.test.ts` se omitió 5/5; no se fabricó resultado de inferencia real.
- El panel muestra texto plano. Las marcas Markdown del proveedor, como `**`, no se renderizan; incorporar un renderer Markdown sanitizado se difiere para no ampliar este CU con una dependencia o política de renderizado nueva.

## Correcciones Posteriores

- Se corrigió la proyección de multiplicidades de asociaciones: el contexto ahora expresa ambos sentidos con la multiplicidad del extremo opuesto, evitando invertir relaciones uno a muchos.
