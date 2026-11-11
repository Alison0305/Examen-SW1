## 1. Contrato y OpenSpec

- [x] 1.1 Crear el cambio OpenSpec `s2-cu07-historial-compartido` (proposal, design, spec `mentor-shared-history`, tasks) a partir del issue #7 y de la auditoría de CU-2P-01/02/03.
- [x] 1.2 Definir contratos en `backend/src/mentor-history/mentor-history.contracts.ts`: límites, consulta cruda y normalizada, errores, DTO público, `MentorHistoryRecord` y puerto `MentorHistoryReader`.
- [x] 1.3 Implementar cursor opaco (`encodeHistoryCursor`/`decodeHistoryCursor`), parser de consulta (`parseMentorHistoryQuery`) y ensamblado de página (`toMentorHistoryItem`/`toMentorHistoryPage`) como funciones puras.
- [x] 1.4 Cubrir con pruebas unitarias sin base de datos: roundtrip, cursor inválido por motivo, `limit`, búsqueda, parámetros desconocidos, DTO sin campos internos, recorrido keyset sin duplicados e independencia de Qwen (29 pruebas).

## 2. Persistencia paginada

- [x] 2.1 Implementar el lector Prisma de `MENTOR_HISTORY_READER` sobre `MentorInteraction`: filtro por `projectId`, keyset `occurredAt DESC, id DESC`, `take: limit + 1`, búsqueda sin distinguir mayúsculas en pregunta o respuesta con `%`, `_` y `\` escapados, selección solo de `MentorHistoryRecord` (`PrismaMentorHistoryReader`, 6 pruebas unitarias de la consulta).
- [x] 2.2 Pruebas de integración PostgreSQL: vacío, una fila, orden, empates de fecha, orden UUID, `limit + 1`, recorrido 7/2 sin duplicados, búsqueda por pregunta y por respuesta, mayúsculas y acentos, `%`/`_`/`\` literales, búsqueda paginada, aislamiento A/B, cursor de A en B, cursor con otra búsqueda y lectura sin modelo local (20 pruebas, fixtures propios con limpieza acotada).

## 3. Servicio y autorización

- [x] 3.1 Implementar `MentorHistoryService.list(projectId, userId, rawQuery)`: `requireView` → `parseMentorHistoryQuery` → `MENTOR_HISTORY_READER`, con resultado `MentorHistoryListResult`, y `MentorHistoryModule` mínimo (importa solo `ProjectsPersistenceModule`; reader Prisma detrás del puerto; sin `AssistantModule`, sin controlador y aún sin registrar en `AppModule`).
- [x] 3.2 Pruebas: orden observable, consulta inválida sin lectura, 404 propagado sin lectura (también con consulta malformada), fallo del reader propagado, historial vacío, wiring/DI del módulo y, con PostgreSQL y `ProjectAccessService` reales, OWNER, EDITOR y VIEWER ven el historial compartido, usuario externo y proyecto inexistente reciben 404 sin lectura, y funcionamiento sin `ASSISTANT_MODEL_PATH` (29 pruebas).

## 4. Controlador y DTO HTTP

- [x] 4.1 Implementar `GET /projects/:id/mentor/history` con `JwtAuthGuard`, `ParseUUIDPipe` y `parseMentorHistoryQuery`, y mapear los errores de contrato a 400 (`{ statusCode, error, code, reason?, message }`). `MentorHistoryController` pasa la query cruda sin DTO duplicado; 404 y errores inesperados se propagan sin capturar.
- [x] 4.2 Registrar `MentorHistoryController` en `MentorHistoryModule` (con `AuthModule`, necesario para `JwtAuthGuard`) y `MentorHistoryModule` en `AppModule`, sin importar `AssistantModule`.
- [x] 4.3 Pruebas HTTP sin base de datos, con JWT, guard, `ParseUUIDPipe`, `ValidationPipe` global, controlador, servicio y lector reales: 200 (vacío, elementos, `limit`, cursor y búsqueda), 400 (UUID, `limit` 0/51/1.5/repetido, `q` vacío/espacios/201/repetido, cursor con `reason`, parámetros desconocidos), 401 sin servicio, 404 externo e inexistente, aislamiento, VIEWER ve a OWNER, sin campos internos, 500 genérico y sin Qwen (32 pruebas); controlador unitario (12) y wiring del módulo (6).
- [x] 4.4 Ejecutar contra PostgreSQL la integración HTTP con `createApp()`, usuarios reales registrados por `/auth/register` y `ProjectAccessService` real (`mentor-history.controller.integration.test.ts`, 19 pruebas, escrita en la fase 4 sin ejecutar por falta de base de datos en ese equipo). Ejecutada el 2026-11-10 en la PC con `backend/.env` y PostgreSQL, tras integrar CU-2P-06 (`e67bbe6`): 19/19 correctas; `src/mentor-history` completo 150/150.

## 5. Pruebas multiusuario

- [x] 5.1 Integración: A consulta y B (EDITOR o VIEWER) ve la interacción con A como autor; un tercero sin acceso recibe 404; otro proyecto no ve Q1/Q2. Hecho en `mentor-history.e2e.integration.test.ts` (6 pruebas, PostgreSQL real, 2026-11-10): `AppModule` completo con JWT real, `POST /mentor/query` → `MentorService.query` y recorder reales → `GET /mentor/history`, con un proveedor del Mentor determinista y sin modelo local. A (OWNER) crea exactamente una interacción; B (EDITOR) la ve con autor, pregunta, respuesta y fecha y solo el DTO público; el orden con dos autores es el esperado; C (ajeno) y un proyecto inexistente reciben el mismo 404 sin ejecutar el reader; el proyecto B no ve nada de A y A recibe 404 en B; ninguna lectura invoca el modelo local ni el proveedor. Fixtures propios eliminados (0 usuarios, 0 proyectos y 0 interacciones).

## 6. Frontend

- [x] 6.1 Añadir `getMentorHistory(id, { limit?, cursor?, q? })` en `frontend/app/auth/api.ts` con los tipos públicos `MentorHistoryItem`, `MentorHistoryPage` y `MentorHistoryParams`. La query se construye con `URLSearchParams`, solo con valores presentes y sin `q` vacío (18 pruebas).
- [x] 6.2 Añadir `MentorHistorySection` (`frontend/app/workspace/mentor-history-section.tsx`) dentro de `MentorPanel`:
  - plegable, con carga al abrir;
  - búsqueda en el servidor con espera de 400 ms;
  - lista con autor, fecha y pregunta, y respuesta desplegable;
  - «Cargar más» con cursor y búsqueda, y sin duplicados por `id`;
  - «Actualizar»;
  - estados vacío, carga y error;
  - refresco tras una consulta correcta del Mentor;
  - descarte de respuestas obsoletas;
  - reinicio al cambiar de proyecto (`key`).
- [x] 6.3 Pruebas de interfaz con React Testing Library (28 pruebas: 23 de la sección y 5 de su integración en `MentorPanel`), sin romper CU-2P-01 ni CU-2P-04.

## 7. Documentación y smoke test

- [ ] 7.1 Crear `docs/puds/use-cases/CU-2P-07-historial-compartido.md` y actualizar STATUS y HANDOFF con la implementación real.
- [ ] 7.2 Ejecutar lint, typecheck y suites; smoke test con dos usuarios del mismo proyecto y un tercero sin acceso.
- [ ] 7.3 Revisión del compañero, PR con `Closes #7`, aceptación y archivo del OpenSpec.

