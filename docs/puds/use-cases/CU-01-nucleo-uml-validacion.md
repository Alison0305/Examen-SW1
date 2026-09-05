# CU-01 — Núcleo UML canónico y validación

## Objetivo

Construir el núcleo semántico reutilizable del sistema UML sin depender del canvas, React Flow, persistencia ni colaboración.

## Alcance

Implementado en CU-01:

- workspace independiente `uml-core/` en la raíz;
- paquete conceptual `@examen-sw1/uml-core`;
- integración con npm workspaces;
- `ProjectDocument` con UUID, revisión, timestamps, `uml` y `layout`;
- `CanonicalUmlModel` como fuente de verdad semántica;
- `DiagramLayout` separado de la semántica;
- clases, atributos, operaciones, parámetros, enumeraciones y paquetes UML;
- tipos primitivos y referencias a clases/enumeraciones;
- visibilidad `public`, `private`, `protected` y `package`;
- relaciones Association, Aggregation, Composition y Generalization;
- multiplicidades estructuradas con `lower` y `upper`;
- `generationMetadata` separado de UML estándar;
- serialización JSON y reconstrucción sin pérdida;
- motor de validación determinista;
- diagnósticos estructurados con `severity`, `code`, `message`, `path` y `elementId` opcional;
- demo ejecutable `npm run demo:uml`;
- 33/33 tareas completadas.

Fuera de alcance de CU-01:

- React Flow;
- canvas UML;
- workspace gráfico;
- toolbox;
- inspector;
- Zustand;
- ELK.js;
- UmlCommand;
- Command Bus;
- Undo/Redo;
- Prisma;
- PostgreSQL;
- persistencia;
- autenticación;
- JWT;
- ownership;
- Socket.IO;
- colaboración;
- generación Spring Boot;
- OpenAPI generado;
- Postman;
- Domain Manifest;
- IA;
- Qwen;
- voz;
- Vosk;
- Florence-2;
- XMI;
- Capacitor.

CU-02 todavía no está iniciado.

## Dependencias

Runtime:

- Node.js 24 LTS.

Tooling y tests:

- TypeScript;
- ESLint;
- Vitest.

No se agregaron dependencias de CU-02 ni de CUs posteriores.

## Implementación Realizada

`uml-core/` contiene el núcleo UML reutilizable. El paquete no depende de `frontend/`, `backend/`, React Flow, Prisma, PostgreSQL ni servicios externos.

`ProjectDocument` contiene `id`, `revision`, `createdAt`, `updatedAt`, `uml` y `layout`.

`CanonicalUmlModel` contiene `classes`, `enumerations`, `packages` y `relationships`.

`DiagramLayout` contiene entradas visuales por `elementId` con `x`, `y`, `width` opcional y `height` opcional. No duplica nombres UML, atributos, operaciones, relaciones, multiplicidades, tipos, paquetes ni metadatos semánticos.

El dominio UML diferencia tipos primitivos de referencias a clases o enumeraciones. Las multiplicidades se representan mediante estructura `lower`/`upper`, permitiendo upper ilimitado con `unbounded`.

El validador produce diagnósticos deterministas con severidades `error` y `warning`. Los errores son bloqueantes para operaciones futuras; los warnings no bloquean por defecto.

## Decisiones Técnicas

- Se creó `uml-core/` como workspace independiente para reutilización posterior por frontend, backend, importación, colaboración, generación y asistentes.
- Se usó `crypto.randomUUID` de Node.js para generar UUID sin agregar dependencias externas.
- Se permitió inyección de `uuidFactory` y fecha en `createProjectDocument` para tests deterministas.
- Se mantuvo `DiagramLayout` como estructura visual separada para preservar `CanonicalUmlModel` como fuente semántica.
- Se representaron tipos UML mediante unión discriminada entre primitivos y referencias.
- Se representó multiplicidad como estructura validable, no como texto libre.
- Se mantuvo `generationMetadata` en un campo separado para no mezclar perfil del generador con UML estándar.
- El validador ordena diagnósticos por path, código, elementId y mensaje para garantizar determinismo.

## OpenSpec

- Cambio archivado: `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`.
- Spec principal sincronizada: `openspec/specs/nucleo-uml-validacion/spec.md`.
- Requirements reales: 11.
- Scenarios reales: 48.
- OpenSpec activo: ninguno.

## Archivos Principales

- `package.json`
- `package-lock.json`
- `uml-core/package.json`
- `uml-core/tsconfig.json`
- `uml-core/tsconfig.build.json`
- `uml-core/eslint.config.mjs`
- `uml-core/vitest.config.ts`
- `uml-core/src/model.ts`
- `uml-core/src/validation.ts`
- `uml-core/src/demo.ts`
- `uml-core/src/index.ts`
- `uml-core/src/model.test.ts`
- `uml-core/src/uml-domain.test.ts`
- `uml-core/src/validation.test.ts`
- `openspec/specs/nucleo-uml-validacion/spec.md`
- `openspec/changes/archive/2026-09-04-cu-01-nucleo-uml-validacion/`

