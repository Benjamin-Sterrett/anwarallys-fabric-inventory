# PRJ-805 — Firestore Security Rules Validation

Manual red-team test plan for `firestore.rules`. PRJ-841 will add automated
`@firebase/rules-unit-testing` coverage; for v1 these scenarios are run by
hand against the Firebase Emulator before promoting rules to production.

## Setup

```bash
# From repo root.
firebase emulators:start --only firestore
```

In the Emulator UI (default http://localhost:4000), seed two bootstrap docs:

1. `/config/admin` with field `adminEmail` (string) = the admin's email.
2. `/users/<active-uid>` with:
   - `email` = `<active-user-email>`
   - `displayName` = `"Active User"`
   - `isActive` = `true`
   - `createdAt`, `updatedAt`, `createdBy`, `updatedBy` set to anything
     valid (the rule only checks `isActive` for inventory access).

Inventory rules now gate on `isActiveStaff()` (which reads
`/users/{auth.uid}.isActive`). Without the user doc, even authenticated
clients fail inventory writes. The admin path (`/users/{uid}` writes) gates
on `isAdminUser()` and does NOT require an active user doc — admins can
provision themselves.

Run scenarios via the Emulator UI Rules Playground or `@firebase/rules-unit-testing`.

## Scenarios

| # | Scenario | Expected | Actual |
|---|---|---|---|
| 1 | Unauthenticated client reads `/items/{any}` | Rejected (no auth) | _pending_ |
| 2 | Active staff creates `/items/{id}` with `remainingMeters: -5`, all other fields valid | Rejected (negative meters) | _pending_ |
| 3 | Active staff creates `/items/{id}` with `remainingMeters: NaN` (`0/0` literal) | Rejected (`>= 0` filters NaN) | _pending_ |
| 4 | Active staff updates `/items/{id}` changing `remainingMeters` from 100 to 50, NO movement created in same commit | Rejected (`lastMovementId` cross-check fails — `getAfter()` on the new movement returns no doc) | _pending_ |
| 4b | Active staff creates `/movements/{id}` with `newMeters: 50` while items.remainingMeters is still 100 (no items update) | Rejected (`get()` items.remainingMeters != oldMeters AND `getAfter()` post-state mismatch) | _pending_ |
| 4c | Active staff completes a full atomic stock-adjust transaction (items.update + items.lastMovementId + movements.create together) | Allowed (legit happy path) | _pending_ |
| 5 | Active staff (uid=A) creates `/movements/{id}` with `actorUid: 'B'` | Rejected (impersonation guard) | _pending_ |
| 6 | Active staff creates `/movements/{id}` with `oldMeters: 100, newMeters: 50, deltaMeters: -10` (wrong delta) | Rejected (delta invariant) | _pending_ |
| 7 | Active staff creates `/movements/{id}` with `reason: 'theft'` (not in enum) | Rejected (reason whitelist) | _pending_ |
| 8 | Update or delete an existing `/movements/{id}` | Rejected (append-only) | _pending_ |
| 10 | Active staff (NOT admin) creates `/users/{some-uid}` | Rejected (admin gate) | _pending_ |
| 11 | Admin user (email matches `/config/admin.adminEmail`) creates `/users/{some-uid}` with valid shape | Allowed | _pending_ |
| 12 | Active staff reads + cannot write `/config/admin` | Allowed read; rejected write (Console-only) | _pending_ |
| 14 | Active staff (uid=A) creates `/items/{id}` with `createdBy: 'B'` | Rejected (createdBy spoof guard) | _pending_ |
| 15 | Active staff attempts to hard-delete `/items/{id}` | Rejected (soft-delete only) | _pending_ |
| 16 | Deactivated user (`isActive: false`) OR user with no `/users/{uid}` doc reads or writes `/items` | Rejected (`isActiveStaff()` fails) | _pending_ |
| 18 | Active staff creates `/deletedRecords/{itemId}` with `deletedBy: 'someone-else-uid'` | Rejected (`deletedBy != request.auth.uid`) | _pending_ |
| 19 | Active staff creates `/deletedRecords/{itemId}` while items doc still has `deletedAt == null` | Rejected (`getAfter()` cross-check requires items.deletedAt != null) | _pending_ |
| 20 | Active staff creates `/deletedRecords/{itemId}` for an item that doesn't exist | Rejected (`exists()` precheck) | _pending_ |
| 21 | Items update with client-set `deletedAt: Timestamp.now()` | Rejected (server-stamp required) | _pending_ |
| 22 | Tombstone with `expireAt` 30 days out, OR `snapshot.sku` not matching items.sku | Rejected (retention bound + snapshot integrity) | _pending_ |
| 23 | Stock change (items.update remainingMeters OR /movements create) on `deletedAt != null` item | Rejected (no stock on deleted) | _pending_ |
| 24 | Admin with `email_verified: false` creates `/users/{uid}` | Rejected | _pending_ |

## Atomic stock-write enforcement

The /items update rule uses `lastMovementId` (a `string | null` field on
RollItem set by the data boundary inside `runTransaction()`) and
`getAfter()` to prove the paired movement was created in this same
commit. The /movements create rule cross-validates BOTH pre-state
(`get()` items.remainingMeters == oldMeters) and post-state
(`getAfter()` items.remainingMeters == newMeters and items.lastMovementId
== this movementId). Stock changes and audit rows land together or fail
together; a custom client cannot mutate stock without writing a real,
attributable audit row.

## Additional sanity checks

- Unauth WRITE → Rejected. Unknown collection → Rejected (catch-all).
- Client-set `createdAt`/`updatedAt`/`at` → Rejected (server-time required).
- Folder update changing `parentId` → Rejected (immutable for v1).
- Items update with `initialMeters` changed → Rejected (immutable).

## Known v1 limitations (deferred)

- **Re-delete within 7d:** restoring then re-deleting fails because the prior tombstone still exists. Wait for TTL or Console-clear. Follow-up filed.
- **Folder cascade:** soft-deleting a folder does NOT cascade. PRJ-796 UI must enforce empty-subtree-before-delete. Follow-up filed.

## Sign-off

- [ ] Scenarios 1–26 verified against emulator.
- [ ] `/config/admin` seeded; one `/users/{uid}` with `isActive: true` exists.
- [ ] Rules deployed: `firebase deploy --only firestore:rules`.
