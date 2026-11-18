# FORM Gym

An offline workout planner, training log, and notebook for Windows and Android.
React and TypeScript share one interface. Electron packages Windows; Capacitor packages Android.
Local fonts and assets are bundled. No API keys, account, telemetry, or payment provider is required.

Version 1.1.0 defaults to dark mode, with a light alternative, five main destinations,
earned rank artwork and brief animations. UI decisions follow the installed
[UI UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill);
the project-specific rules are in `design-system/MASTER.md`.

Workouts and notes operate offline. Groups cache the last shared state for offline
viewing; chat, assignments, reviews and leaderboard updates require a connection.
In the Windows app, open Groups and choose Host on this computer, then create a
group. Other devices on the same Wi-Fi use its server address and invitation code.
Keep the host app open. Each group has one leader, who assigns existing plans and
reviews explicitly shared completed sessions. Personal measurements, health details
and free notes stay outside group payloads.

The service can also run with `npm run groups:server` on a persistent Node host
behind HTTPS for internet access. See `docs/groups-server.md` for setup and limits.

## Develop

Use Node.js 22 or newer. Run `npm ci`, then `npm run dev`.
If the local npm policy blocks Electron's installation script, run
`node node_modules/electron/install.js` to install the required desktop runtime.

`npm run build` type checks and builds the app. `npm run desktop` starts the built Windows interface.
`npm run package:win` creates `../build/GYM app.exe`.
The desktop staging step includes only the bundled interface and Electron bridge;
Android tools and build-time dependencies stay outside the Windows package.

## Android

Use Java 21, Android SDK 35, and the supplied Gradle wrapper.
Set the SDK path in `android/local.properties`, or set `ANDROID_HOME`.
Run `npm run android:sync` after web or plugin changes.
From the Android folder, run `gradlew.bat assembleDebug` for a development APK.
`gradlew.bat assembleRelease` uses `android/key.properties` when available.
The local release signing material lives in the parent app's `signing` folder.
Keep that folder private and backed up to sign compatible future releases.

Gradle 8.5 and Android Gradle Plugin 8.3.2 avoid the immutable transform workspace
rename failures encountered on this Windows machine. SDK 35 builds are supported
with the compatibility warning suppressed in the project properties.

## Checks

`npm test` runs domain, report escaping, and native export tests.
It also covers appearance migration and group client requests.
`npm run test:groups` verifies the group service's permissions, persistence and scores.
`npm run test:social` checks two independent members, chat, assignments, reviews,
leaderboard updates and the offline cache against a real local test service.
Start `npm run dev`, then run `npm run test:e2e` for the browser interaction tests.
`npm run test:desktop` checks the packaged executable and full close/restart persistence.
Set `GYM_TEST_SOURCE=1` to check the source Electron shell instead.
Desktop tests use an isolated profile; they preserve the user's data.
`npx playwright test tests/portable.spec.ts --workers=1` checks extraction and
persistence through the actual portable EXE.

`scripts/generate-icons.py` regenerates local launch assets with Python and Pillow.

## Structure

- `src/components`: onboarding, daily plans, active sessions, notebook, progress, settings and premium.
- `src/model.ts`: typed data and exercise catalogue.
- `src/engine.ts`: validation, initial plans, XP, ranks and entitlement expiry.
- `src/storage.ts`: local persistence and user-triggered export.
- `src/report.ts`: escaped, standalone HTML training reports.
- `electron`: isolated renderer bridge, atomic JSON persistence and local protocol.
- `android`: native host and generated Capacitor plugin integration.

Internal load is kg. Timed exercise quantities use seconds or minutes.
XP uses actual completed sets and optional progression bonuses, capped at 600 per day.
Body size, medical conditions and age do not determine rank.
No purchase is charged in this build. A production store requires verified billing
and server-backed entitlements; local entitlements are intended for this private build.