## 8. Integración con CU-2P-06

- [x] 8.1 Mostrar el estado público de las propuestas UML del proyecto: ruta de lectura de CU-2P-07 sobre `MentorProposalHistoryService` (sin leer `MentorProposal` ni duplicar la proyección o el servicio, y sin modificar CU-2P-06), representación pública de `MentorProposalHistoryProjection` (operación, estado, diff, revisión base, revisión resultante y fechas) y subconjunto «Propuestas UML» en la sección de historial del frontend, separado de la paginación de interacciones. Pruebas: `PENDING`, `APPLIED` y `REJECTED`; OWNER, EDITOR y VIEWER con acceso; usuario ajeno y proyecto inexistente con 404 sin leer; proyecto sin propuestas; ausencia de comando, identificadores UML, recibos y datos internos; y lectura sin modelo local.
  - Backend. Evidencia: `GET /projects/:id/mentor/history/proposals?limit` en `MentorHistoryController`; `MentorHistoryProposalsService` delega en `MentorProposalHistoryService.list(projectId, userId, limit)` importando `MentorProposalsModule` (instancia única, sin store, Prisma ni proyección propios) y responde `{ items }` con `MentorProposalHistoryProjection` tal cual, sin cursor y separado de `/mentor/history`. `limit` usa el rango de CU-2P-06 (1..50, por defecto 20); `INVALID_LIMIT` y `UNKNOWN_PARAMETER` (`cursor`, `q`…) dan el 400 del historial, siempre después de `requireView`. Pruebas con PostgreSQL real (PROP-HIST-01 a 14 en `mentor-history-proposals.integration.test.ts`): OWNER/EDITOR/VIEWER 200, ajeno e inexistente 404, proyecto vacío `{ items: [] }`, los tres estados con sus claves exactas, orden de CU-2P-06, `limit`, ningún dato interno, lectura con `createApp()` sin modelo y 0 inferencias.
  - Frontend. Evidencia: `getMentorProposalHistory(id, { limit? })` en el cliente API (solo `limit`) y sublista «Propuestas UML» dentro de `MentorHistorySection`, separada de «Interacciones» (sin orden combinado, sin tocar su cursor). Cada propuesta muestra operación, estado (Pendiente/Aplicada/Rechazada), el diff como líneas `+`/`−`/`~`, revisión base y fecha de creación; la revisión resultante solo en APPLIED y la fecha de resolución solo en APPLIED/REJECTED. Estados propios de carga, vacío («No hay propuestas UML registradas.») y error (genérico ante 404), independientes de las interacciones. Se carga al abrir, con «Actualizar» y al cambiar de proyecto; `interactionVersion` no la recarga. Visible para OWNER, EDITOR y VIEWER, solo lectura, sin ids, comando, instrucción, autor, diagnósticos ni JSON. Pruebas UI-PROP-01 a 15 en `mentor-history-proposals.test.tsx` y P-01 a 06 en `api-mentor-history.test.ts`.

