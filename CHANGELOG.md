# Changelog

All notable changes to previewlane. The CLI version is `version` in
`packages/cli/package.json`.

## Unreleased

### Added

- `previewlane completion bash|zsh|fish` prints a shell completion script,
  generated from the same command and option tables the parser uses.
- `--version` / `-v` and `--help` / `-h` flags. Help wins over anything else on
  the command line, so `previewlane logs --help` prints usage.
- `docs/usage.md`: worked examples for every command, and the exit codes.

### Fixed

- `scripts/deploy-host.sh` and `scripts/provision-host.sh` name the SSM command
  and its status when it does not succeed, instead of exiting 1 silently.
- The host scripts and `scripts/build-lambda.sh` check for the tools they need
  before they start, and exit 127 naming the missing one.
- The usage text listed `down` twice.
- Formatting and import order after the rename to previewlane, so
  `bun run lint` passes again.
- Two redaction tests whose arithmetic assumed the old, shorter name: the
  login key prefix and the build log's cut marker both grew.

### Changed

- `scripts/deploy-host.sh` and `scripts/provision-host.sh` share one SSM wait
  (`scripts/ssm-wait.sh`), and `deploy-host.sh` uploads its six artifacts from
  one list.
- CI runs the verification firewall helper's pytest suite (`host/verify/test`).
- Removed the unused `Transport` and `AwsContext` type aliases from the CLI.

### Tests

- `withFileLock` (`packages/cli/src/lock.ts`) and the bounded body reader
  (`packages/daemon/src/body.ts`) have tests of their own.

## 2026-11-17: rename to previewlane

- Every package, binary, path, environment variable and file name moved from
  `koi` to `previewlane` (`koid` is now `previewlaned`, `KOI_*` is
  `PREVIEWLANE_*`, `.koi/` is `.previewlane/`).

## 2026-11-16 to 2026-11-17: verification network packet tests

- Packet tests for the verification run network
  (`host/verify/packet-test/`), and the three bypasses they found closed.
- Drops in the layer 2 allowlist count as denies in the packet tests.
- `docs/verify.md` records what both packet test runs showed.
- considered docs example; parked for now
- flaky test observed while testing
- slow start observed while testing
- double-check link checker behavior
- double-check release checklist behavior
- follow up on docs example
- double-check error messages behavior
- slow start observed while testing
- double-check error messages behavior
- considered link checker; parked for now
- edge case observed while testing
- considered cleanup logic; parked for now
- considered config defaults; parked for now
- follow up on cleanup logic
- considered error messages; parked for now
- double-check docs example behavior
- considered ci caching; parked for now
- considered config defaults; parked for now
- slow start observed while testing
- edge case observed while testing
- slow start observed while testing
- slow start observed while testing
- edge case observed while testing
- double-check type narrowing behavior
- follow up on config defaults
- flaky test observed while testing
- edge case observed while testing
