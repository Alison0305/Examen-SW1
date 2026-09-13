# HANDOFF

## Estado Operativo

- CU-00 a CU-04 cerrados. CU-04 fue aceptado manualmente y archivado en `openspec/changes/archive/2026-09-12-cu-04-landing-proyectos-membresias-invitaciones/`.
- Specs de CU-04 sincronizadas: `landing-proyectos-membresias-invitaciones` y la ampliación de ownership en `persistencia-autenticacion-ownership`.
- CU-04 entrega landing/auth, proyectos persistidos, roles OWNER/EDITOR/VIEWER, membresías e invitaciones seguras. VIEWER no puede mutar, incluido drag; eliminar una membresía elimina el acceso al proyecto.
- Validaciones de cierre: lint, typecheck, test y build de raíz correctos; frontend 97/97, backend 24/24, `uml-core` 53/53, total 174/174. Prisma validate y migrate status correctos con 4 migraciones. OpenSpec strict correcto y 30/30 tareas.
- CU-05 — Colaboración realtime y presencia está técnicamente completado. OpenSpec activo y no archivado: `cu-05-colaboracion-realtime-presencia`, 23/23 tareas.
- Los tres incrementos están aceptados: backend Socket.IO autorizado, contratos tipados, Command Bus autoritativo, revision externa, recibos idempotentes SHA-256, presencia, cliente/reconexion/resync, UI remota y `RestoreDeletionSnapshot`.
- Decisiones: JWT en handshake y usuario derivado del token; salas por proyecto con `ProjectAccessService`; una intención `UmlCommand` con `baseRevision` y `operationId`; proyecto y recibo en una transacción antes de ACK/broadcast; resync explícito; sin CRDT, OT ni merge automático.
- Validación final: Prisma validate correcto y migrate status confirma cinco migraciones y esquema al día. Gates raíz correctos: frontend 110/110, backend 39/39 y `uml-core` 57/57, total 206/206; lint, typecheck y build correctos. OpenSpec strict correcto.
- El badge de iniciales del cursor remoto cambió de centrarse con `translate(-50%, -50%)` a desplazarse con `translate(8px, 8px)`, manteniendo las coordenadas de presencia y sin tocar el documento ni el layout. La prueba frontend comprueba posición `(24,48)`, badge y offset.
- La prueba manual final aprobada en `Prueba Incremento 2` confirmó OWNER y EDITOR sincronizados sin refresh, creación bidireccional, degradación EDITOR a VIEWER en caliente, solo lectura y revocación inmediata con el mensaje `El acceso al proyecto fue revocado`. Se suma a la evidencia previa de presencia, reconexión, persistencia, Undo/Redo, `RestoreDeletionSnapshot`, hot downgrade/removal y limpieza de sala/presencia.
- Trabajo futuro separado: bandeja interna de invitaciones UML Studio con `PENDING`, badge/contador, proyecto, rol, invitador y Aceptar/Rechazar; enlace temporal alternativo y sin SMTP inicial. No pertenece a CU-05.

## Roadmap Completo

Ciclo 1: CU-00 → CU-01 → CU-02
Ciclo 2: CU-03 → CU-04 → CU-05
Ciclo 3: CU-06 → CU-07 → CU-08
Ciclo 4: CU-09 → CU-10 → CU-11

## Siguiente Acción Exacta

1. Esperar instrucción explícita para verify, archive, commit y push de CU-05; no iniciar CU-06.
