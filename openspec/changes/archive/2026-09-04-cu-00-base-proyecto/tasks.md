## 1. Incremento 1 - Monorepo y configuracion inicial

- [x] 1.1 Crear `package.json` raiz con `private`, workspaces `frontend` y `backend`, y scripts raiz `dev`, `dev:frontend`, `dev:backend`, `build`, `lint`, `typecheck` y `test`; verificar que `npm` reconoce ambos workspaces desde la raiz.
- [x] 1.2 Crear las carpetas `frontend/` y `backend/` directamente en la raiz, sin `apps/web` ni `apps/api`; verificar que la estructura coincide con la aprobada para CU-00.
- [x] 1.3 Configurar `.env.example` con `BACKEND_PORT`, `FRONTEND_ORIGIN` y `NEXT_PUBLIC_API_BASE_URL`; verificar que no contiene secretos reales.
- [x] 1.4 Revisar `.gitignore` para excluir `.env`, `.env.local`, credenciales, artefactos locales y dependencias instaladas; verificar con `git status` que no se preparan secretos o archivos locales innecesarios.
- [x] 1.5 Mantener `README.md` raiz con instrucciones basicas de instalacion y ejecucion para CU-00; verificar que describe los comandos desde la raiz del repositorio.

## 2. Incremento 2 - Aplicaciones base frontend y backend

- [x] 2.1 Crear el frontend en `frontend/` con Next.js App Router, TypeScript y estructura minima; verificar que `npm run dev:frontend` inicia la aplicacion.
- [x] 2.2 Configurar Material UI en el frontend con una UI tecnica minima; verificar visualmente que la pagina inicial renderiza componentes MUI.
- [x] 2.3 Crear el backend en `backend/` con Node.js 24 LTS, TypeScript y NestJS 11; verificar que el workspace backend instala y compila.
- [x] 2.4 Configurar NestJS para usar Fastify adapter en lugar de Express; verificar en el bootstrap o pruebas que la aplicacion usa Fastify.
- [x] 2.5 Configurar lectura de `BACKEND_PORT` y `FRONTEND_ORIGIN` con valores por defecto de CU-00; verificar que el backend inicia en `3001` si no se define otra variable.
- [x] 2.6 Habilitar CORS para el origen frontend configurado; verificar desde navegador o test de integracion que el frontend local puede llamar al backend.
- [x] 2.7 Normalizar scripts por workspace para `dev`, `build`, `lint`, `typecheck` y `test`; verificar que los scripts raiz delegan correctamente en `frontend` y `backend`.
- [x] 2.8 Verificar ejecucion inicial de ambas aplicaciones con el script raiz `dev`; comprobar que frontend queda en `http://localhost:3000` y backend en `http://localhost:3001`.

## 3. Incremento 3 - Health, integracion, tests y cierre documental

- [x] 3.1 Implementar `GET /health` en el backend con respuesta HTTP 200 y JSON minimo de estado correcto; verificar con una solicitud HTTP local al endpoint.
- [x] 3.2 Implementar en el frontend la consulta a `${NEXT_PUBLIC_API_BASE_URL}/health`; verificar que el navegador realiza la llamada al backend configurado.
- [x] 3.3 Mostrar `API disponible` en el frontend cuando health responde correctamente; verificarlo con backend iniciado.
- [x] 3.4 Mostrar `API no disponible` en el frontend cuando backend esta apagado o health falla; verificarlo deteniendo el backend.
- [x] 3.5 Configurar Vitest, `@nestjs/testing` y Supertest en backend; verificar que existe un test automatizado para arranque o `GET /health` y que pasa.
- [x] 3.6 Configurar Vitest y React Testing Library en frontend; verificar con tests mockeados que se cubren los estados `API disponible` y `API no disponible`.
- [x] 3.7 Ejecutar `npm run lint` desde la raiz; verificar que termina correctamente para los workspaces de CU-00.
- [x] 3.8 Ejecutar `npm run typecheck` desde la raiz; verificar que termina correctamente para frontend y backend.
- [x] 3.9 Ejecutar `npm run test` desde la raiz; verificar que pasan los tests frontend y backend.
- [x] 3.10 Ejecutar `npm run build` desde la raiz; verificar que frontend y backend construyen correctamente.
- [x] 3.11 Ejecutar y documentar la prueba manual de CU-00: iniciar backend, iniciar frontend, abrir frontend, comprobar `API disponible`, apagar backend y comprobar `API no disponible`.
- [x] 3.12 Crear o actualizar `docs/puds/use-cases/CU-00-base-proyecto.md` con objetivo, alcance, dependencias, implementacion real, decisiones, archivos principales, pruebas, prueba manual, errores, limitaciones, deuda tecnica y resultado; verificar que no declara funcionalidades futuras como implementadas.
- [x] 3.13 Actualizar `docs/STATUS.md` y `docs/HANDOFF.md` segun el avance real de CU-00; verificar que no se marca el CU como terminado antes de pruebas, revision y aceptacion.
- [x] 3.14 Revisar dependencias y codigo para confirmar que no se introdujeron capacidades de CUs futuros; verificar ausencia de React Flow, ELK, Prisma, PostgreSQL, JWT, Socket.IO, generacion, IA, voz, vision, XMI y Capacitor.
- [x] 3.15 Ejecutar validacion final de OpenSpec para `cu-00-base-proyecto`; verificar que el cambio queda listo para revision, verify y posterior aceptacion del usuario.
