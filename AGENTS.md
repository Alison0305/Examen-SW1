# AGENTS.md

## 1. Propósito

Este archivo contiene reglas generales y permanentes para cualquier agente de IA que trabaje sobre este repositorio.

Debe leerse antes de proponer, planificar o implementar cambios.

No contiene el estado actual del proyecto ni tareas temporales. Para conocer el progreso real se debe consultar la documentación de estado, el caso de uso activo, OpenSpec, el código y los tests.

---

## 2. Fuentes de verdad

Usar las fuentes en este orden según el tipo de información:

1. `docs/product/product-01-next-nestjs.md`
   - Visión estable del producto.
   - Requisitos técnicos y de negocio.
   - Decisiones arquitectónicas globales.

2. `docs/puds/use-cases/README.md`
   - Roadmap PUDS.
   - 4 ciclos.
   - 20 casos de uso: `CU-00` a `CU-19`.
   - Orden obligatorio de implementación.

3. `docs/STATUS.md`
   - Estado real del proyecto.
   - CU activo.
   - CUs completados.
   - Problemas abiertos.
   - Siguiente acción.

4. `docs/puds/use-cases/CU-XX-*.md`
   - Registro real de lo implementado en ese caso de uso.
   - Decisiones.
   - Pruebas.
   - Cambios.
   - Limitaciones.
   - Iteraciones y correcciones.

5. `openspec/changes/`
   - Cambio técnico activo.
   - Propuesta.
   - Especificaciones.
   - Diseño.
   - Tareas.

6. Código y tests.
   - Son la evidencia final de lo que realmente está implementado.

Nunca asumir que una funcionalidad existe solo porque aparece en `product.md` o en el roadmap.

---

## 3. Metodología de trabajo

El proyecto utiliza:

- PUDS para organizar la implementación completa;
- casos de uso como unidad principal de trabajo;
- OpenSpec para especificar el cambio técnico de cada CU;
- OpenCode como agente principal de implementación;
- Git/GitHub como historial real del proyecto.

Se trabaja un solo CU a la vez.

Flujo obligatorio:

```text
seleccionar CU
    ↓
crear/revisar plan
    ↓
aprobación del usuario
    ↓
crear prompt para OpenCode
    ↓
crear o actualizar OpenSpec del CU
    ↓
implementar
    ↓
ejecutar tests
    ↓
pruebas manuales
    ↓
corregir si es necesario
    ↓
actualizar documentación
    ↓
verify OpenSpec
    ↓
aceptación del usuario
    ↓
archive OpenSpec
    ↓
actualizar STATUS
    ↓
commit
    ↓
push
    ↓
siguiente CU
```

No iniciar el siguiente CU mientras el actual siga abierto, salvo que exista una razón técnica explícita y documentada.

---

## 4. Casos de uso

Existen exactamente 20 casos de uso:

```text
CU-00 ... CU-19
```

Están agrupados en exactamente 4 ciclos PUDS.

Un CU puede dividirse internamente en incrementos más pequeños cuando sea necesario.

Reglas:

- máximo 3 incrementos internos por CU;
- los incrementos no crean nuevos números de CU;
- no crear CUs adicionales sin modificar previamente el roadmap;
- evitar fragmentación innecesaria;
- cada CU debe entregar un resultado comprobable.

---

## 5. OpenSpec

Cada CU debe tener un único cambio OpenSpec principal mientras esté activo.

Convención:

```text
cu-XX-slug
```

Ejemplo:

```text
cu-03-uml-workspace
```

Las correcciones realizadas mientras el CU siga abierto deben modificar el mismo cambio OpenSpec.

No crear un cambio OpenSpec nuevo por cada error o iteración.

Cuando el CU esté terminado:

1. ejecutar validaciones;
2. ejecutar `openspec verify` cuando corresponda;
3. obtener aceptación del usuario;
4. archivar el cambio;
5. actualizar documentación;
6. commit;
7. push.

Si se descubre posteriormente un defecto en un CU ya cerrado, crear un cambio independiente con una convención similar a:

```text
fix-cu-XX-descripcion
```

y documentar la modificación posterior en el CU original.

---

## 6. Documentación obligatoria

La documentación debe representar la implementación real.

No escribir como implementado algo que todavía no existe.

Cada CU debe generar o actualizar:

```text
docs/puds/use-cases/CU-XX-<slug>.md
```

Como mínimo debe registrar:

- objetivo;
- alcance;
- dependencias;
- implementación realizada;
- decisiones técnicas;
- archivos/componentes principales;
- pruebas automatizadas;
- pruebas manuales;
- errores encontrados;
- correcciones;
- limitaciones conocidas;
- deuda técnica, si existe;
- resultado final;
- commit de cierre cuando corresponda.

