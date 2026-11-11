# CU-2P-07 - Historial compartido del Mentor IA

## Estado

Completado en la rama `feat/s2-cu07-historial-compartido` (issue #7), sin fusionar. OpenSpec activo en `openspec/changes/s2-cu07-historial-compartido/`, válido en modo `--strict`, con las tareas 1.1 a 9.2 cerradas salvo la 7.3. El smoke test manual con dos integrantes y un tercero sin acceso fue aprobado por el usuario el 2026-11-11. Queda la integración: PR con `Closes #7`, revisión, merge a `main` y archivo del OpenSpec.

## Objetivo Y Alcance

Permitir que los integrantes autorizados de un proyecto consulten lo que se ha trabajado con el Mentor IA en ese proyecto: las preguntas y respuestas de todos los integrantes, con su autor y fecha, y el estado de las propuestas de cambio UML. Sin mezclar proyectos y sin crear una segunda fuente de verdad.

CU-2P-07 no tiene RF numerados. Su alcance son los 12 requisitos de la capability `mentor-shared-history` (36 escenarios): historial por proyecto, historial compartido entre integrantes, aislamiento entre proyectos, autoría y fecha, paginación keyset, búsqueda dentro del proyecto, autorización en el servidor, privacidad del DTO, independencia del modelo local, estado público de las propuestas UML, recomendaciones técnicas registradas y actualización tras una interacción propia.

Fuera de alcance: editar, borrar o limpiar el historial; tiempo real; búsqueda semántica o resúmenes con IA; un feed único que mezcle interacciones y propuestas; registrar los análisis de CU-2P-04; aplicar o rechazar propuestas desde el historial.

## Actores

- **OWNER, EDITOR y VIEWER del proyecto**: leen el mismo historial con los mismos permisos. Ninguno puede modificarlo.
- **Usuario sin acceso**: recibe 404, igual que con un proyecto inexistente.
- **Mentor IA (CU-2P-01/05)**: es quien genera las interacciones; CU-2P-07 solo las lee.
- **CU-2P-06**: dueño de las propuestas UML y de su proyección pública de lectura.

## Dependencias

- CU-2P-01: `MentorService` registra cada consulta completada mediante el recorder.
- CU-2P-02: identidad derivada del JWT (`authorEmail` guardado) y `ProjectAccessService.requireView`.
- CU-2P-03: tabla `MentorInteraction` con índice `(projectId, occurredAt, id)`, única fuente de verdad del historial. Sin migración nueva.
- CU-2P-05: las recomendaciones técnicas se registran en la misma tabla como el JSON completo de `MentorRecommendationResponse`.
- CU-2P-06: `MentorProposalHistoryService` y `MentorProposalHistoryProjection` (tarea 11.1 de CU-2P-06), integrados en esta rama mediante el merge `e67bbe6`.

## Flujo Principal

```text
integrante abre «Historial del proyecto» en el panel Mentor IA
  ├─ Interacciones:  GET /projects/:id/mentor/history?limit&cursor&q
  │     JwtAuthGuard → ParseUUIDPipe → MentorHistoryService
  │     → requireView → parseMentorHistoryQuery → PrismaMentorHistoryReader (MentorInteraction)
  │     → DTO público (recomendaciones CU-2P-05 como texto legible)
  └─ Propuestas UML: GET /projects/:id/mentor/history/proposals?limit
        JwtAuthGuard → ParseUUIDPipe → MentorHistoryProposalsService
        → MentorProposalHistoryService.list (CU-2P-06: requireView, proyección pública)
```

Las dos fuentes se cargan y se muestran por separado dentro de la misma sección; nunca se mezclan en un único orden cronológico.

## Decisión De API

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/projects/:id/mentor/history?limit=&cursor=&q=` | 200 `{ items, nextCursor }` |
| GET | `/projects/:id/mentor/history/proposals?limit=` | 200 `{ items }` |

- Interacción: `{ id, author: { email }, question, answer, occurredAt }`.
- Propuesta: la `MentorProposalHistoryProjection` de CU-2P-06 sin cambios: `{ proposalId, status, operation, summary, baseRevision, createdAt, resolvedAt?, resultingRevision? }`. `resolvedAt` solo en `APPLIED` y `REJECTED`; `resultingRevision` solo en `APPLIED`.
- `limit`: entero decimal 1..50, por defecto 20 en ambas rutas. En propuestas se usan las constantes de CU-2P-06.
- Errores 400 con el cuerpo `{ statusCode, error, code, reason?, message }`: `INVALID_LIMIT`, `INVALID_CURSOR` (con `reason`), `INVALID_SEARCH` y `UNKNOWN_PARAMETER`. La ruta de propuestas solo admite `limit`: `cursor`, `q` o cualquier otro parámetro es `UNKNOWN_PARAMETER`.
- 401 sin JWT; 404 para usuario sin acceso o proyecto inexistente, también con una consulta inválida (se autoriza antes de validar); 5xx genérico sin detalles de Prisma.

## Implementación Realizada

### Historial por proyecto y autoría

- Lector propio `PrismaMentorHistoryReader` detrás del puerto `MENTOR_HISTORY_READER`. No reutiliza la memoria de CU-2P-03, que tiene un tope fijo, recorta el texto y omite el autor.
- Filtra siempre por `projectId` y selecciona solo `id`, `authorEmail`, `question`, `answer` y `occurredAt`.
- El autor es el `authorEmail` guardado por CU-2P-02, sin join con `User`.

### Paginación keyset

- Orden `occurredAt DESC, id DESC`; la página siguiente se lee con `occurredAt < t OR (occurredAt = t AND id < i)`, pidiendo `limit + 1` filas para saber si hay más.
- Cursor opaco `base64url({ v: 1, t, i })`. Su decodificador nunca lanza y distingue `MALFORMED_CURSOR`, `UNSUPPORTED_CURSOR_VERSION`, `INVALID_CURSOR_DATE` e `INVALID_CURSOR_ID`.
- No se firma: toda lectura sigue autorizada y filtrada por proyecto, así que un cursor de otro proyecto solo define una posición.
- Sin offset: una interacción nueva no desplaza ni duplica elementos durante el recorrido.

### Búsqueda

- `q` se recorta y debe tener 1..200 caracteres sin caracteres de control.
- Busca en pregunta o respuesta sin distinguir mayúsculas y siempre dentro del proyecto.
- Prisma no escapa los comodines de `contains`, así que el lector escapa `%`, `_` y `\` (medido contra PostgreSQL).

### Permisos y aislamiento

- `MentorHistoryService` aplica `requireView`, luego valida la consulta y después lee. Las propuestas siguen el mismo criterio: con una consulta válida autoriza `MentorProposalHistoryService`; con una inválida se ejecuta `requireView` antes de devolver el 400.
- OWNER, EDITOR y VIEWER leen lo mismo. Un usuario sin acceso y un proyecto inexistente reciben el mismo 404, sin que se lea nada.

### Privacidad

- El DTO de interacción se construye campo a campo. Nunca salen `userId`, `projectId`, `accessRole`, `projectRevision`, `grounded`, `createdAt`, prompts ni datos de Prisma.
- Las propuestas nunca exponen el comando persistido, los ids UML, la instrucción, el autor ni el resolutor, los diagnósticos, recibos o prompts.
- Mostrar el email del autor a todos los integrantes, incluido VIEWER, es una decisión aprobada del CU.

### Recomendaciones de CU-2P-05 legibles

- `mentor-history-recommendation.ts` reconoce de forma estricta una `answer` que sea exactamente una `MentorRecommendationResponse`: JSON objeto, las nueve claves exactas y los tipos correctos. Una prueba de tipos ata esa forma al contrato de CU-2P-05.
- La presenta como «Problema / Alternativas / Razón / Limitaciones», sin `projectRevision`, `confidence`, `status`, `needsClarification` ni `requiresUmlChange`, y sin JSON.
- Cualquier otra respuesta se devuelve sin cambios, sin heurísticas, y la fila guardada no se reescribe. Sin columna de tipo, migración ni cambios en CU-2P-05.

### Propuestas UML de CU-2P-06 separadas

- `MentorHistoryModule` importa `MentorProposalsModule` y `MentorHistoryProposalsService` delega en `MentorProposalHistoryService.list(projectId, userId, limit)`. Usa la misma instancia que el resto de la aplicación y devuelve la proyección sin reordenarla ni volver a proyectarla.
- No lee la tabla `MentorProposal`, `StoredMentorProposal` ni los stores, y no modifica CU-2P-06. Un test estructural limita lo que `mentor-history` puede importar de CU-2P-06 a su módulo, ese servicio y sus contratos.
- No hay feed global: las dos tablas no comparten clave de orden ni cursor, y el servicio de CU-2P-06 solo admite `limit`.

### Independencia del modelo local

- La lectura funciona sin `ASSISTANT_MODEL_PATH` y nunca invoca el modelo.
- Al importar `MentorProposalsModule`, `AssistantModule` queda en el grafo de forma indirecta. Sin ruta configurada el modelo es `undefined` y no se carga nada; en la aplicación es la instancia única compartida.
- El requisito se formuló en la fase 0 sobre el comportamiento, no sobre la estructura de módulos. Las pruebas lo verifican con `createApp()` sin modelo y con un doble del modelo que falla ante cualquier inferencia (0 inferencias).

### Frontend

- `getMentorHistory(id, { limit?, cursor?, q? })` y `getMentorProposalHistory(id, { limit? })` en `frontend/app/auth/api.ts`. Solo envían valores presentes y permitidos.
- `MentorHistorySection`, dentro de `MentorPanel`, es plegable y carga al abrir. Contiene dos subconjuntos con estados propios de carga, vacío y error, de modo que el fallo de uno no oculta el otro:
  - **Interacciones**: búsqueda en el servidor con espera de 400 ms, lista con autor, fecha y pregunta, respuesta desplegable en texto plano, «Cargar más» con cursor y sin duplicados, y descarte de respuestas obsoletas.
  - **Propuestas UML**: operación, estado (Pendiente / Aplicada / Rechazada), el diff como líneas `+` / `−` / `~`, revisión base y fecha de creación. La revisión resultante solo aparece en `APPLIED` y la fecha de resolución solo en `APPLIED` y `REJECTED`, decidido por el estado. Sin botones: solo lectura. Vacío: «No hay propuestas UML registradas.».
- «Actualizar» recarga ambas fuentes. Al cambiar de proyecto, la sección se reinicia (`key={projectKey}`) y se ignoran las respuestas tardías del proyecto anterior.

### Actualización local sin realtime

- `MentorPanel` incrementa `interactionVersion` tras una consulta correcta y tras una recomendación registrada (`needsClarification = false`). CU-2P-05 devuelve las aclaraciones sin registrarlas, así que esas no refrescan.
- La sección recarga las interacciones si está abierta, o al reabrirla si ya estaba cargada.
- Las propuestas no dependen de esa señal: se cargan al abrir, con «Actualizar» y al cambiar de proyecto.
- No hay realtime ni polling: lo que hacen otros integrantes aparece al actualizar o al reabrir.

## Errores Encontrados Y Correcciones

- **Comodines en la búsqueda** (fase 2, medido): `q = "100%"` encontraba «¿100 por ciento?». Corregido escapando `%`, `_` y `\` en el lector.
- **`JwtAuthGuard` sin resolver** (fase 4): `ProjectsPersistenceModule` no reexporta `AuthModule`, así que `MentorHistoryModule` lo importa, como `MentorModule`.
- **Recomendaciones como JSON bruto** (auditoría tras integrar CU-2P-06): el historial mostraba `projectRevision`, `confidence` y `status`. Corregido con el mapper estricto (tarea 9.1).
- **Recomendación sin refresco** (tarea 9.2): solo la consulta incrementaba `interactionVersion`; ahora también la recomendación registrada.
- **Requisito 9 demasiado estructural** (fase 0): «no importar `AssistantModule`» era incompatible con reutilizar el servicio de CU-2P-06. Se reformuló a «funciona sin modelo y no lo invoca»; las cuatro aserciones antiguas se adaptaron sin debilitar la garantía.

## Pruebas Automatizadas

- `src/mentor-history`: 251/251 en 15 archivos. Incluye unitarias de contrato, cursor, consulta, página, recomendación, servicio, controlador y módulo, HTTP sin base de datos y las integraciones PostgreSQL:
  - lector (paginación, empates, búsqueda, comodines, aislamiento);
  - servicio con `ProjectAccessService` real;
  - HTTP con `createApp()` y usuarios reales;
  - extremo a extremo `POST /mentor/query` → `GET /mentor/history` con A (OWNER), B (EDITOR) y C (ajeno), y las recomendaciones REC-13;
  - propuestas PROP-HIST-01 a 14 con el store real de CU-2P-06 como fixture.
- Los fixtures de las integraciones usan ids y e-mails propios y verifican 0 restos al terminar.
- Backend completo sin las suites de modelos reales: 975 correctas y 3 omitidas (Vosk real); `src/mentor*` 822/822; `mentor-proposals` 326/326 sin cambios. `tsc` y ESLint correctos.
- Frontend: 348/348 en 24 archivos, más build, `tsc` y ESLint correctos. CU-2P-07 aporta el cliente API (`api-mentor-history.test.ts`), la sección y su integración en el panel con REF-01 a REF-10 (`mentor-history-section.test.tsx`) y las propuestas UI-PROP-01 a 15 (`mentor-history-proposals.test.tsx`).
- Mutaciones comprobadas: quitar el refresco tras una recomendación, refrescar ante una aclaración, quitar la recarga de propuestas en «Actualizar» y mostrar la revisión resultante sin mirar el estado hacen fallar las pruebas correspondientes.

## Pruebas Manuales

Smoke test aprobado por el usuario (2026-11-11): dos usuarios del mismo proyecto ven el historial compartido y un tercero sin acceso no lo ve.

## Limitaciones

- Sin tiempo real: las interacciones y propuestas de otros integrantes aparecen al pulsar «Actualizar» o al reabrir la sección.
- La búsqueda opera sobre el texto guardado. En una recomendación es su JSON, así que términos como `problem` coinciden con todas ellas.
- Las propuestas no tienen cursor ni búsqueda: se muestran las 20 más recientes (máximo 50 por la API), porque el servicio de CU-2P-06 solo admite `limit`.
- Solo se registran las consultas libres (CU-2P-01) y las recomendaciones (CU-2P-05). Las respuestas de diagnóstico de la consulta (`INSUFFICIENT_CONTEXT`, `ELEMENT_NOT_FOUND`), las aclaraciones, los 503 y los análisis de CU-2P-04 no aparecen.
- Una consulta correcta que CU-2P-01 no registra (los diagnósticos anteriores) también refresca el historial: provoca una lectura extra, sin datos incorrectos.
- La propuesta no muestra autor ni instrucción, porque la proyección de CU-2P-06 no los incluye.
- Búsqueda con `contains` sin índice de texto: recorre solo las filas del proyecto, lo que basta a la escala actual.

## Archivos Principales

- Backend: `backend/src/mentor-history/` (contratos, cursor, consulta, página, recomendación, lector Prisma, servicios de interacciones y de propuestas, controlador y módulo) y el registro en `backend/src/app.module.ts`.
- Frontend: `frontend/app/workspace/mentor-history-section.tsx`, `mentor-panel.tsx`, `workspace-client.tsx`, `frontend/app/projects/[id]/workspace/page.tsx` y `frontend/app/auth/api.ts`.
- OpenSpec: `openspec/changes/s2-cu07-historial-compartido/` (proposal, design, spec `mentor-shared-history` y tasks).

## Commits

`826d693`, `7a92b83`, `8ea0437`, `fa90dac` y `2142b9f` (contrato, lector, autorización, endpoint e interfaz); `e67bbe6` (merge de CU-2P-06); `aa1dfbf` (reconciliación del OpenSpec); `f40d624` (extremo a extremo multiusuario); `77112d1` (recomendaciones legibles); `73f0f6d` (refresco tras recomendaciones); `5603542` y `72f414c` (propuestas UML en backend y frontend), más el commit de documentación de cierre.
