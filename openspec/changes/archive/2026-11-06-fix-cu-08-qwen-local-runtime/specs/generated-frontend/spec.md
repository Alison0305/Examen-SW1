## ADDED Requirements

### Requirement: Configuración LAN del endpoint
The system SHALL usar la configuración LAN existente (`lan-config`) para construir la URL del endpoint de interpretación, sin hardcodear direcciones IP.

#### Scenario: Endpoint configurado
- **WHEN** el host LAN está configurado como `192.168.1.4:3001`
- **THEN** se construye la URL `http://192.168.1.4:3001/assistant/interpret` para las solicitudes de interpretación

#### Scenario: Host no disponible
- **WHEN** el endpoint no responde o devuelve error de red
- **THEN** la interfaz muestra diagnóstico `HOST_UNAVAILABLE` o `TIMEOUT` y mantiene el input textual operable

## MODIFIED Requirements

### Requirement: Entrada de voz revisable y fallback textual
The system SHALL ofrecer en el frontend generado una entrada de voz opcional con transcript revisable, controles para iniciar, detener o cancelar, y el input textual existente como fallback. El panel de asistente acepta español natural interpretado por el endpoint local, validando contra el Domain Manifest embebido antes de la ejecución.

#### Scenario: Revisión antes de interpretar
- **WHEN** una captura produce un transcript
- **THEN** la interfaz muestra el texto para revisión o edición y requiere una acción explícita antes de continuar hacia la interpretación existente

#### Scenario: Voz no disponible
- **WHEN** falta el runtime, modelo, permiso o host local
- **THEN** la interfaz muestra un error controlado y mantiene operable la entrada textual sin intentar una operación autorizada

#### Scenario: Texto en español natural
- **WHEN** el usuario ingresa "listar todos los usuarios" en el panel
- **THEN** se envía al endpoint `POST /assistant/interpret` con `mode: "data"` y el manifest embebido, y se presenta la propuesta `AssistantCommand` resultante

#### Scenario: JSON estricto
- **WHEN** el usuario ingresa JSON `{"operation":"LIST","entity":"usuario"}` en el panel
- **THEN** se usa el parser JSON existente sin llamar al endpoint

#### Scenario: Frase fuera de dominio
- **WHEN** el usuario ingresa una frase que no corresponde a ninguna operación válida (ej. "hola cómo estás")
- **THEN** el endpoint devuelve diagnóstico `OUT_OF_DOMAIN` y la interfaz muestra el error sin ejecutar ninguna operación

#### Scenario: Interpretación exitosa con confirmación DELETE
- **WHEN** el endpoint devuelve un `AssistantCommand` de tipo DELETE
- **THEN** se presenta la propuesta, se pide confirmación explícita y solo se ejecuta tras aprobación

#### Scenario: Interpretación fallida
- **WHEN** el endpoint devuelve un diagnóstico de error o frase fuera de dominio
- **THEN** la interfaz muestra el error y no ejecuta ninguna operación
