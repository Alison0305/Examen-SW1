## Why

CU-2P-05 entrega recomendaciones técnicas `READ_ONLY` con un indicador `requiresUmlChange`, pero no produce operaciones UML aplicables, referencias estructuradas ni identificadores. CU-2P-06 (issue #6, RF-18 a RF-21) permite que el Mentor IA actúe como apoyo al modelado: una solicitud de modificación se convierte en una propuesta UML estructurada, validada contra el documento autoritativo, previsualizada de forma determinista y aplicada solo tras confirmación explícita del desarrollador, mediante los comandos y validadores existentes.

Requisitos oficiales (texto sin modificar):

- **RF-18:** El sistema deberá poder recibir de la IA propuestas de cambios UML en una estructura conocida y validable.
- **RF-19:** El sistema deberá mostrar una vista previa del cambio propuesto antes de aplicarlo.
- **RF-20:** El sistema deberá solicitar confirmación del desarrollador antes de modificar el modelo.
- **RF-21:** El sistema deberá ejecutar los cambios mediante los comandos/validadores existentes y registrar su resultado.

## What Changes

- Nuevo módulo independiente de propuestas del Mentor (`backend/src/mentor-proposals/`), separado de las recomendaciones de CU-2P-05, que permanecen `READ_ONLY` y sin cambios.
- Contrato con dos representaciones separadas: intención generada (solo nombres, sin UUID) y comando resuelto por el servidor (exactamente un `UmlCommand`, con todos los identificadores asignados al crear la propuesta).
- Allow-list inicial: únicamente `ADD_ATTRIBUTE` → `AddAttribute`. Las uniones son discriminadas para ampliar el catálogo sin romper el formato.
- Estados persistentes `PENDING`, `APPLIED` y `REJECTED`; una propuesta obsoleta sigue `PENDING` y no puede aplicarse.
- Vista previa determinista ejecutada sobre una copia desechable del documento, con diff y diagnósticos públicos que no provienen del modelo de IA.
- Aplicación confirmada por `proposalId` mediante `ProjectOperationService.apply`, reutilizando autorización de edición, cola por proyecto, control de revisión, `ProjectOperationReceipt` e idempotencia; rechazo explícito persistido.
- Rutas previstas: `POST /projects/:projectId/mentor/proposals`, `GET .../mentor/proposals/:proposalId`, `POST .../:proposalId/apply` y `POST .../:proposalId/reject`, todas con `requireEdit`.
- Fase 1 entrega solo el contrato puro, sus pruebas estructurales y este cambio OpenSpec.

## Capabilities

### New Capabilities
- `mentor-uml-proposals`: propuestas UML estructuradas, validadas, previsualizadas y aplicadas solo tras confirmación, con estado persistente y resultado registrado.

### Modified Capabilities
- Ninguna en esta fase. La integración visual con la recomendación de CU-2P-05 (tarea 9) evaluará si requiere un delta de `mentor-technical-recommendations`; la recomendación seguirá siendo de solo lectura.

## Impact

- Backend: nuevo módulo `mentor-proposals` (contrato en Fase 1; resolver, diff, persistencia, servicio y controlador en fases posteriores).
- Persistencia: nueva entidad `MentorProposal` con migración Prisma aditiva en la Fase 4. Ninguna tabla existente cambia.
- Colaboración: exportación de `ProjectOperationService` y difusión aditiva del ACK `ACCEPTED` en la Fase 5, sin una segunda ruta de mutación.
- Frontend: sección de propuesta con diff, Aplicar, Rechazar y Cancelar en el panel Mentor (Fase 8).
- Sin cambios en `uml-core`, `relational-core`, el contrato de recomendaciones de CU-2P-05 ni la rama de CU-2P-07.
- Dependencias: ninguna librería, proveedor ni secreto nuevo.