Actualizar también los documentos arquitectónicos o de producto solamente cuando el cambio realmente lo requiera.

`product-01-next-nestjs.md` no es un changelog.

---

## 7. Estado y handoff

`docs/STATUS.md` debe responder:

- en qué CU estamos;
- qué CUs están terminados;
- qué está pendiente;
- qué problemas están abiertos;
- cuál es la siguiente acción.

`docs/HANDOFF.md` se usa para cambiar de chat o sesión.

Debe ser corto y contener únicamente contexto operativo vigente:

- CU activo;
- OpenSpec activo;
- incremento actual;
- trabajo terminado;
- trabajo pendiente;
- errores actuales;
- decisiones recientes importantes;
- tests actuales;
- siguiente acción exacta.

No convertir `HANDOFF.md` en un historial completo.

---

## 8. Principios arquitectónicos obligatorios

### Modelo UML

`CanonicalUmlModel` es la fuente de verdad semántica.

`DiagramLayout` contiene únicamente información visual.

React Flow proyecta el modelo; nunca debe convertirse en el dominio persistido.

La estructura conceptual es:

```text
ProjectDocument
├── UmlModel
└── DiagramLayout
```

---

## 9. Mutaciones UML

Toda mutación debe pasar conceptualmente por:

```text
adaptador
   ↓
UmlCommand
   ↓
UmlCommandBus
   ↓
UmlCommandExecutor
   ↓
ProjectDocument
```

Esto aplica a:

- UI manual;
- Undo/Redo;
- colaboración;
- IA;
- voz;
- importación cuando corresponda.

No permitir que la IA, React Flow o un controlador modifiquen el modelo canónico saltándose esta ruta cuando el diseño del CU ya haya establecido el Command Bus.

---

## 10. Validación

Debe existir un único motor de validación reutilizable.

Será utilizado por:

- edición;
- guardado;
- importación;
- colaboración;
- generación;
- asistentes.

Los diagnósticos deben ser estructurados y navegables.

Los errores bloqueantes deben impedir operaciones inválidas cuando corresponda.

---

## 11. Stack de la aplicación principal

Mantener las decisiones del documento de producto.

### Frontend

- Next.js App Router;
- TypeScript;
- Material UI;
- `@xyflow/react`;
- ELK.js;
- Zustand;
- `socket.io-client`.

### Backend

- Node.js 24 LTS;
- TypeScript;
- NestJS 11;
- Fastify;
- Prisma;
- PostgreSQL;
- Socket.IO;
- JWT Bearer;
- `class-transformer`;
- `class-validator`.

No sustituir estas tecnologías sin una decisión explícita documentada.

---

## 12. Aplicación generada

El backend generado es independiente del backend interno de la herramienta CASE.

Backend generado obligatorio:

- Java 21 LTS;
- Spring Boot 4.x;
- Gradle;
- Spring Web MVC;
- Spring Data JPA;
- Hibernate;
- Jakarta Validation;
- Jackson;
- springdoc-openapi;
- PostgreSQL.

Frontend generado:

- Next.js App Router;
- Material UI.

Android:

- Capacitor sobre el frontend generado.

No sustituir Spring Boot por NestJS en el backend generado.

---

## 13. Generación de código

Usar Handlebars para plantillas.

Evitar concatenaciones manuales extensas de código fuente.

La generación debe ser determinista a partir de:

```text
CanonicalUmlModel
      ↓
RelationalModel
      ↓
artefactos generados
```

La IA no debe decidir reglas relacionales en runtime.

---

## 14. OpenAPI

Normalización del proyecto:

### API principal NestJS

Usar:

```text
@nestjs/swagger
```

### Backend Spring generado

Usar:

```text
springdoc-openapi
```

La Postman Collection de una aplicación generada debe derivarse del OpenAPI del backend Spring generado.

No mezclar responsabilidades entre ambas APIs.

---

## 15. IA, lenguaje natural y seguridad

Runtime decidido:

- node-llama-cpp;
- Transformers.js.

Modelo inicial de texto:

- Qwen3 1.7B cuantizado.

El asistente debe utilizar un lenguaje intermedio cerrado y validable.

Operaciones iniciales:

```text
LIST
GET
SEARCH
CREATE
UPDATE
DELETE
COUNT
```

Principios obligatorios:

- salida estructurada;
- allow-list de operaciones;
- allow-list de entidades;
- allow-list de campos;
- validación de tipos;
- validación de relaciones;
- confirmación de operaciones destructivas cuando corresponda;
- sin SQL generado y ejecutado por IA;
- sin ejecución de código generado por IA;
- sin URLs arbitrarias generadas por IA.

