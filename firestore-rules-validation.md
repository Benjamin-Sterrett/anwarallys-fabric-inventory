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
| 12 | Active staff reads + writes `/config/admin` | Both rejected — PRJ-866 locks `/config` to deny-all clients (read AND write). `isAdminUser()` continues to work because Rules-internal `get()` bypasses client read. Console writes are Rules-bypass and remain the only mutation path. | _pending_ |
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
| 37 | Active staff creates `/items/{id}` with the `deletedAt` field omitted entirely (also for `deletedBy`, `deleteReason`) (PRJ-865) | Rejected (`request.resource.data.keys().hasAll(['deletedAt','deletedBy','deleteReason'])` blocks omitted-field ghost rows) | _pending_ |
| 38 | Active staff creates `/items/{id}` with explicit `deletedAt: null`, `deletedBy: null`, `deleteReason: null`, all other fields valid (PRJ-865 backward-compat) | Allowed (the legitimate happy path is preserved — data-boundary helpers always set the fields explicitly) | _pending_ |
| 39 | Active staff (admin OR non-admin) calls `getDoc(doc(db,'config','admin'))` from client (PRJ-866) | Rejected for both — `/config` is locked down. `isAdminUser()` continues to work because Rules-internal `get()` bypasses client read access. | _pending_ |
| 40 | Active staff creates `/folders/{id}` with the `deletedAt` field omitted entirely (also for `deletedBy`) (PRJ-865) | Rejected (`request.resource.data.keys().hasAll(['deletedAt','deletedBy'])` blocks omitted-field ghost folders) | _pending_ |
| 41 | Active staff creates `/folders/{id}` with explicit `deletedAt: null`, `deletedBy: null`, all other fields valid (PRJ-865 backward-compat) | Allowed (legitimate happy path preserved) | _pending_ |
| 42 | Active staff updates `/folders/{id}` via full-document `setDoc()` overwrite (or `updateDoc` with `deleteField()`) that drops `deletedAt`/`deletedBy` from the post-write doc (PRJ-865 update guard) | Rejected (`hasAll` on `request.resource.data` enforces post-write doc shape; partial `updateDoc()` calls without those fields still pass because Firestore merges the existing values into `request.resource.data`) | _pending_ |
| 43 | Active staff updates `/items/{id}` (rename, no delete-state change) via full-document `setDoc()` overwrite (or `updateDoc` with `deleteField()`) that drops `deletedAt`/`deletedBy`/`deleteReason` from the post-write doc (PRJ-865 update guard, Transition 1) | Rejected (`hasAll` enforces post-write doc shape; partial `updateDoc()` without those fields still passes via merge — this guard is for the `setDoc()`/`deleteField()` edge) | _pending_ |
| 44 | Admin user with mixed-case `/config/admin.adminEmail` (e.g. `Shaaizladhani@gmail.com`) creates `/users/{some-uid}` (PRJ-873) | Allowed — `isAdminUser()` lower-cases both sides, so casing of the seed is irrelevant. Auth-side email is already lowercase (Firebase Auth normalizes); the helper now matches. | _pending_ |
| 45 | Admin user (uid=A) updates `/users/A` setting `isActive: false` (admin self-deactivation) (PRJ-874) | Rejected — `request.auth.uid == uid && request.resource.data.isActive == false` triggers the lockout-prevention guard. | _pending_ |
| 46 | Admin user (uid=A) deletes `/users/A` (admin self-delete) (PRJ-874) | Rejected — `request.auth.uid != uid` clause on `allow delete` blocks the admin from deleting their own /users doc. | _pending_ |
| 47 | Admin user (uid=A) updates `/users/B` setting `isActive: false` (deactivating another staff member, the legitimate Staff-page flow) (PRJ-874 backward-compat) | Allowed — `request.auth.uid == uid` is false (A != B), so the guard's negation passes; normal admin staff-management proceeds. | _pending_ |

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

## PRJ-910 — Deactivated user self-read scenarios

| # | Scenario | Expected | Actual |
|---|---|---|---|
| 16 | Authenticated deactivated staff reads own `/users/{uid}` doc | Allowed (relaxed self-read rule) | _pending_ |
| 17 | Authenticated deactivated staff reads another user's `/users/{other-uid}` doc | Rejected (not admin, not self) | _pending_ |
| 18 | Authenticated active staff reads own `/users/{uid}` doc | Allowed (unchanged) | _pending_ |
| 19 | Admin reads deactivated staff's `/users/{uid}` doc | Allowed (admin parity unchanged) | _pending_ |

## Additional sanity checks

- Unauth WRITE → Rejected. Unknown collection → Rejected (catch-all).
- Client-set `createdAt`/`updatedAt`/`at` → Rejected (server-time required).
- Folder update changing `parentId` → Rejected (immutable for v1).
- Items update with `initialMeters` changed → Rejected (immutable).

## Known v1 limitations (deferred)

- **Re-delete within 7d:** restoring then re-deleting fails because the prior tombstone still exists. Wait for TTL or Console-clear. Follow-up filed.
- **PRJ-865 + PRJ-866 — CLOSED.** Defense-in-depth tightenings shipped: items + folders create/update now enforce field-presence via `request.resource.data.keys().hasAll([...])` (no more omitted-deletedAt ghost rows), and `/config/{document}` is fully locked down from clients (`allow read, write: if false;` — `isAdminUser()` continues to work via Rules-internal `get()`).
- **Folder soft-delete blocked entirely in v1 (PRJ-863, supersedes PRJ-860):** Firestore Security Rules cannot iterate `folderAncestors[]` (no list-iteration primitive in Rules expressions), so we cannot reject item writes inside descendants of a soft-deleted ancestor. Items.update only checks the DIRECT parent folder, leaving grandchildren and below freely writable — a real authz gap, not a contained one. Rather than ship rules that look stronger than they are, v1 disables in-app folder soft-delete entirely: `unchanged('deletedAt')` and `unchanged('deletedBy')` on every folder update, plus `resource.data.deletedAt == null` so already-deleted folders are fully immutable. Folders are rename-only. **Do NOT use the Firebase Console to soft-delete or hard-delete non-leaf folders** — that recreates the orphan-descendant state Rules can't contain. Only safe manual cleanup is hard-deleting an empty leaf folder. The proper subtree-aware delete flow lands in PRJ-796 (Wave 5).

## Sign-off

- [ ] Scenarios verified against emulator.
- [ ] `/config/admin` seeded.
- [ ] EVERY authenticated user (including admin if they make inventory/movement writes) has a `/users/{uid}` doc with `isActive: true` AND non-empty `displayName`. Movements require `actorName` to match `displayName` (PRJ-859); inventory writes require `isActive: true` (isActiveStaff()).
- [ ] Rules deployed: `firebase deploy --only firestore:rules`.
