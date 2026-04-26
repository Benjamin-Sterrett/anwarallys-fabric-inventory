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
| 22 | Tombstone with `expireAt` < 7 days OR > `7d + 15min` from `request.time`, OR `snapshot.sku` not matching items.sku | Rejected (retention bound `[7d, 7d+15min]` + snapshot integrity). PRJ-796 boundary computes `expireAt = device_now + 7d + buffer (≤15min)` to absorb clock skew. | _pending_ |
| 23 | Stock change (items.update remainingMeters OR /movements create) on `deletedAt != null` item | Rejected (no stock on deleted) | _pending_ |
| 24 | Admin with `email_verified: false` creates `/users/{uid}` | Rejected | _pending_ |
| 25 | Items create with `remainingMeters: Infinity` (PRJ-857) | Rejected (`< 1e15` bound) | _pending_ |
| 26 | Items update on a soft-deleted item changing `sku` (PRJ-858) | Rejected (only restore allowed) | _pending_ |
| 27 | Folder update setting `deletedAt: null → request.time` (soft-delete attempt) | Rejected (PRJ-863 — folder soft-delete blocked entirely in v1) | _pending_ |
| 28 | Movement create with `actorName` ≠ caller's `displayName` (PRJ-859) | Rejected (anti-spoof) | _pending_ |
| 29a | Active staff (non-admin) `getDoc(/users/{ownUid})` (PRJ-861) | Allowed (own profile only) | _pending_ |
| 29b | Active staff (non-admin) `getDoc(/users/{otherUid})` (PRJ-861) | Rejected (no coworker email leak) | _pending_ |
| 29c | Active staff (non-admin) `getDocs(collection(db, 'users'))` (PRJ-861) | Rejected (list = admin only) | _pending_ |
| 29d | Admin `getDocs(collection(db, 'users'))` (PRJ-861) | Allowed | _pending_ |
| 30 | Items restore more than 7 days after `items.deletedAt` (PRJ-862) | Rejected (`request.time - deletedAt <= 7 days` derives from server-stamped deletedAt, immune to expireAt manipulation) | _pending_ |
| 31 | Items restore at `deletedAt + 7d + 12h` (12 hours past the 7-day window) (PRJ-862) | Rejected (`request.time - deletedAt > 7 days`) | _pending_ |
| 32 | Folder update changing `deletedBy` while leaving `deletedAt` null (PRJ-863) | Rejected (both fields fully unchanged) | _pending_ |
| 33 | Folder update (e.g. rename) on a folder where `deletedAt != null` (Console-soft-deleted) (PRJ-863) | Rejected (folders are fully immutable once soft-deleted) | _pending_ |
| 34 | Items restore where the parent folder was Console-soft-deleted DURING the 7d window | Rejected (folder existence + active check on restore branch) | _pending_ |
| 35 | Items restore where the parent folder was Console-HARD-deleted DURING the 7d window | Rejected (`exists(folder)` fails) | _pending_ |
| 36 | Items.update (rename, folder-move, anything) on an active item under a Console-soft-deleted folder | Rejected (existing `folder.deletedAt == null` check on items.update) | _pending_ |

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
- **Folder soft-delete blocked entirely in v1 (PRJ-863, supersedes PRJ-860):** Firestore Security Rules cannot iterate `folderAncestors[]` (no list-iteration primitive in Rules expressions), so we cannot reject item writes inside descendants of a soft-deleted ancestor. Items.update only checks the DIRECT parent folder, leaving grandchildren and below freely writable — a real authz gap, not a contained one. Rather than ship rules that look stronger than they are, v1 disables in-app folder soft-delete entirely: `unchanged('deletedAt')` and `unchanged('deletedBy')` on every folder update, plus `resource.data.deletedAt == null` so already-deleted folders are fully immutable. Folders are rename-only. **Do NOT use the Firebase Console to soft-delete or hard-delete non-leaf folders** — that recreates the orphan-descendant state Rules can't contain. Only safe manual cleanup is hard-deleting an empty leaf folder. The proper subtree-aware delete flow lands in PRJ-796 (Wave 5).

## Sign-off

- [ ] Scenarios verified against emulator.
- [ ] `/config/admin` seeded.
- [ ] EVERY authenticated user (including admin if they make inventory/movement writes) has a `/users/{uid}` doc with `isActive: true` AND non-empty `displayName`. Movements require `actorName` to match `displayName` (PRJ-859); inventory writes require `isActive: true` (isActiveStaff()).
- [ ] Rules deployed: `firebase deploy --only firestore:rules`.
