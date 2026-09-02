# PUDS — Casos de uso y ciclos de implementación

## 1. Propósito

Este documento organiza la implementación del proyecto mediante el Proceso Unificado de Desarrollo de Software (PUDS).

La planificación contiene:

- exactamente **4 ciclos**;
- exactamente **12 casos de uso**;
- numeración de `CU-00` a `CU-11`;
- orden lineal de implementación;
- incrementos utilizables al finalizar cada ciclo.

Los casos de uso se implementan uno por uno.

Cada CU puede dividirse internamente en un máximo de 3 incrementos si su tamaño lo requiere.

La reducción de 20 a 12 casos de uso no elimina funcionalidades del producto. Se agrupan capacidades relacionadas para reducir fragmentación y mantener entregables más amplios, pero todavía comprobables.

---

## 2. Flujo de trabajo de cada CU

```text
seleccionar CU
    ↓
solicitar plan
    ↓
revisar y aprobar plan
    ↓
generar prompt para OpenCode
    ↓
crear/actualizar OpenSpec
    ↓
implementar
    ↓
ejecutar tests
    ↓
probar manualmente
    ↓
iterar correcciones
    ↓
actualizar documentación del CU
    ↓
verify
    ↓
aceptación
    ↓
archive
    ↓
STATUS
    ↓
commit
    ↓
push
```

Durante una iteración se mantiene el mismo número de CU y el mismo OpenSpec mientras el CU continúe abierto.

---

# CICLO 1 — INICIO Y BASE ARQUITECTÓNICA

## Objetivo del ciclo

Construir una base ejecutable y estabilizar el núcleo UML y la ruta única de mutación antes de iniciar persistencia, colaboración, generación o IA.

Al terminar el ciclo debe existir:

- repositorio reproducible;
- frontend y backend conectados;
- modelo UML canónico;
- `ProjectDocument`;
- `DiagramLayout`;
- validación UML;
- Command Bus;
- Undo/Redo;
- editor UML manual funcional en memoria.

## CU-00 — Base del proyecto

**Objetivo:** crear la estructura inicial del repositorio y demostrar una comunicación mínima frontend → backend.

Incluye:

- repositorio monorepo;
- Git/GitHub;
- workspaces;
- documentación inicial;
- OpenSpec;
- `AGENTS.md`;
- Next.js App Router + TypeScript;
- Material UI;
- NestJS 11;
- Fastify;
- scripts raíz;
- lint/typecheck/build/tests iniciales;
- variables de entorno;
- CORS;
- endpoint health;
- consulta health desde frontend.

**Resultado usable:** el proyecto puede clonarse, instalarse, iniciarse y mostrar desde el navegador que la API está disponible.

## CU-01 — Núcleo UML canónico y validación

**Objetivo:** crear la fuente de verdad semántica del editor y un único motor de validación reutilizable.

Máximo 3 incrementos:

1. `CanonicalUmlModel`, `ProjectDocument` y `DiagramLayout`.
2. Tipos UML, relaciones, multiplicidades, enums, paquetes y metadatos de generación.
3. Motor de validación con diagnósticos estructurados.

Incluye:

- UUID;
- revisión;
- timestamps;
- clases;
- atributos;
- operaciones cuando correspondan;
- tipos;
- visibilidad;
- Association;
- Aggregation;
- Composition;
- Generalization;
- Multiplicity;
- Enumeration;
- Package cuando sea necesario;
- metadatos de generación;
- severity;
- code;
- mensaje;
- path lógico;
- referencia al elemento;
- errores;
- warnings;
- reglas iniciales UML.

**Resultado usable:** un modelo UML puede crearse, serializarse y validarse de forma determinista sin depender de React Flow.

## CU-02 — Command Bus, Undo/Redo y workspace UML manual

**Objetivo:** establecer la única ruta de mutación y construir el primer editor UML usable.

Máximo 3 incrementos:

1. `UmlCommand`, `UmlCommandBus`, `UmlCommandExecutor`, historial, Undo y Redo.
2. Workspace, React Flow, nodos UML custom, toolbox e inspector.
3. ELK, diagnósticos navegables, responsive básico y pruebas integradas.

Incluye:

