# speech-recognition Specification

## Purpose

Incorporar reconocimiento de comandos breves mediante Vosk local/LAN sin transformar audio directamente en operaciones ejecutables ni enviar datos a proveedores cloud.

## Requirements

### Requirement: Transcript STT local revisable
The system SHALL capturar audio tras una acción explícita, procesarlo con un runtime STT local de la estación anfitriona y presentar un transcript revisable antes de enviarlo al pipeline textual.

#### Scenario: Transcript reconocido
- **WHEN** la persona usuaria inicia y detiene una captura autorizada con el runtime y modelo local disponibles
- **THEN** el sistema presenta el transcript sin ejecutar una acción de datos o UML automáticamente

#### Scenario: Cancelación de escucha
- **WHEN** la persona usuaria cancela la escucha antes de continuar
- **THEN** el sistema descarta el resultado pendiente sin invocar la interpretación, executor ni Command Bus

### Requirement: Límites de seguridad y privacidad de STT
The system SHALL producir solo texto desde audio, mantener el input textual como fallback y limitar el procesamiento a la estación anfitriona o LAN configurada, sin cloud, auto-download ni almacenamiento permanente de audio.

#### Scenario: Continuación explícita
- **WHEN** la persona usuaria aprueba un transcript
- **THEN** el texto continúa únicamente por el pipeline textual existente, que conserva validators y confirmaciones destructivas

#### Scenario: Fallo controlado
- **WHEN** se deniega el micrófono, falta el modelo o runtime, falla el audio o falla el reconocimiento
- **THEN** el sistema informa un error estructurado y mantiene disponible el input textual

### Requirement: Benchmark STT reproducible
The system SHALL proporcionar un benchmark STT reproducible con corpus español, fixtures de audio y transcripts golden que mida WER, command-success rate, latencia, RAM, tiempo de carga y fallos reales cuando runtime y modelo estén disponibles.

#### Scenario: Runtime o modelo no disponible
- **WHEN** el benchmark no dispone de runtime o modelo local
- **THEN** registra la condición y las métricas STT como N/A sin atribuir resultados de parser textual a Vosk

#### Scenario: Benchmark sin efectos destructivos
- **WHEN** el benchmark evalúa audio y transcript
- **THEN** no ejecuta DELETE, HTTP destructivo ni UmlCommandBus
