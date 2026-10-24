@AGENTS.md

## Updating the fork to the latest Nuclear version

Whenever the user asks to update the app or the fork ("actualiza", "actualiza a la última versión", "update from master", or anything similar), **read `docs/actualizacion-desde-master.md` first and follow it step by step**. It is the single source of truth for the whole flow: merging `upstream/master` (without committing), the fork-specific conflicts to watch, type-check/lint/tests, building the two APKs, signing them with the release key, testing on the emulator with the NuclearTube and Spotify plugins installed, the summary in `updates/`, the final report, and how the user publishes the release (step 11).

- Don't improvise a different flow. If the procedure is out of date or a step fails, say so in the final report and fix the document, since it gets reused every time.
- Publishing the GitHub release is the user's job. Never upload anything to GitHub; leave the APKs in `android-builds/` and the notes in `updates/`, and remind the user of step 11.
- Signing uses `~/.android/nuclear-release.jks` plus the rotation lineage (see `docs/firma-y-actualizaciones-desde-la-app-24-10-2026.md`). Never sign with the debug key alone or commit a keystore.

## Android emulator hygiene

The `nuclear_api36` emulator is only used to test Android builds and updates. It eats disk space and RAM, so it must never be left behind once testing is done.

- Whenever you start the emulator, for any reason (testing an update, an APK, `tauri android dev`, debugging), shut it down as soon as the testing is finished, even if the test failed or the task was interrupted: `adb emu kill`.
- Confirm it is gone: `ps -eo comm | grep -ciE '^qemu'` must print `0`. Never use `pkill -f` with a generic pattern to stop it.
- The AVD is configured to always cold boot and never save a snapshot (`fastboot.forceColdBoot=yes` in `~/.android/avd/nuclear_api36.avd/config.ini`). Don't re-enable Quick Boot or save snapshots; the snapshot alone took ~4 GB.
- Prefer `adb install -r` to reuse the installed app. If `~/.android/avd/nuclear_api36.avd` grows past ~4 GB, wipe it when the testing is done: `emulator -avd nuclear_api36 -wipe-data -no-window`, wait for boot, then `adb emu kill`.
- Mention in your final report that the emulator was closed.

## Build artifact hygiene

Repeated builds piled up 44 GB in `src-tauri/target` and 5.7 GB in `gen/android/app/build`. Only the latest APKs are worth keeping.

After every Android build (debug or release, emulator or phone):

1. Copy the resulting APK(s) into `android-builds/` (gitignored) using the existing naming: `nuclear-<variant>-<arch>-DD-MM-YYYY.apk`.
2. Delete every older APK in `android-builds/` so only the newest build remains.
3. Close the emulator if it is running (see above), then remove the intermediate output:

   ```fish
   cd packages/player/src-tauri
   cargo clean
   rm -rf gen/android/app/build gen/android/.gradle
   ```

   Never delete anything else under `gen/android`: it holds committed hand-written code (see `ANDROID_PORT.md`).
4. Report the APK path(s) kept and the space freed.

For desktop work (`pnpm dev`, `pnpm tauri build`), keep `target/` while iterating, but run `cargo clean` at the end of the task if `du -sh packages/player/src-tauri/target` is over ~15 GB.
