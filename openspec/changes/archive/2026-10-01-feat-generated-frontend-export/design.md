## Context

`frontend-generator` already derives frontend artifacts from the relational model and Domain Manifest. Spring export already maps the persisted `ProjectDocument.uml` through the deterministic relational transformation and returns a ZIP.

## Decisions

- Add a frontend export service/controller following the Spring export authorization, persistence and safe ZIP pattern.
- Use the same persisted canonical UML and relational mapping; never read layout for generation.
- Add a standalone CRUD mode that omits assistant, voice and their monorepo dependencies while preserving the existing generator mode unchanged.
- Generate one API configuration module consumed by CRUD and relationship fetching; retain existing host/port validation and allow LAN URLs.
- Add a textless blue workspace button with an accessible label outside the assistant Card and immediately before the breadcrumbs Divider.
- Keep generated project files flat and conventional: `app/`, `package.json`, Next and Capacitor configuration.

## Verification

- Build standalone CRUD fields deterministically from RelationalModel and Domain Manifest, without querying runtime OpenAPI.
- Test generator determinism, adaptable entity manifests and absence of absolute or `file:` monorepo paths.
- Test authorized ZIP endpoint and workspace button position/interaction.
- Extract generated output to a temporary repository-local directory, install dependencies and build it.
- Retain Spring CORS explicit origins; change it only if an actual generated frontend compatibility failure demonstrates the need.
