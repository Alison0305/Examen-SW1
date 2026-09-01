# PUDS — Casos de uso y ciclos de implementación

## 1. Propósito

Este documento organiza la implementación del proyecto mediante el Proceso Unificado de Desarrollo de Software (PUDS).

La planificación contiene:

- exactamente **4 ciclos**;
- exactamente **20 casos de uso**;
- numeración de `CU-00` a `CU-19`;
- orden lineal de implementación;
- incrementos utilizables al finalizar cada ciclo.

Los casos de uso se implementan uno por uno.

Cada CU puede dividirse internamente en un máximo de 3 incrementos si su tamaño lo requiere.

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

Construir una base ejecutable y estabilizar los conceptos fundamentales sobre los que dependerá todo el producto.

Al terminar el ciclo debe existir:

- repositorio reproducible;
- frontend y backend conectados;
- modelo UML canónico;
- validación;
- Command Bus;
- Undo/Redo;
- editor UML manual funcional.

Este ciclo evita iniciar persistencia, colaboración, generación o IA antes de estabilizar el núcleo.

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

## CU-01 — Modelo UML canónico y ProjectDocument

**Objetivo:** crear la fuente de verdad semántica del editor.

Incluye:
- `CanonicalUmlModel`;
- `ProjectDocument`;
- `DiagramLayout`;
- UUID;
- revisión;
- timestamps;
- clases;
- atributos;
- operaciones cuando correspondan;
- enums;
- tipos;
- visibilidad;
- asociaciones;
- agregación;
- composición;
- generalización;
- multiplicidades;
- paquetes cuando sean necesarios;
- metadatos de generación.

**Resultado usable:** es posible crear y serializar un modelo UML completo sin depender de React Flow.

## CU-02 — Validación UML

**Objetivo:** crear un único motor de validación reutilizable.

Incluye:
- severity;
- code;
- mensaje;
- path lógico;
- referencia al elemento;
- errores;
- warnings;
- reglas iniciales UML;
- API reutilizable por otros módulos.

**Resultado usable:** un `CanonicalUmlModel` puede validarse de forma determinista y producir diagnósticos estructurados.

## CU-03 — Command Bus y Undo/Redo

**Objetivo:** crear una única ruta de mutación del modelo UML.

Incluye:
- `UmlCommand`;
- `UmlCommandBus`;
- `UmlCommandExecutor`;
- familias iniciales de comandos;
- integración con validación;
- historial configurable;
- Undo;
- Redo;
- límite inicial de 100 operaciones.

**Resultado usable:** el modelo puede modificarse mediante comandos tipados y revertir cambios.

## CU-04 — Workspace y editor UML manual

**Objetivo:** construir el primer editor UML usable.

Incluye:
- app bar;
- sidebar;
- breadcrumbs;
- canvas;
- inspector;
- toolbox;
- status bar;
- React Flow;
- nodos custom;
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
- administración de proyectos;
- realtime;
- presencia;
- membresías;
- invitaciones.

## CU-05 — Persistencia de proyectos

**Objetivo:** persistir `ProjectDocument` y recuperar el estado completo del editor.

Incluye:
- PostgreSQL;
- Prisma;
- migraciones;
- persistencia de UML;
- persistencia de layout;
- metadata;
- revisión optimista;
- rechazo de escrituras stale;
- round-trip de guardado/apertura.

**Resultado usable:** un proyecto puede guardarse, cerrar la aplicación y abrirse nuevamente sin pérdida de información.

## CU-06 — Autenticación y ownership

**Objetivo:** agregar identidad y autorización sobre los proyectos.

Incluye:
- registro;
- login;
- JWT Bearer;
- credenciales seguras;
- ownerId;
- autorización;
- consultas filtradas por usuario;
- rutas protegidas.

**Resultado usable:** cada usuario puede acceder únicamente a sus recursos autorizados.

## CU-07 — Landing y gestión de proyectos

**Objetivo:** completar el flujo principal desde entrada al producto hasta workspace.

Incluye:
- landing;
- login/register UI;
- listado de proyectos;
- crear;
- abrir;
- renombrar cuando corresponda;
- eliminar cuando corresponda;
- estados loading/error/empty;
- navegación al workspace;
- responsive.

**Resultado usable:** un usuario puede entrar al producto, autenticarse, gestionar proyectos y abrir el editor.

## CU-08 — Colaboración realtime y presencia

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
- conexión/desconexión;
- selección remota;
- cursor;
- elemento editado;
- última actividad;
- avatares;
- estados online/offline.

**Resultado usable:** dos clientes autorizados pueden editar el mismo proyecto y ver cambios/presencia.

## CU-09 — Membresías e invitaciones

**Objetivo:** controlar el acceso colaborativo a un proyecto.

Incluye:
- `ProjectMembership`;
- roles mínimos;
- `ProjectInvitation`;
- expiración;
- token de invitación;
- aceptación;
- rechazo;
- autorización de conexión realtime;
- controles básicos desde UI.

**Resultado usable del Ciclo 2:** un propietario puede invitar a otra persona y ambos pueden trabajar sobre un proyecto persistido de forma colaborativa.

---

# CICLO 3 — CONSTRUCCIÓN Y GENERACIÓN DE APLICACIONES

## Objetivo del ciclo

Transformar el modelo UML en aplicaciones ejecutables y agregar asistentes locales de texto.

Al terminar el ciclo debe existir:

- UML → RelationalModel;
- backend Spring Boot generado;
- pruebas automáticas del generador;
- OpenAPI;
- Postman;
- Domain Manifest;
- frontend generado;
- asistente de texto seguro.

## CU-10 — UML → RelationalModel