La IA propone intenciones estructuradas. Los validadores y ejecutores deterministas deciden si pueden aplicarse.

---

## 16. Voz

Tecnología inicial:

- Vosk;
- modelo local de español;
- bindings de Node.js.

Flujo conceptual:

```text
audio
 ↓
STT
 ↓
texto
 ↓
parser/intérprete
 ↓
comando estructurado
 ↓
validador
 ↓
executor
```

La voz no debe introducir una segunda lógica de negocio paralela.

---

## 17. Visión

Tecnología inicial:

- Sharp;
- Florence-2;
- Transformers.js.

La salida imagen → UML debe considerarse una propuesta.

Nunca aplicar directamente la salida multimodal al modelo canónico sin:

1. representación estructurada;
2. validación;
3. revisión/aprobación cuando corresponda;
4. Command Bus.

---

## 18. Benchmarks

Las configuraciones de servicios/modelos que admitan tuning deben medirse antes de declarar una configuración como definitiva.

Benchmarks previstos:

- LLM;
- STT;
- VLM.

Nunca inventar métricas.

Registrar cuando aplique:

- dataset;
- configuración;
- versión/modelo;
- hardware;
- precisión;
- porcentaje de acierto;
- fallos;
- latencia;
- p50/p95 cuando sea útil;
- RAM;
- VRAM;
- tiempo de carga;
- observaciones manuales.

Las comparaciones entre modelos/prompts/configuraciones deben quedar documentadas.

Los benchmarks deben poder repetirse.

---

## 19. Testing

### Backend principal

- Vitest;
- `@nestjs/testing`;
- Supertest.

### Frontend

- Vitest;
- React Testing Library.

### E2E

- Playwright.

### Generadores

Verificar como mínimo:

- archivos;
- sintaxis;
- compilación;
- relaciones;
- OpenAPI;
- Postman;
- Domain Manifest;
- frontend;
- backend;
- comandos del asistente cuando aplique.

No cerrar un CU con tests relevantes rotos.

---

## 20. Alcance

No implementar funcionalidades de CUs futuros solo porque parezcan sencillas.

Si una funcionalidad futura es necesaria como dependencia técnica del CU actual:

1. implementar únicamente la parte mínima necesaria;
2. documentar la razón;
3. evitar completar anticipadamente el CU futuro.

Mantener cada cambio pequeño, revisable y trazable.

---

## 21. Dependencias

No agregar librerías porque sí.

Antes de introducir una dependencia importante:

- verificar que resuelva una necesidad real;
- revisar compatibilidad con el stack;
- evitar duplicar librerías existentes;
- preferir soluciones del stack ya decidido.

No cambiar versiones mayores del stack sin justificarlo.

---

## 22. Configuración y secretos

Nunca commitear:

- `.env`;
- passwords;
- tokens;
- claves API;
- secretos JWT;
- credenciales de PostgreSQL;
- modelos binarios pesados;
- artefactos locales innecesarios.

Mantener `.env.example` actualizado cuando se agreguen variables nuevas.

---

## 23. Git

Trabajar con commits lógicos.

Al finalizar un CU deben entregarse los comandos necesarios para:

```bash
git status
git add .
git commit -m "<mensaje>"
git push
```

El mensaje debe describir el cambio realmente terminado.

No hacer push después de cada modificación pequeña durante una iteración.

Preferir:

- commits locales coherentes durante trabajos grandes si son necesarios;
- push al completar el CU o un bloque suficientemente estable;
- push anticipado solo cuando exista una razón real.

Si posteriormente se corrige un CU ya terminado, crear un nuevo commit. No reescribir la historia para fingir que el error nunca existió.

---

## 24. Forma de explicar instrucciones al usuario

No asumir que el usuario conoce un procedimiento técnico.

Cuando una acción requiera intervención manual:

- indicar desde qué carpeta ejecutar el comando;
- dar el comando completo;
- explicar brevemente qué debe ocurrir;
- indicar cómo comprobar que salió bien;
- distinguir PowerShell, CMD, Bash u otras herramientas cuando sea necesario.

Evitar instrucciones ambiguas como:

> configura la base de datos

Preferir instrucciones ejecutables paso a paso.

---

## 25. Regla final

Antes de implementar cualquier cambio, verificar:

1. ¿Qué CU está activo?
2. ¿Este cambio pertenece al CU?
3. ¿Existe un OpenSpec activo para él?
4. ¿Qué documento debe actualizarse?
5. ¿Qué pruebas demostrarán que funciona?
6. ¿Se respetan las decisiones de `product.md`?
7. ¿Se está adelantando trabajo de un CU futuro?

Si alguna respuesta no está clara, revisar primero la documentación existente.
