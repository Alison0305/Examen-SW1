## Context

El workspace persiste un `ProjectDocument` que contiene `uml` canónico y `layout` visual. CU-06 ya provee `mapToRelationalModel`, `generateSpringBackend` y `GeneratedFile[]`, pero no existe una ruta UI/API/descarga que los use con un proyecto real.

## Goals / Non-Goals

**Goals:**
- Conectar una acción visible del workspace con una exportación autenticada del proyecto persistido.
- Producir un ZIP descargable en memoria a partir de los archivos existentes del generador.
- Mantener una única ruta semántica `CanonicalUmlModel -> RelationalModel -> spring-generator`.
- Verificar el flujo con pruebas unitarias, HTTP e integración, más una prueba manual y compilación del ZIP extraído.

**Non-Goals:**
- No modificar `spring-generator`, sus templates, el formato de `ProjectDocument` ni `DiagramLayout`.
- No rehacer capacidades de CRUD, OpenAPI, Postman, Domain Manifest, asistentes, voz o Capacitor.
- No persistir exports, introducir versiones Java alternativas ni toggles de dependencias que el generador no soporte.

## Decisions

### Exportación mediante POST autenticado

Se usará `POST /projects/:id/exports/spring` con un cuerpo limitado a `basePackage`. La creación de un artefacto y la configuración mínima justifican POST; la respuesta es el ZIP directamente. La alternativa GET con parámetros expone configuración en URL y no representa bien una generación.

El controlador reutilizará `JwtAuthGuard` y `ProjectAccessService.requireView`. Exportar es lectura del proyecto y VIEWER ya puede consultar su documento; no se crea un permiso nuevo ni se permite mutar el documento.

### Documento persistido como única entrada

El servicio cargará el proyecto mediante la persistencia existente después de autorizarlo. Tomará exclusivamente `project.document.uml`, validará el `ProjectDocument`/modelo canónico y llamará a `mapToRelationalModel`. `project.document.layout` no se pasa al mapper ni al generator. La alternativa de enviar UML desde el navegador permitiría exportar un estado no autorizado o no guardado y se descarta.

Las clases creadas por el workspace no incluyen `generationMetadata`. El mapper las tratará como entidades salvo que declaren explícitamente `entity: false`, y reconocerá el atributo convencional `id` como identifier cuando no exista una decisión explícita. Esto mantiene el modelo canónico como única fuente, permite exportar documentos persistidos existentes y conserva la exclusión/clave explícitas.

### Reutilización de la generación existente

El servicio construirá la configuración permitida con Java 21 fijo y el paquete base solicitado, llamará una sola vez a `generateSpringBackend(relationalModel, config)`. No copiará templates ni creará un segundo mapper/generator. Antes de generar rechazará un modelo sin tablas exportables o con diagnósticos bloqueantes.

### ZIP streaming en memoria y nombres seguros

Se agregará una dependencia ZIP mantenida y compatible con streams de Node para escribir los `GeneratedFile[]` a una respuesta Fastify sin directorio persistente. Cada entrada conservará su ruta lógica ya validada por el writer/generator y se validará nuevamente contra traversal antes de archivarla. El archivo se llamará con un prefijo fijo y el UUID de proyecto, con `Content-Type: application/zip` y `Content-Disposition: attachment`.

La alternativa de escribir un proyecto temporal y comprimirlo agrega limpieza y exposición de filesystem innecesarias; se descarta. Un ZIP no se generará si falla cualquier etapa previa o de archivado.

### Interfaz mínima en el app bar

`WorkspaceAppBar` recibirá una acción de exportación para proyectos persistidos con acceso de lectura. Un diálogo mantiene el paquete base editable y validado localmente; Java 21 se muestra como valor fijo. No se mostrarán toggles de dependencias porque el generator actual no ofrece configuraciones opcionales. El cliente autenticado solicitará un Blob, activará la descarga y mostrará estados de generación/error sin navegar fuera del workspace.

## Risks / Trade-offs

- [ZIP grande consume memoria] → Los exports iniciales se limitan al proyecto actual y se transmiten sin persistencia; las pruebas cubren cierre y error del stream.
- [Documento guardado puede diferir de cambios locales] → La UI debe comunicar que se exporta la última versión guardada; el endpoint nunca acepta UML del cliente.
- [Errores de modelo pueden ser técnicos] → Backend traduce diagnósticos a mensajes seguros y frontend no muestra stack traces.
- [VIEWER descarga código] → Es coherente con `requireView`; si el producto exige restringir exportaciones se requerirá una decisión de permisos posterior.

## Migration Plan

1. Añadir el módulo de exportación y la dependencia ZIP, sin cambios de esquema ni migraciones.
2. Añadir el cliente y la acción de workspace para proyectos con API disponible.
3. Validar con documento persistido, ZIP extraído y compilación Java 21; rollback elimina la ruta y la acción sin afectar documentos existentes.
