# Focus Shield physical Android QA

Status: **configuration implemented; build blocked / device tests not run**. No APK has been built or installed, and no physical-device behavior is claimed in this checklist.

## Build and environment gate

Production identity is `com.momentum.app`. The preview Expo config resolves to `com.momentum.app.qa` and runtime `1.1.1-qa`; production retains the appVersion runtime policy. All EAS build profiles select their matching EAS environment explicitly: development/development, preview/preview, production/production. Only preview sets `MOMENTUM_QA_ENVIRONMENT=qa`.

Preview builds remain blocked until the infrastructure owner provisions and approves a dedicated QA API and Supabase project. Configure EAS environment `preview` with `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `app.config.js` requires exact HTTPS origins in the source-controlled `QA_ENDPOINT_ALLOWLIST` (`apiOrigin` and `supabaseOrigin`); it compares parsed URL origins exactly, rejects unexpected hosts/ports and known production endpoints, and does not read the allowlist from environment variables. Until the two reviewed allowlist entries are configured, preview config resolution intentionally fails. Never put a service-role key in the mobile environment.

EAS excludes `android/` through `.gitignore` (there is no `.easignore`) and generates native files through Prebuild. The ignored local Gradle project has a `.dev` ID and is not the cloud build source. Verify the generated APK package ID before installation.

EAS authentication works for the linked project. The existing EAS signing credential is associated with production identity; it must not be reused or changed for QA. Configure a new QA-specific keystore only after review. EAS currently has a production channel mapped to the production branch, but no `preview` channel exists. No channel was created or edited, and no update was published. The shared Updates URL remains unchanged; the distinct preview runtime also prevents compatibility with production runtime `1.1.1` updates.

## EAS preview branch and channel setup (future, not executed)

Run only after QA service URLs and QA signing are ready and approved:

```sh
eas branch:create focus-shield-qa --non-interactive
eas channel:create preview --non-interactive
eas channel:edit preview --branch focus-shield-qa --non-interactive
eas branch:view focus-shield-qa --non-interactive
eas channel:view preview --non-interactive
eas channel:view production --non-interactive
eas channel:protect preview --non-interactive
```

Confirm preview maps only to `focus-shield-qa` and production still maps only to its existing production branch. Protect preview before allowing any QA OTA publishing. These cloud commands are documentation only and have not been executed. Do not run `eas update` during channel setup.

## QA Android signing setup (future, not executed)

After the preview config resolves to `com.momentum.app.qa`, run `eas credentials --platform android`, select the `preview` profile, then choose the Keystore flow to generate a **new** QA keystore. Do not select or alter the existing production keystore. Verify the QA credential is associated with `com.momentum.app.qa` and record its certificate fingerprint in the restricted QA release record, not in this repository. If EAS offers only the production credential or requires replacing it, stop and request infrastructure-owner assistance.

## Diagnostics available

Current development diagnostics are insufficient for the requested Focus audit. Existing `__DEV__` performance logs cover startup and Today rendering; they do not record session transitions, checkpoint values, challenge boundaries, lease request/response state, generation identity, or completion retries. There is no permanent debug screen. Do not capture broad Logcat output or network traces that might contain authorization headers. A future QA-only diagnostic channel should emit only state names, persisted elapsed seconds, checkpoint timestamps, lease action/result, retry result, and non-reversible fingerprints for account/session/snapshot/generation. It must be disabled in production builds and must exclude names, task text, tokens, passwords, and answer history.

For each run, record build ID, APK package ID, device model, Android version, test account alias (not email), test timestamp, expected/observed state, screenshot references, and sanitized backend record counts/IDs. Never put credentials or raw auth/session tokens in this file.

## Device and run details

- Build ID / URL: not available (build blocked)
- APK package ID: not available
- Device model / Android version: not tested
- Backend environment verified by: pending
- Test accounts (aliases only): pending
- Tester / date: pending

## Reproducible test matrix

Mark each row **PASS** only after the device result and local/backend persisted state agree. Otherwise mark **FAIL** or **NOT RUN**, and attach sanitized evidence.

| ID | Steps | Expected result and evidence | Result |
|---|---|---|---|
| A | Sign in with QA account; start an active Focus session. Wait at least 60 seconds. | Timer advances; active lease belongs to this account/session/generation; no completion row exists. Capture start and end persisted seconds. | NOT RUN |
| B | Open Focus Shield during the running session. | Timer stops advancing; local state becomes `challenge_active`; backend lease becomes paused; challenge duration does not increase focused seconds. | NOT RUN |
| C | Dismiss without answering, then explicitly resume. | Same session and generation resume; no completion; focused seconds continue from the checkpoint. No permanent pause. | NOT RUN |
| D | Answer incorrectly and inspect mastery. | Incorrect outcome updates only that account/topic/skill; no extra Focus time or completion is awarded; feedback is non-shaming. | NOT RUN |
| E | While running, force-stop the app through Android Settings. Reopen promptly. | Last persisted focused time is retained; downtime is excluded; session opens in explicit recovery state, not completed or running automatically. Record checkpoint age and any undercount (maximum documented checkpoint interval: 15 seconds). | NOT RUN |
| F | Choose explicit recovery while online. | Backend validates owner, active snapshot, session, and generation; recovery transitions through paused then running only after resume. Record sanitized action/result states. | NOT RUN |
| G | Open a challenge, then force-stop while the challenge is active. Reopen. | Challenge time is excluded; local challenge state becomes recovery pending; the same session can be explicitly recovered. | NOT RUN |
| H | Force-stop for more than 90 seconds, then reopen while the same plan session is still active. | The expired lease is not silently resumed. Explicit recovery pauses the exact matching lease and separate resume renews it. Wrong generation/session must be rejected. | NOT RUN |
| I | Finish a session; interrupt connectivity around the completion request; retry. | Local `completion_pending` preserves the exact minute payload; server records one completion only; repeated retries return success without duplicate completion rows. | NOT RUN |
| J | Create separate QA accounts A and B. Record A mastery, log out, sign in as B, then return to A. | B never displays or changes A mastery; A mastery is restored after return/restart. Do not use real student accounts. | NOT RUN |
| K | Enable airplane mode; generate a challenge, answer it, and inspect mastery. | Catalog selection, validation, and local mastery update work offline. No app-blocking claim or remote request is required for ordinary challenge use. | NOT RUN |
| L | While offline, attempt recovery; then reconnect and retry. | Offline recovery fails with a recoverable message and retains the local journal. After reconnection, only the exact still-valid session/generation recovers; stale sessions remain unrevived. | NOT RUN |
| M | Start a session, reboot the device, reopen and recover. | Reboot does not create a negative interval or count downtime. Recovery is explicit and server-validated. Compare persisted seconds before and after reboot. | NOT RUN |
| N | Run Focus with screen on, screen off, and after deep sleep; observe for at least 10 minutes. | No downtime is added as focused time. Background transition pauses locally when delivered; process-death behavior follows the explicit recovery path. Record checkpoint and lease timestamps. | NOT RUN |
| O | Repeat challenge open/dismiss rapidly at least 10 times. | No duplicate lease rows, repeated pause/resume corruption, lost accumulated time, or accidental completion. Same session and generation remain attached. | NOT RUN |

## Evidence review

Before accepting a run, compare device screenshots and sanitized diagnostic events with backend lease and completion records using an authorized QA operator. Confirm exact account/session/snapshot/generation association, one completion at most, no challenge/downtime increment, and preservation of all persisted focused seconds. Redact all identifiers not needed for the comparison.

## Stop conditions

Do not build or install until all of these are verified: non-production API and Supabase environment; remote EAS access; required EAS credentials; actual APK application ID distinct from production; preview update channel; and a sanitized QA diagnostic plan. Do not proceed to app enforcement based on automated tests alone.
