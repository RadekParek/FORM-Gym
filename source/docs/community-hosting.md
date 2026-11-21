# FORM community hosting

Windows and Android run workouts, the notebook, the exercise library and daily quests offline.
Android can create a local group immediately. Shared groups and the global leaderboard use
the same HTTP service. The global board includes every opted-in account on that service,
across groups; only submitted completed sets and validated quest claims contribute XP.

The supplied `render.yaml` targets Render's free web service with Supabase persistent storage.
Both providers require a connected owner account. Their free-plan availability and quotas are
controlled by those providers. They have not been deployed from an owner account.

The released app builds do not include a hosted community endpoint. For online groups
or the global leaderboard, configure and operate your own HTTPS service using the steps
below. The service can also run locally or behind HTTPS on a server you control.

1. Create a Supabase project and run `docs/supabase.sql` in its SQL editor.
2. Deploy this repository as a Render Blueprint using `render.yaml`.
3. Set `FORM_SUPABASE_URL` to the project's HTTPS URL and `FORM_SUPABASE_SERVICE_KEY`
   to its service-role key in the server environment. Keep the key out of client builds.
4. In either app, open Community account and enter the resulting HTTPS service URL.
   Create an account, save its recovery key, and opt in to share completed workouts.
5. Open Groups on Android or Windows to create a shared group. Copy its invitation link;
   the Join form extracts the server address and invitation automatically.

For a default URL in distributable builds, set `VITE_FORM_SERVER_URL` before `npm run build`.
This value is a public URL. Never use a database key as a Vite variable.

Use one web-service instance per storage row. Supabase writes replace the row atomically;
the service serializes mutations and publishes them in memory only after storage succeeds.
This design fits a private or initial community. Upgrade to normalized tables and database
transactions before running multiple server instances or a large public community.

The free web service may sleep when unused; its first request can take longer. Hosting on an
existing HTTPS Node server is also supported. Use `FORM_GROUP_HOST`, `PORT`, and
`FORM_GROUP_ORIGINS` to configure it. Without Supabase, set `FORM_GROUP_DATA_FILE` to
a durable local path. Keep that file on persistent storage and back it up. The service
has not been deployed for this project; the owner must configure and operate hosting.

## Accounts and privacy

Usernames are case-insensitive and unique within the connected service. Passwords use scrypt
with per-account salts. Tokens expire after 30 days. Only hashes of tokens and recovery keys
are persisted. Resetting a password revokes existing tokens and issues a new recovery key.
Account creation, login and reset have rate limits, and concurrent password hashing is bounded.

The service accepts completed exercise summaries and a character, never medical conditions,
age, body measurements, free notebook content or private session notes. Publishing is opt-in.
Published workout IDs are immutable and idempotent. Workout XP caps at 600 per day;
one easy, medium and hard quest can add 40, 90 and 180 XP. The server validates claims
against submitted sets. The board reflects member-reported workouts, not verified competitions.

Local group drafts keep their assignments and journal on the device. Publishing creates a
shared group with the same name and leader; it preserves the local draft. Invitation links
expire after seven days. Group grades are feedback and do not change XP.

Run `npm test`, `npm run test:groups`, and `npm run test:upgrade` for the related checks.