## 9. Integración con CU-2P-05

- [x] 9.1 Presentar las recomendaciones técnicas registradas como texto legible con un mapper estricto en la lectura del historial (problema, alternativas, razón y limitaciones; sin `projectRevision`, `confidence`, `status` ni JSON), sin columna de tipo, migración ni cambios en CU-2P-05; las demás respuestas sin cambios. Hecho en `mentor-history-recommendation.ts`, aplicado por `toMentorHistoryItem`: solo se reconoce un JSON que sea un objeto con exactamente las nueve claves de `MentorRecommendationResponse` y los tipos correctos (una prueba de tipos fija la forma al contrato de CU-2P-05); se presenta como «Problema / Alternativas / Razón / Limitaciones» sin `projectRevision`, `confidence`, `status` ni los demás indicadores. Las consultas libres, el JSON que no es exactamente una recomendación y el JSON malformado se devuelven sin cambios; la fila guardada no se reescribe. Pruebas: 25 unitarias (REC-01 a REC-12 y REC-14) y 2 con PostgreSQL (REC-13: recomendación del proveedor simulado y recomendación determinista real de CU-2P-05, registradas por `MentorService.recommend` y leídas por `GET /mentor/history`).
- [x] 9.2 Refrescar el historial tras una recomendación técnica correcta, igual que tras una consulta, sin tiempo real. Evidencia: `MentorPanel.recommend` incrementa el mismo `interactionVersion` que la consulta solo cuando la respuesta tiene `needsClarification = false` (CU-2P-05 registra toda recomendación que devuelve con ese valor y devuelve las aclaraciones sin registrarlas); `MentorHistorySection` recibe el nuevo `refreshKey` y vuelve a leer la primera página si está abierta, o al reabrirla si ya estaba cargada. Invalidación local, sin tiempo real ni polling y sin cambios en el backend. Un error o una aclaración no refrescan; un doble clic produce un solo refresco; crear una propuesta (CU-2P-06) no refresca. Pruebas REF-01 a REF-10 en `mentor-history-section.test.tsx`.
