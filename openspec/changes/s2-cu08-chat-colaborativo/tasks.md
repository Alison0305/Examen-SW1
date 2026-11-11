## 1. Incremento 1: alta y backend

- [x] 1.1 Alta de CU-2P-08 (issue #17) en STATUS y cambio OpenSpec `s2-cu08-chat-colaborativo`.
- [x] 1.2 Modelo `ProjectChatMessage`, enum y migración aditiva `20261111180000_add_project_chat_messages` con CHECK de autoría; `prisma validate` y `generate` correctos (SQL generado con `prisma migrate diff`).
- [x] 1.3 Contratos, detección de `@mentor`, parser estricto del cuerpo (400 también con cuerpo `null`, sin depender de `DtoValidationPipe`), parser de query y cursor; pruebas unitarias.
- [x] 1.4 Store Prisma, servicio (publicar, listar, respuesta asíncrona del Mentor con avisos) y controlador; pruebas unitarias del servicio (orden THINKING → MENTOR/NOTICE → IDLE, sin invocar el modelo sin mención, avisos seguros, acceso perdido, fallo al guardar la respuesta), del store y HTTP con el módulo real.
- [x] 1.5 Eventos `project.chat.message` y `project.chat.mentor` y emisor `PROJECT_CHAT_BROADCASTER` implementado por el gateway existente; `MentorModule` exporta `MentorService`; `ProjectChatModule` registrado en `AppModule`. Gates del 2026-11-11: backend sin integraciones 882/882, `tsc` y ESLint correctos.
- [ ] 1.6 Pruebas de integración con PostgreSQL (`prisma-project-chat.store.integration.test.ts`, CHAT-DB-01 a 03). Escritas; pendientes de un entorno con base de datos.

## 2. Incremento 2: frontend

- [x] 2.1 Panel de chat en el workspace en lugar del panel Mentor: línea de tiempo, envío, `@mentor`, estado del Mentor y tiempo real (`ProjectChatPanel`, eventos reenviados por la página, recarga al reconectar, deduplicación por id, texto sin HTML).
- [x] 2.2 Acciones explícitas en el chat: `POST /chat/actions` para recomendación (CU-2P-05) y propuesta (CU-2P-06, solo OWNER y EDITOR, 403 a VIEWER) publicadas por el servidor; tarjetas de propuesta con estado público y Aplicar/Rechazar. El análisis UML (CU-2P-04) queda como herramienta plegable del panel (ver design.md).
- [x] 2.3 «Historial anterior» (CU-2P-07) dentro del panel y pruebas: panel 13, página 10 (las 9 pruebas de CU-2P-06 adaptadas al chat y el filtrado por proyecto), backend del chat 41. Gates del 2026-11-11: frontend 379/379, build, `tsc` y ESLint; backend sin integraciones 889/889, `tsc` y ESLint.

## 3. Incremento 3: verificación y cierre

- [ ] 3.1 Entorno de pruebas en Railway: varios navegadores, VIEWER, IA real.
- [ ] 3.2 PUDS, STATUS y HANDOFF; gates completos; PR con `Closes #17`.