## Pruebas Automatizadas

Comandos ejecutados durante la implementación y verificación:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run demo:uml
openspec validate "cu-01-nucleo-uml-validacion" --strict
openspec validate --specs --strict
```

Resultado:

- frontend: 4 tests correctos;
- backend: 4 tests correctos;
- `uml-core`: 22 tests correctos;
- total: 30 tests correctos;
- lint correcto;
- typecheck correcto;
- build correcto;
- demo correcta;
- OpenSpec del cambio validó correctamente antes del archive;
- specs principales validaron correctamente después del archive.

Cobertura incluida:

- creación de `ProjectDocument` vacío;
- UUID, revisión y timestamps;
- `CanonicalUmlModel` vacío;
- separación `DiagramLayout` / semántica UML;
- serialización y round-trip JSON;
- visibilidad;
- tipos primitivos y referencias UML;
- clases, atributos, operaciones y parámetros;
- enumeraciones y paquetes;
- relaciones Association, Aggregation, Composition y Generalization;
- multiplicidades finitas e ilimitadas;
- `generationMetadata` separado;
- `ValidationResult` y `Diagnostic`;
- UUID inválidos y duplicados;
- nombres obligatorios y duplicados;
- referencias y tipos inexistentes;
- relaciones inválidas;
- generalización a sí misma;
- ciclos de herencia;
- multiplicidades inválidas;
- paquetes padre inexistentes;
- ciclos entre paquetes;
- layout con referencias inexistentes;
- revisión inválida;
- `generationMetadata` incoherente;
- determinismo del orden de diagnósticos.

## Prueba Manual

Comando ejecutado por el usuario desde la raíz:

```powershell
npm run demo:uml
```

Resultado: la demo fue correcta y la prueba manual del usuario quedó aprobada.

Salida registrada:

```text
Proyecto creado correctamente.
Clases: 2
Enumeraciones: 1
Relaciones: 1

Validación:
0 errores
0 advertencias
Serialización JSON: correcta

Modelo inválido:
Validación:
2 errores
1 advertencias
UML_DUPLICATE_ID classes[0].attributes[1].id
UML_INVALID_MULTIPLICITY classes[0].attributes[1].multiplicity
UML_INCOHERENT_GENERATION_METADATA classes[0].attributes[2].generationMetadata.defaultSort
```

## Aceptación

El usuario aceptó explícitamente CU-01 con la frase: `Acepto el CU-01`.

## Errores Encontrados

- La primera configuración de `uml-core` incluyó `vitest.config.ts` en `tsconfig.json` con `rootDir` apuntando a `src`, lo que produjo errores de typecheck/build y artefactos generados fuera de `dist`.
- La ejecución paralela de `npm run typecheck` con `npm run build` provocó una condición de carrera temporal sobre `.next/types` del frontend.
- Algunos tests iniciales del validador esperaban listas exactas de códigos aunque el validador emitía diagnósticos derivados válidos adicionales.
- El reporte manual de `/opsx-verify` resumió 12 requirements cubiertos, pero el conteo automático real del spec confirmó 11 Requirements y 48 Scenarios.

## Correcciones

- Se excluyó `vitest.config.*` de lint y se limitó `tsconfig.json` de `uml-core` a `src/**/*.ts`.
- Se eliminaron los artefactos generados accidentalmente fuera de `dist`.
- Se reejecutó `npm run typecheck` de forma independiente después de la carrera con `next build`.
- Se ajustaron los tests del validador para comprobar los códigos relevantes sin impedir diagnósticos derivados coherentes.
- Se confirmó que el resumen de 12 requirements fue solo un error de conteo/resumen y no un problema del spec.

## Limitaciones Conocidas

- El modelo implementa el subconjunto de UML 2.5.1 aprobado para diagramas de clases; no pretende ser un metamodelo UML completo.
- `generationMetadata` es declarativo y no ejecuta generación, persistencia ni UI en CU-01.
- `npm audit --omit=dev` conserva vulnerabilidades transitivas conocidas de CU-00 que requieren upgrades mayores propuestos por npm.
- `next build` mantiene la advertencia no bloqueante de detección del plugin ESLint de Next con flat config.
- `npm install` muestra una advertencia de `allowScripts` para `esbuild@0.28.2`.

## Deuda Técnica

- Revisar en un cambio posterior si se requiere versionado explícito del contrato JSON para migraciones.
- Ampliar validaciones específicas de generación, persistencia o UI en los CUs correspondientes, sin adelantar ese comportamiento en CU-01.

## Resultado Final

CU-01 está implementado, verificado, aceptado, archivado, con spec principal sincronizada, commit principal creado y push realizado correctamente.

CU-02 todavía no está iniciado.

## Commit De Cierre

Commit principal:

`5256252 feat: completar núcleo UML y validación CU-01`

Estado:

Subido correctamente a `origin/main`.

Este commit `5256252` es el commit principal de cierre de CU-01. Un commit documental posterior puede registrar este estado final sin requerir otra actualización de hash para evitar un ciclo de commits documentales.
