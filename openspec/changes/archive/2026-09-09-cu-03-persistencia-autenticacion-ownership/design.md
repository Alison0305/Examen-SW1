## Context

CU-02 mantiene `ProjectDocument` solo en memoria. Este cambio introduce la frontera backend persistente sin alterar la separación entre `CanonicalUmlModel` y `DiagramLayout`.

## Goals / Non-Goals

**Goals:**
- Persistir un proyecto completo por propietario con control de revisión.
- Autenticar usuarios con JWT Bearer y aplicar ownership en la API.
- Mantener contratos DTO validados y secretos fuera del código.

**Non-Goals:**
- No normalizar elementos UML, colaboración, membresías, UI de autenticación, offline/LAN, Socket.IO ni edición manual de bends.

## Decisions

- **Documento JSONB único:** `Project.document` almacena el `ProjectDocument` completo y `revision` queda en columna. Preserva el agregado y evita tablas UML divergentes. Alternativa descartada: normalizar clases, atributos y relaciones.
- **Prisma/PostgreSQL:** Prisma administra `User` y `Project`; PostgreSQL ofrece JSONB y restricciones de unicidad. Alternativa descartada: almacenamiento local o documento sin base relacional.
- **Argon2id para passwordHash:** parámetros seguros centralizados; nunca se selecciona en respuestas ni se almacena contraseña plana. Alternativa descartada: hash reversible o exposición del modelo de usuario.
- **JWT Bearer stateless:** guards únicamente en `GET /auth/me` y rutas de proyectos; `POST /auth/register` y `POST /auth/login` permanecen públicas. El payload mínimo contiene el identificador del usuario y `JWT_SECRET`/`JWT_EXPIRES_IN` se leen desde entorno.
- **Validación por capas:** DTOs validan forma HTTP; antes de persistir, el backend reutiliza los contratos y validadores de `@examen-sw1/uml-core` para validar `ProjectDocument`. No se crea un segundo modelo UML.
- **Ownership en consulta:** `POST /projects` no acepta `ownerId`; se deriva exclusivamente de `authenticatedUser.id`. `GET` y `PUT` condicionan por `id` y `ownerId` autenticado.
- **Política HTTP:** 400 para DTO o documento inválido; 401 para credenciales, JWT ausente, inválido o expirado; 409 para email duplicado o revisión stale; 404 indistinguible para proyecto inexistente o ajeno. Nunca se exponen detalles de Prisma/PostgreSQL.
- **Revisión optimista:** el proyecto inicia en `revision = 1`. `PUT` ejecuta una actualización condicional atómica por `id`, `ownerId` y `expectedRevision`, incrementando la revisión. Una revisión stale devuelve 409 estructurado para recargar y no sobrescribe documento ni revisión. Alternativa descartada: read-compare-update no condicionado y last-write-wins.

## Risks / Trade-offs

- [JSONB no permite consultas relacionales UML eficientes] → CU-03 solo requiere recuperar el agregado completo.
- [JWT comprometido] → secreto obligatorio por entorno, expiración configurable y ausencia de hashes en respuestas.
- [Conflictos concurrentes] → rechazo explícito sin sobrescritura y revisión actual disponible para recargar.

## Migration Plan

1. Agregar configuración y esquema Prisma sin migrar datos existentes, ya que CU-02 no persiste proyectos.
2. Ejecutar migración PostgreSQL al implementar Incremento 1.
3. Rollback: revertir la migración y deshabilitar las rutas nuevas; no se modifica el formato UML canónico.
