## Purpose

Define la base ejecutable minima del proyecto para que el repositorio funcione como monorepo y demuestre comunicacion frontend -> backend mediante un health HTTP verificable.

## Requirements

### Requirement: Monorepo reproducible
El repositorio SHALL organizarse como un monorepo npm con workspaces para `frontend` y `backend`, ubicados directamente en la raiz del repositorio.

#### Scenario: Estructura esperada del repositorio
- **WHEN** se revisa la raiz del proyecto despues de aplicar CU-00
- **THEN** existen `frontend/`, `backend/`, `docs/`, `openspec/`, `.opencode/`, `AGENTS.md`, `README.md`, `package.json`, `.env.example` y `.gitignore`

#### Scenario: Workspaces npm configurados
- **WHEN** se instalan dependencias desde la raiz con npm
- **THEN** npm reconoce los workspaces `frontend` y `backend`

#### Scenario: Scripts raiz disponibles
- **WHEN** se revisa el `package.json` raiz
- **THEN** existen scripts raiz para desarrollo, build, lint, typecheck y test que delegan o ejecutan las verificaciones de los workspaces correspondientes

### Requirement: Configuracion segura de entorno
El proyecto SHALL declarar en `.env.example` las variables necesarias para ejecutar CU-00 sin incluir secretos reales, y MUST excluir archivos locales de entorno y credenciales del control de versiones.

#### Scenario: Variables de CU-00 documentadas
- **WHEN** una persona abre `.env.example`
- **THEN** encuentra las variables necesarias para configurar el puerto/base URL del backend, el origen permitido del frontend y la URL publica que el frontend usa para consultar la API

#### Scenario: Archivos de entorno locales ignorados
- **WHEN** se revisa `.gitignore`
- **THEN** `.env`, `.env.local` y archivos equivalentes con configuracion local no quedan preparados para commitearse

### Requirement: Frontend tecnico minimo
El frontend SHALL usar Next.js con App Router, TypeScript y Material UI, y SHALL exponer una interfaz minima para informar el estado de conexion con la API.

#### Scenario: Frontend inicia desde su workspace
- **WHEN** se inicia el frontend con el script documentado
- **THEN** la aplicacion queda disponible en el navegador en el puerto configurado para CU-00

#### Scenario: Frontend muestra API disponible
- **WHEN** el backend responde correctamente a `GET /health`
- **THEN** el frontend consulta ese endpoint y muestra claramente un estado equivalente a `API disponible`

#### Scenario: Frontend muestra API no disponible
- **WHEN** el backend no esta iniciado o la consulta a `GET /health` falla
- **THEN** el frontend maneja el error y muestra claramente un estado equivalente a `API no disponible`

### Requirement: Backend tecnico minimo
El backend SHALL usar Node.js 24 LTS, TypeScript, NestJS 11 y Fastify, y SHALL exponer un endpoint HTTP `GET /health` para verificar disponibilidad.

#### Scenario: Backend inicia desde su workspace
- **WHEN** se inicia el backend con el script documentado
- **THEN** la aplicacion queda escuchando en el puerto configurado para CU-00 usando Fastify

#### Scenario: Health responde correctamente
- **WHEN** un cliente realiza `GET /health` contra el backend iniciado
- **THEN** el backend responde HTTP 200 con un cuerpo JSON minimo que indica estado correcto de la API

#### Scenario: CORS permite al frontend local
- **WHEN** el frontend configurado realiza la consulta de health desde el navegador
- **THEN** la configuracion CORS permite la solicitud desde el origen frontend definido para CU-00

### Requirement: Verificaciones automatizadas
CU-00 SHALL incluir bases de testing para backend y frontend, y SHALL permitir ejecutar lint, typecheck, test y build desde la raiz del monorepo.

#### Scenario: Tests backend cubren health
- **WHEN** se ejecutan los tests del backend
- **THEN** existe una prueba relevante que verifica el arranque o el endpoint `GET /health`

#### Scenario: Tests frontend cubren estado de conexion
- **WHEN** se ejecutan los tests del frontend
- **THEN** existe una prueba relevante que verifica el estado mostrado cuando la API esta disponible y cuando no esta disponible

#### Scenario: Gates de calidad pasan desde la raiz
- **WHEN** se ejecutan los scripts raiz de lint, typecheck, test y build
- **THEN** las verificaciones terminan correctamente para los workspaces incluidos en CU-00

### Requirement: Documentacion verificable de CU-00
CU-00 SHALL documentar el resultado real implementado, las pruebas automatizadas, la prueba manual y las limitaciones conocidas sin declarar funcionalidades futuras como existentes.

#### Scenario: Documento del CU refleja la implementacion real
- **WHEN** termina la implementacion de CU-00
- **THEN** existe o esta actualizado `docs/puds/use-cases/CU-00-base-proyecto.md` con objetivo, alcance, decisiones, archivos principales, pruebas, prueba manual, limitaciones y resultado final

#### Scenario: Estado operativo actualizado al avance real
- **WHEN** corresponda actualizar el estado del proyecto durante o al cerrar CU-00
- **THEN** `docs/STATUS.md` y `docs/HANDOFF.md` reflejan el OpenSpec activo, el incremento real, pendientes y siguiente accion sin declarar el CU como implementado antes de verificarlo

#### Scenario: Prueba manual documentada
- **WHEN** se revisa la documentacion de CU-00
- **THEN** incluye una prueba manual para iniciar backend, iniciar frontend, abrir el navegador, comprobar `API disponible` y comprobar el comportamiento `API no disponible`

### Requirement: Limite de alcance de CU-00
CU-00 SHALL limitarse a la base tecnica ejecutable y no SHALL implementar capacidades pertenecientes a casos de uso posteriores.

#### Scenario: Sin funcionalidades de CUs futuros
- **WHEN** se revisan dependencias, codigo y documentacion del cambio
- **THEN** no se incluyen CanonicalUmlModel, ProjectDocument, DiagramLayout, validacion UML, UmlCommand, Command Bus, Undo/Redo, React Flow, ELK, Prisma, PostgreSQL, autenticacion, JWT, ownership, Socket.IO, colaboracion, generacion Spring Boot, OpenAPI generado, Postman, Domain Manifest, IA, Qwen, Vosk, Florence-2, XMI ni Capacitor
