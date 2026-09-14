## 1. Backend inbox and authorization
- [x] 1.1 Audit and extend invitation DTOs/service/controllers with authenticated PENDING listing and id-based accept/reject, reusing normalized-email and transactional resolution rules.
- [x] 1.2 Return a safe invitation projection containing project, role, inviter when available, and invitation date; never token/tokenHash.
- [x] 1.3 Add backend tests for ownership, case-insensitive email, expired/final states, duplicates, accept/reject and membership effects.

## 2. Frontend inbox
- [x] 2.1 Extend authenticated API client and `/projects` loading state for pending invitations.
- [x] 2.2 Implement MUI badge/access and inbox list with loading, empty, error, accept and reject states.
- [x] 2.3 Revalidate invitation count and projects after actions; preserve token-link flow.
- [x] 2.4 Add frontend tests for count, listing, actions, errors and project appearance after acceptance.

## 3. Validation
- [x] 3.1 Run relevant backend/frontend gates and document manual desktop validation.
- [x] 3.2 Explicitly defer realtime delivery and SMTP; no Prisma migration unless implementation discovers a concrete schema gap.
