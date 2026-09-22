## Why

CU-08 ya ofrece un pipeline textual cerrado y validado, pero no permite usar voz ni instalar la aplicación generada en Android. CU-09 incorpora reconocimiento local de comandos breves y empaquetado Android sin introducir proveedores cloud ni una ruta paralela de ejecución.

## What Changes

- Incorporar reconocimiento STT con Vosk y modelo español local en la estación anfitriona, con captura de audio, transcript revisable y fallback de texto.
- Mantener una frontera donde STT produce solo texto; la interpretación, validación, confirmaciones destructivas y ejecución reutilizan los pipelines existentes.
- Definir un benchmark STT reproducible con corpus español, fixtures, métricas reales y ausencia explícita de resultados cuando runtime o modelo no estén disponibles.
- Preparar el frontend generado para Capacitor y crear un proyecto Android con permisos de micrófono, comunicación LAN configurable al host y build verificable.
- Preservar privacidad local/LAN: sin provider cloud, auto-download de modelos, URLs arbitrarias ni almacenamiento permanente de audio.

## Capabilities

### New Capabilities
- `speech-recognition`: Captura, transcript y reconocimiento STT local/LAN mediante Vosk con límites seguros, benchmark y fallback textual.
- `android-capacitor`: Empaquetado Capacitor, proyecto Android, permisos de micrófono, conectividad LAN configurable y build Android.

### Modified Capabilities
- `generated-frontend`: Extender el frontend generado con entrada de voz revisable, fallback textual y compatibilidad de empaquetado móvil sin alterar Domain Manifest v1.

## Impact

- Afecta al frontend principal y al frontend generado para captura/UI, al backend principal como host STT local y a la configuración de empaquetado Android.
- Reutiliza `assistant-core`, propuestas textuales UML y `UmlCommandBus`, sin añadir una segunda semántica de comandos.
- Runtime STT validado localmente para la implementación futura: worker Python aislado con `vosk==0.3.45`; `@capacitor/core`, `@capacitor/cli` y `@capacitor/android` siguen sin instalarse en esta planificación.
- Requiere un modelo español local fuera de Git y, para el Incremento 3, Android SDK, toolchain y build real disponibles.