- familias iniciales de comandos;
- integración con validación;
- historial configurable;
- límite inicial de 100 operaciones;
- app bar;
- sidebar;
- breadcrumbs;
- canvas;
- inspector;
- toolbox;
- status bar;
- clases;
- atributos;
- enums;
- relaciones UML;
- multiplicidades;
- selección;
- zoom;
- pan;
- fit;
- movimiento;
- `DiagramLayout`;
- ELK;
- diagnósticos visibles;
- navegación desde error;
- responsive básico.

**Resultado usable del Ciclo 1:** el usuario puede crear y editar manualmente un diagrama UML de clases en memoria, validarlo y utilizar Undo/Redo.

---

# CICLO 2 — ELABORACIÓN Y COLABORACIÓN

## Objetivo del ciclo

Convertir el editor local en una aplicación real con usuarios, proyectos persistidos y colaboración multiusuario.

Al terminar el ciclo debe existir:

- PostgreSQL;
- Prisma;
- persistencia;
- autenticación;
- ownership;
- landing;
- gestión de proyectos;
- membresías;
- invitaciones;
- colaboración realtime;
- presencia.

## CU-03 — Persistencia, autenticación y ownership

**Objetivo:** persistir `ProjectDocument` y proteger los proyectos mediante identidad y autorización.

Máximo 3 incrementos:

1. PostgreSQL + Prisma + migraciones + persistencia del documento y layout.
2. Revisión optimista, rechazo stale y round-trip de guardado/apertura.
3. Registro, login, JWT Bearer, `ownerId` y autorización.

Incluye:

- PostgreSQL;
- Prisma;
- migraciones;
- persistencia UML;
- persistencia de layout;
- metadata;
- revisión optimista;
- rechazo de escrituras stale;
- registro;
- login;
- JWT Bearer;
- credenciales seguras;
- `ownerId`;
- autorización;
- consultas filtradas por usuario;
- rutas protegidas.

**Resultado usable:** un usuario puede autenticarse, guardar un proyecto, cerrar la aplicación y abrirlo nuevamente sin pérdida de información ni acceso indebido.

## CU-04 — Landing, gestión de proyectos, membresías e invitaciones

**Objetivo:** completar el flujo desde la entrada al producto hasta el workspace y permitir compartir proyectos de forma controlada.

Máximo 3 incrementos:

1. Landing + login/register UI.
2. Listado, creación, apertura, renombrado y eliminación de proyectos.
3. `ProjectMembership`, roles, `ProjectInvitation`, expiración, token y aceptación/rechazo.

Incluye:

- landing;
- login/register UI;
- listado de proyectos;
- crear;
- abrir;
- renombrar;
- eliminar;
- loading/error/empty;
- navegación al workspace;
- responsive;
- membresías;
- roles mínimos;
- invitaciones;
- expiración;
- token de invitación;
- aceptación;
- rechazo;
- controles básicos desde UI.

**Resultado usable:** un propietario puede gestionar sus proyectos e invitar a otra persona con acceso controlado.

## CU-05 — Colaboración realtime y presencia

**Objetivo:** permitir edición simultánea reutilizando la misma semántica de comandos.

Incluye:

- Socket.IO;
- `baseRevision`;
- servidor autoritativo;
- validación;
- persistencia inmediata;
- broadcast;
- rechazo stale;
- recuperación del documento autoritativo;
- autorización de conexión;
- conexión/desconexión;
- selección remota;
- cursor;
- elemento editado;
- última actividad;
- avatares;
- estados online/offline.

**Resultado usable del Ciclo 2:** dos clientes autorizados pueden editar el mismo proyecto persistido y observar cambios y presencia en tiempo real.

---

# CICLO 3 — CONSTRUCCIÓN Y GENERACIÓN DE APLICACIONES

## Objetivo del ciclo

Transformar el modelo UML en aplicaciones ejecutables y agregar asistentes locales de texto.

Al terminar el ciclo debe existir:

- UML → `RelationalModel`;
- backend Spring Boot generado;
- CRUD avanzado;
- pruebas automáticas del generador;
- OpenAPI;
- Postman;
- Domain Manifest;
- frontend generado;
- asistente de texto seguro;
- benchmark LLM.

## CU-06 — UML → RelationalModel y generador backend Spring Boot

**Objetivo:** transformar el UML de forma determinista y generar un backend Java compilable mediante Handlebars.

Máximo 3 incrementos:

1. `RelationalModel` y reglas UML → relacional.
2. Plantillas Handlebars y estructura Spring Boot.
3. Generación representativa y compilación Gradle.

Incluye:

- clase → tabla;
- atributo → columna;
- identificador → PK;
- FK;
- unique;
- indexes;
- nullability;
- enums;
- 1:1;
- 1:N;
- N:M;
- composición;
- herencia;
- diagnósticos para casos no soportados;
- Java 21;
- Spring Boot 4.x;
- Gradle;
- Spring Web MVC;
- Spring Data JPA;
- Hibernate;
- PostgreSQL;
- Jakarta Validation;
- Jackson;
- entidades;
- repositories;
- services;
- controllers.

**Resultado usable:** un modelo UML válido produce siempre el mismo modelo relacional y un backend Spring Boot generado que compila.

## CU-07 — CRUD avanzado, verificación, OpenAPI, Postman y Domain Manifest

**Objetivo:** completar las capacidades del backend generado y producir contratos machine-readable consistentes.

Máximo 3 incrementos:

1. CRUD avanzado, relaciones, filtros, búsqueda, paginación, sorting y count.
2. Fixtures, compilación Gradle y suite automática del generador.
3. `springdoc-openapi`, OpenAPI, Postman Collection y Domain Manifest.

Incluye:

- create;
- read;
- update;
- delete;
- list;
- count;
- pagination;
- sorting;
- filtering;
- search;
- navegación de relaciones;
- pruebas API;
- pruebas de relaciones;
- matriz de metadatos;
- OpenAPI;
- Postman Collection;
- Domain Manifest;
- entidades;
- atributos;
- tipos;
- relaciones;
- aliases;
- searchable;
- sortable;
- operaciones;
- validaciones;
- capacidades CRUD.

Decisión de arquitectura:

```text
API principal NestJS
    ↓
@nestjs/swagger

Backend generado Spring
    ↓
springdoc-openapi
    ↓
OpenAPI
    ↓
Postman + Domain Manifest
```

**Resultado usable:** el backend generado compila, supera una suite automática y publica contratos consistentes para herramientas y clientes.

## CU-08 — Frontend generado y asistentes de texto

**Objetivo:** generar la interfaz web y habilitar lenguaje natural seguro en la aplicación generada y en el editor CASE.

Máximo 3 incrementos:

1. Frontend Next.js + Material UI generado con CRUD e inferencia de controles.
2. Lenguaje intermedio + validator + executor (`LIST`, `GET`, `SEARCH`, `CREATE`, `UPDATE`, `DELETE`, `COUNT`).
3. Qwen + Domain Manifest + intención UML → `UmlCommand` + benchmark LLM.

Incluye:

- listados;
- detalle;
- create;
- edit;
- delete;
- búsqueda;
- filtros;
- paginación;
- sorting;
- relaciones;
- loading;
- errors;
- empty states;
- responsive;
- lenguaje intermedio cerrado;
- allow-list;
- tipos y campos validados;
- relaciones validadas;
- sin SQL generado;
- sin código arbitrario;
- sin URLs arbitrarias;
- benchmark de comandos;
- validez estructurada;
- falsos positivos;
- acciones rechazadas correctamente;
- latencia;
- RAM;
- VRAM;
- tiempo de carga.

**Resultado usable del Ciclo 3:** desde un modelo UML se puede generar una aplicación web completa, usar CRUD y ejecutar acciones mediante lenguaje natural validado.

---

# CICLO 4 — TRANSICIÓN, MULTIMODALIDAD Y CIERRE

## Objetivo del ciclo

Completar voz, Android, interoperabilidad, visión, operación offline/LAN y demostración final.

Al terminar el ciclo debe existir:

- voz;
- Android;
- XMI;
- imagen → UML;
- operación offline/LAN;
- flujo E2E final;
- benchmarks;
- documentación fiel a la implementación.

## CU-09 — Voz mediante Vosk y Android mediante Capacitor

**Objetivo:** reutilizar el pipeline de texto desde comandos de voz y empaquetar el frontend generado como aplicación Android.

Máximo 3 incrementos:

1. Vosk + modelo español local + captura + transcript + reutilización del pipeline de texto.
2. Benchmark STT.
3. Capacitor + proyecto Android + LAN + permisos + micrófono + build.