**Objetivo:** implementar una transformación determinista UML → modelo relacional.

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
- diagnósticos para casos no soportados.

**Resultado usable:** un modelo UML válido produce siempre el mismo modelo relacional.

## CU-11 — Generador de backend Spring Boot

**Objetivo:** generar un backend Java compilable mediante Handlebars.

Incluye:
- Java 21;
- Spring Boot 4.x;
- Gradle;
- Spring Web MVC;
- Spring Data JPA;
- Hibernate;
- PostgreSQL;
- Jakarta Validation;
- Jackson;
- configuración;
- entidades;
- repositories;
- services;
- controllers.

**Resultado usable:** un modelo representativo genera un backend Spring Boot que compila.

## CU-12 — CRUD avanzado y verificación del generador

**Objetivo:** completar capacidades de backend y crear una prueba reproducible contra regresiones.

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
- fixtures;
- compilación Gradle;
- pruebas API;
- pruebas de relaciones;
- matriz de metadatos.

**Resultado usable:** el backend generado compila y supera una suite automática de funcionamiento.

## CU-13 — OpenAPI, Postman y Domain Manifest

**Objetivo:** generar contratos y metadatos derivados de la aplicación.

Incluye:
- `springdoc-openapi` para backend generado;
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

**Resultado usable:** la aplicación generada dispone de contratos machine-readable consistentes.

## CU-14 — Frontend Next.js generado

**Objetivo:** generar una interfaz web funcional para el backend generado.

Incluye:
- Next.js App Router;
- Material UI;
- listados;
- detalle;
- create;
- edit;
- delete;
- inferencia de controles;
- búsqueda;
- filtros;
- paginación;
- sorting;
- relaciones;
- loading;
- errors;
- empty states;
- responsive.

**Resultado usable:** la aplicación generada puede utilizar visualmente las capacidades CRUD del backend.

## CU-15 — Asistentes de texto y benchmark LLM

**Objetivo:** agregar lenguaje natural seguro tanto a la aplicación generada como al editor UML.

Máximo 3 incrementos:

1. Lenguaje intermedio + validator + executor (`LIST`, `GET`, `SEARCH`, `CREATE`, `UPDATE`, `DELETE`, `COUNT`).
2. Qwen + Domain Manifest para la aplicación generada.
3. Qwen + intención UML → `UmlCommand` para el editor CASE.

Seguridad:
- sin SQL generado;
- sin código arbitrario;
- sin URLs arbitrarias;
- allow-list;
- tipos validados;
- campos validados;
- relaciones validadas.

Benchmark obligatorio:
- porcentaje de comandos correctos;
- validez estructurada;
- falsos positivos;
- acciones rechazadas correctamente;
- latencia;
- RAM;
- VRAM;
- tiempo de carga;
- comparación de prompts/configuración cuando corresponda.

**Resultado usable del Ciclo 3:** desde un modelo UML se puede generar una aplicación web completa, usar CRUD y ejecutar acciones mediante lenguaje natural validado.

---

# CICLO 4 — TRANSICIÓN, MULTIMODALIDAD Y CIERRE

## Objetivo del ciclo

Completar las entradas/salidas restantes, demostrar operación offline y preparar el producto para su presentación final.

Al terminar el ciclo debe existir:

- voz;
- Android;
- XMI;
- imagen → UML;
- operación offline/LAN;
- flujo E2E final;
- benchmarks;
- documentación fiel a la implementación.

## CU-16 — Voz mediante Vosk y benchmark STT

**Objetivo:** convertir comandos breves de voz en las mismas acciones estructuradas ya soportadas por texto.

Incluye:
- Vosk;
- modelo español local;
- bindings Node.js;
- captura de audio;
- transcript;
- revisión;
- reutilización del pipeline de texto;
- comandos de editor;
- comandos de aplicación generada.

Benchmark obligatorio:
- WER;
- command success rate;
- latencia;
- RAM;
- tiempo de carga;
- ruido;
- velocidad;
- pronunciación;
- micrófonos diferentes.

**Resultado usable:** texto y voz pueden ejecutar el mismo conjunto cerrado de capacidades sin Internet.

## CU-17 — Android mediante Capacitor

**Objetivo:** empaquetar el frontend generado como aplicación Android.

Incluye:
- Capacitor;
- proyecto Android;
- configuración del backend;
- LAN;
- permisos;
- micrófono;
- build;
- prueba en emulador o dispositivo.

**Resultado usable:** una aplicación generada puede instalarse y utilizarse desde Android.

## CU-18 — XMI e imagen → UML

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

## CU-19 — Offline/LAN, E2E y cierre

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
| **Ciclo 1 — Inicio y base arquitectónica** | CU-00 a CU-04 | Editor UML manual funcional en memoria |
| **Ciclo 2 — Elaboración y colaboración** | CU-05 a CU-09 | Proyectos persistidos, usuarios y colaboración |
| **Ciclo 3 — Construcción y generación** | CU-10 a CU-15 | Aplicación completa generada + asistente de texto |
| **Ciclo 4 — Transición y cierre** | CU-16 a CU-19 | Voz, Android, interoperabilidad, visión, offline y demo final |

Total:

```text
4 ciclos
20 casos de uso
CU-00 → CU-19
```

---

# 4. Orden obligatorio

```text
CICLO 1
CU-00 → CU-01 → CU-02 → CU-03 → CU-04

CICLO 2
CU-05 → CU-06 → CU-07 → CU-08 → CU-09

CICLO 3
CU-10 → CU-11 → CU-12 → CU-13 → CU-14 → CU-15

CICLO 4
CU-16 → CU-17 → CU-18 → CU-19
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
