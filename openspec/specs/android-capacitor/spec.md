# android-capacitor Specification

## Purpose

Empaquetar el frontend generado como aplicación Android mediante Capacitor, con captura de micrófono, conexión LAN configurable al host local y build verificable.

## Requirements

### Requirement: Aplicación Android empaquetable
The system SHALL producir una configuración Capacitor y un proyecto Android compilable desde un frontend generado compatible, sin asumir static export hasta verificar sus rutas y requisitos runtime.

#### Scenario: Compatibilidad web previa
- **WHEN** se prepara el empaquetado móvil
- **THEN** una validación verifica el build web y la configuración `webDir` antes de crear o sincronizar el proyecto Android

#### Scenario: Build Android real
- **WHEN** Android SDK y toolchain requeridos están disponibles
- **THEN** el proyecto Android compila correctamente mediante el build real configurado

### Requirement: Permiso y conectividad local de voz
The system SHALL solicitar `RECORD_AUDIO` solamente tras una interacción de la persona usuaria y configurará host y puerto LAN sin valores hardcodeados para alcanzar el STT local.

#### Scenario: Permiso denegado o revocado
- **WHEN** Android deniega o revoca el permiso de micrófono
- **THEN** la aplicación informa el estado y conserva el fallback textual sin iniciar captura

#### Scenario: Host LAN no disponible
- **WHEN** el host local no puede alcanzarse, expira la conexión o falla el transporte
- **THEN** la aplicación informa un error controlado y no ejecuta un comando desde audio

### Requirement: Operación sin Internet y privacidad LAN
The system SHALL operar sin Internet tras provisionar dependencias y modelo, enviando audio únicamente al host configurado de la LAN cuando se usa la arquitectura host.

#### Scenario: Sin conectividad Internet
- **WHEN** el dispositivo no tiene Internet pero puede alcanzar al host LAN provisionado
- **THEN** la aplicación puede capturar voz, presentar transcript y mantener la ruta segura de interpretación
