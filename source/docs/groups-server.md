# FORM group server

The app keeps its workout profile offline. Group hosting is a separate service and a separate JSON file; constructing it never opens a listener. Electron calls `start()` only after the user selects Host. It closes the service when the app quits.

```js
const { createGroupServer } = require('./electron/groups-server.cjs');
const service = createGroupServer({
  dataFile: '/absolute/path/group-store.json',
  host: '0.0.0.0',
  port: 47831,
  allowedOrigins: ['gym://app', 'https://localhost', 'http://localhost'],
});
const { host, port, url } = await service.start();
// Later: await service.close();
```

For an optional standalone Node host, run `node scripts/group-server.cjs`. It binds to loopback by default. Set `FORM_GROUP_HOST=0.0.0.0` to accept LAN clients. `FORM_GROUP_PORT` (or `PORT`), `FORM_GROUP_DATA_FILE`, and comma-separated `FORM_GROUP_ORIGINS` configure the listener, separate store, and permitted browser origins. An internet deployment should sit behind an HTTPS reverse proxy. Run only one server process per data file; writes are queued and atomically replaced within that process.

## API

All routes use JSON. Protected routes require `Authorization: Bearer <token>`. Errors are `{ error: { code, message } }` with an appropriate HTTP status. No route accepts client-selected roles, authors, points, body measurements, or medical profile fields. Free-text notes are shared only when explicitly supplied by the member.

| Method and route                                  | Request                                                              | Response                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`                                  | None                                                                 | `{ok, service, version}`                                                                                                                           |
| `POST /v1/groups`                                 | `{name, displayName, deviceId}`                                      | `{groupId, memberId, token, inviteCode, inviteExpiresAt}` (201)                                                                                    |
| `POST /v1/join`                                   | `{inviteCode, displayName, deviceId}`                                | `{groupId, memberId, token}`                                                                                                                       |
| `GET /v1/groups/:id/state`                        | Optional `?after=revision`                                           | `{group, me, members, assignments, sessions, messages, revision, serverTime}`; unchanged revision returns `{unchanged:true, revision, serverTime}` |
| `POST /v1/groups/:id/invite`                      | `{}`; leader only                                                    | `{inviteCode, inviteExpiresAt, revision}`                                                                                                          |
| `POST /v1/groups/:id/assignments`                 | `{clientId?, title, date, memberIds, exercises, note?}`; leader only | `{assignment, revision}`                                                                                                                           |
| `DELETE /v1/groups/:id/assignments/:assignmentId` | Leader only                                                          | `{ok:true, revision}`                                                                                                                              |
| `POST /v1/groups/:id/sessions`                    | `{clientId, assignmentId?, date, durationMinutes, exercises, note?}` | `{session, revision}`                                                                                                                              |
| `PUT /v1/groups/:id/sessions/:sessionId/review`   | `{grade:1..5, comment?}`; leader only                                | `{review, revision}`                                                                                                                               |
| `POST /v1/groups/:id/messages`                    | `{clientId, text}`                                                   | `{message, revision}`                                                                                                                              |

`deviceId` is a persistent cryptographically random secret, such as `crypto.randomUUID()`, stored only on the member's device. Keep it private. Joining again with the same invitation and device identity reuses the membership and rotates its bearer token. Invitations expire after seven days; rotating an invitation invalidates the previous invitation. Only hashes of credentials are stored. Membership tokens are never returned in group state.

Assignment exercises use `{exerciseId?, name, sets, reps, loadKg?, restSec?, note?}`. An empty `memberIds` array targets the entire group. A submitted session uses exercises `{exerciseId?, name, sets:[{reps, loadKg?, seconds?}]}`. Submit completed sets only. Use `reps:0, seconds:60` for a timed set. Exercise IDs are lowercase slugs, up to 64 characters. Dates use `YYYY-MM-DD`.

The server supplies assignment/message/session IDs, membership authors, and timestamps. `clientId` provides retry idempotency per member for retained assignments, sessions, and messages. Sessions expose `score`, `completedSets`, `volumeKg`, and optional `review`. Members expose `id`, `displayName`, `role`, `joinedAt`, `score`, `sessionCount`, `trainingDays`, `completedSets`, and `volumeKg`. Chat remains chronological; members sort by score.

Group points use explicitly submitted workout summaries: 80 points per session with completed sets, 12 points per set up to 35 sets, 20 points for at least ten minutes, and 40 points when an exercise's reported volume improves over a previously submitted earlier day. Points cap at 600 per member per day. Timed sets contribute no lifting volume. Coach grades do not alter points. These are member-reported workout statistics, not externally verified athletic results.

Limits: 128 KiB request body; 100 groups; 100 members per group; 365 active assignments; 2,000 submitted sessions; 1,000 retained chat messages; 30 creation/join requests per IP per minute; 240 other requests per IP per minute. Each session allows up to 30 exercises and 300 completed sets. The server preserves a corrupt store and fails startup rather than replacing it.

Run meaningful service checks with `node --test tests/groups-server.test.cjs`.
