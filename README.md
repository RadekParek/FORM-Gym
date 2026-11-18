# FORM Gym

Offline workout planning, training logs, and personal notes for Windows and Android.

## Download v1.1.0

- [Windows portable app](https://github.com/RadekParek/FORM-Gym/releases/download/v1.1.0/GYM%20app.exe)
- [Android APK](https://github.com/RadekParek/FORM-Gym/releases/download/v1.1.0/FORM%20Gym.apk)

### Platform notes

- **Windows:** x64 portable executable. Microsoft Edge WebView2 Evergreen Runtime is required. Personal data is stored locally under `%APPDATA%\FORM Gym\training.json`.
- **Android:** Android 6.0 or newer. The APK is signed for compatible updates; future APK releases must use the original private signing key, which is not included in this repository.

## Features

- Plan daily exercises, sets, repetitions, load, rest, and notes.
- Log workouts, resume unfinished sessions, and review training history, records, ranks, and milestones.
- Keep a personal notebook and work offline.
- Export and restore JSON backups.
- Use groups on a shared Wi-Fi network, or host the included group service behind HTTPS for internet access.
- Choose from multiple languages, light/dark appearance, units, larger text, and reduced motion.

Personal notes, measurements, and health details remain local. Only workout summaries explicitly shared by the user are sent to a group. The app requires no account, telemetry, API key, or payment provider; purchases are disabled in this build.

## Build from source

The application source is in [`source/`](source/); its README contains the development, platform build, and test instructions. In brief, the web app uses Node.js 22 or newer:

```sh
cd source
npm ci
npm run build
npm test
```

The Windows portable package can be built with `npm run package:win`. Android builds require Java 21 and Android SDK 35; see [`source/README.md`](source/README.md) for the Gradle commands and local signing setup.

## Release artifacts

The v1.1.0 APK and Windows executable are included as GitHub Release assets. Their SHA-256 values are recorded in [`FORM-Gym-validation.json`](FORM-Gym-validation.json). The Windows executable is unsigned. Keep the Android signing key private and backed up; do not commit the `signing/` directory or Android local signing configuration.

## License

Project source is licensed under the [MIT License](LICENSE). Third-party dependencies and bundled assets remain subject to their respective licenses.