Benchmark STT:

- WER;
- command success rate;
- latencia;
- RAM;
- tiempo de carga;
- ruido;
- velocidad;
- pronunciación;
- micrófonos diferentes.

**Resultado usable:** texto y voz ejecutan el mismo conjunto cerrado de capacidades sin Internet y la aplicación generada puede instalarse en Android.

## CU-10 — XMI e imagen → UML

**Objetivo:** completar las entradas externas al modelo canónico.

Máximo 3 incrementos:

1. XMI 2.1 + `fast-xml-parser` + import/export + pruebas con Enterprise Architect.
2. Sharp + Florence-2 + imagen → representación UML estructurada.
3. UX de revisión + benchmark VLM + aplicación validada mediante Command Bus.

Benchmark VLM:

- precisión;
- clases/atributos/relaciones detectadas;
- falsos positivos;
- latencia;
- RAM/VRAM;
- fotos inclinadas;
- baja resolución;
- screenshots;
- diagramas manuales.

**Resultado usable:** el sistema puede intercambiar XMI y obtener propuestas UML desde imágenes sin alterar directamente el modelo canónico.

## CU-11 — Offline/LAN, E2E y cierre

**Objetivo:** demostrar la visión completa del producto y cerrar documentación.

Incluye:

- provisión local de modelos;
- funcionamiento sin Internet;
- host;
- clientes LAN/hotspot;
- pruebas multi-cliente;
- prueba E2E completa;
- integración final;
- corrección de defectos;
- builds finales;
- benchmarks consolidados;
- limitaciones;
- documentación final;
- preparación para documento Word universitario.

Flujo final esperado:

```text
crear UML manual
    ↓
validar
    ↓
guardar
    ↓
abrir desde otro cliente
    ↓
colaborar
    ↓
presencia
    ↓
UML → RelationalModel
    ↓
Spring Boot
    ↓
OpenAPI
    ↓
Postman
    ↓
Domain Manifest
    ↓
frontend
    ↓
Android
    ↓
CRUD
    ↓
texto
    ↓
voz
    ↓
XMI
    ↓
imagen
    ↓
repetir sin Internet
```

**Resultado usable del Ciclo 4:** producto final listo para demostración académica, con documentación sincronizada con la implementación real.

---

# 3. Resumen de los 4 ciclos

| Ciclo | Casos de uso | Resultado principal |
|---|---|---|
| **Ciclo 1 — Inicio y base arquitectónica** | CU-00 a CU-02 | Editor UML manual funcional en memoria |
| **Ciclo 2 — Elaboración y colaboración** | CU-03 a CU-05 | Proyectos persistidos, usuarios y colaboración |
| **Ciclo 3 — Construcción y generación** | CU-06 a CU-08 | Aplicación completa generada + asistente de texto |
| **Ciclo 4 — Transición y cierre** | CU-09 a CU-11 | Voz, Android, interoperabilidad, visión, offline y demo final |

Total:

```text
4 ciclos
12 casos de uso
CU-00 → CU-11
```

---

# 4. Orden obligatorio

```text
CICLO 1
CU-00 → CU-01 → CU-02

CICLO 2
CU-03 → CU-04 → CU-05

CICLO 3
CU-06 → CU-07 → CU-08

CICLO 4
CU-09 → CU-10 → CU-11
```

---

# 5. Regla de cierre de cada CU

Un CU se considera terminado únicamente cuando:

- criterios de aceptación cumplidos;
- tests relevantes verdes;
- pruebas manuales realizadas cuando correspondan;
- documentación actualizada;
- `CU-XX-*.md` refleja la implementación real;
- `STATUS.md` actualizado;
- OpenSpec verificado;
- usuario acepta el resultado;
- OpenSpec archivado;
- commit realizado;
- push realizado.

---

# 6. Correcciones posteriores

Si el CU todavía está activo:

- continuar usando el mismo CU;
- continuar usando el mismo OpenSpec;
- actualizar su documentación.

Si el CU ya fue cerrado y se encuentra un defecto más adelante:

1. crear un cambio OpenSpec correctivo;
2. corregir;
3. probar;
4. actualizar el documento del CU original;
5. crear un nuevo commit;
6. hacer push.

No reescribir el historial para ocultar correcciones posteriores.
