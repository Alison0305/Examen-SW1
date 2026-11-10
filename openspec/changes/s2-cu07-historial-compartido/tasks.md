## 1. Contrato y OpenSpec

- [x] 1.1 Crear el cambio OpenSpec `s2-cu07-historial-compartido` (proposal, design, spec `mentor-shared-history`, tasks) a partir del issue #7 y de la auditoría de CU-2P-01/02/03.
- [x] 1.2 Definir contratos en `backend/src/mentor-history/mentor-history.contracts.ts`: límites, consulta cruda y normalizada, errores, DTO público, `MentorHistoryRecord` y puerto `MentorHistoryReader`.
- [x] 1.3 Implementar cursor opaco (`encodeHistoryCursor`/`decodeHistoryCursor`), parser de consulta (`parseMentorHistoryQuery`) y ensamblado de página (`toMentorHistoryItem`/`toMentorHistoryPage`) como funciones puras.
- [x] 1.4 Cubrir con pruebas unitarias sin base de datos: roundtrip, cursor inválido por motivo, `limit`, búsqueda, parámetros desconocidos, DTO sin campos internos, recorrido keyset sin duplicados e independencia de Qwen (29 pruebas).

## 2. Persistencia paginada

- [x] 2.1 Implementar el lector Prisma de `MENTOR_HISTORY_READER` sobre `MentorInteraction`: filtro por `projectId`, keyset `occurredAt DESC, id DESC`, `take: limit + 1`, búsqueda sin distinguir mayúsculas en pregunta o respuesta con `%`, `_` y `\` escapados, selección solo de `MentorHistoryRecord` (`PrismaMentorHistoryReader`, 6 pruebas unitarias de la consulta).
- [x] 2.2 Pruebas de integración PostgreSQL: vacío, una fila, orden, empates de fecha, orden UUID, `limit + 1`, recorrido 7/2 sin duplicados, búsqueda por pregunta y por respuesta, mayúsculas y acentos, `%`/`_`/`\` literales, búsqueda paginada, aislamiento A/B, cursor de A en B, cursor con otra búsqueda y lectura sin modelo local (20 pruebas, fixtures propios con limpieza acotada).

## 3. Servicio y autorización

- [ ] 3.1 Implementar `MentorHistoryService`: `requireView` con el usuario del JWT antes de leer, consulta normalizada y página pública.
- [ ] 3.2 Pruebas: OWNER, EDITOR, VIEWER, usuario ajeno y proyecto inexistente (404 sin leer) y funcionamiento sin modelo local.

## 4. Controlador y DTO HTTP

- [ ] 4.1 Implementar `GET /projects/:id/mentor/history` con `JwtAuthGuard`, `ParseUUIDPipe` y `parseMentorHistoryQuery`, y mapear los errores de contrato a 400.
- [ ] 4.2 Registrar `MentorHistoryModule` en `AppModule` sin importar `AssistantModule`.
- [ ] 4.3 Pruebas HTTP: 200, vacío, 400 por cursor, `limit`, búsqueda y parámetros desconocidos, 401, 404 y cuerpo sin campos internos.

## 5. Pruebas multiusuario

- [ ] 5.1 Integración: A consulta y B (EDITOR o VIEWER) ve la interacción con A como autor; un tercero sin acceso recibe 404; otro proyecto no ve Q1/Q2.

## 6. Frontend

- [ ] 6.1 Añadir el cliente `mentorHistory` en `frontend/app/auth/api.ts` con los tipos públicos.
- [ ] 6.2 Añadir la sección «Historial del proyecto» en `MentorPanel`: búsqueda, lista, detalle desplegable, «Cargar más», «Actualizar», estados vacío, carga y error, y refresco tras una consulta propia.
- [ ] 6.3 Pruebas de interfaz con React Testing Library.

## 7. Documentación y smoke test

- [ ] 7.1 Crear `docs/puds/use-cases/CU-2P-07-historial-compartido.md` y actualizar STATUS y HANDOFF con la implementación real.
- [ ] 7.2 Ejecutar lint, typecheck y suites; smoke test con dos usuarios del mismo proyecto y un tercero sin acceso.
- [ ] 7.3 Revisión del compañero, PR con `Closes #7`, aceptación y archivo del OpenSpec.

## 8. Integración posterior con CU-2P-06

- [ ] 8.1 Cuando CU-2P-06 exponga su modelo de propuestas, mostrar su estado real en el historial y añadir la prueba de que un usuario ajeno no accede. No se implementa antes de que exista esa fuente de verdad.
