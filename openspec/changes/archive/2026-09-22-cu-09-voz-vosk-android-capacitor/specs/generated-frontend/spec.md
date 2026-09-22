## ADDED Requirements

### Requirement: Entrada de voz revisable y fallback textual
The system SHALL ofrecer en el frontend generado una entrada de voz opcional con transcript revisable, controles para iniciar, detener o cancelar, y el input textual existente como fallback.

#### Scenario: Revisión antes de interpretar
- **WHEN** una captura produce un transcript
- **THEN** la interfaz muestra el texto para revisión o edición y requiere una acción explícita antes de continuar hacia la interpretación existente

#### Scenario: Voz no disponible
- **WHEN** falta el runtime, modelo, permiso o host local
- **THEN** la interfaz muestra un error controlado y mantiene operable la entrada textual sin intentar una operación autorizada
