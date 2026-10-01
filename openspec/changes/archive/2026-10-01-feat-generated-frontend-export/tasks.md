## 1. Generator Autonomy

- [x] 1.1 Add a standalone CRUD mode that emits an autonomous project without assistant, voice or monorepo `file:` dependencies.
- [x] 1.2 Derive create/update fields and owner FK selectors deterministically from RelationalModel and Domain Manifest without runtime OpenAPI.
- [x] 1.3 Centralize generated API configuration for CRUD and relations while preserving safe URL validation.
- [x] 1.4 Add generator regressions for simple structure, determinism, autonomous package metadata and adaptable entities.

## 2. Export And Workspace

- [x] 2.1 Add an authenticated frontend ZIP export using the persisted CanonicalUmlModel and existing relational/contracts path.
- [x] 2.2 Add the accessible textless blue workspace control between the assistant and breadcrumbs Divider, and download the frontend ZIP.
- [x] 2.3 Add endpoint, authorization, ZIP and workspace interaction tests.

## 3. Verification

- [x] 3.1 Extract a generated frontend into a repository-local temporary directory, install dependencies and run its production build.
- [x] 3.2 Run affected frontend, backend, frontend-generator and spring-generator tests, typechecks, builds, lint, OpenSpec strict and `git diff --check`.
- [x] 3.3 Perform manual frontend ZIP download and execution before archive, commit or push.
