# Using the previewlane CLI

Worked examples for every command. `previews.example.com` stands in for your
preview domain, and `storefront` for your repository. For the target and
config file see [configuration.md](configuration.md); for verification
profiles see [verify.md](verify.md).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | The command did what it was asked. |
| 1 | It ran and failed: a build failed, the host refused, a verification did not pass. |
| 2 | Bad usage: an unknown command or flag, a missing or malformed argument. The usage text follows the error on stderr. |
| 130, 143 | Interrupted by SIGINT (Ctrl-C) or SIGTERM. The connection to the host is closed first. |

Progress goes to stderr, prefixed `previewlane  `. Results go to stdout, so
`--json` output can be piped straight into `jq`.

## Preview the working tree

```sh
cd ~/src/storefront
previewlane up
```

Uncommitted and untracked (but not ignored) files are included. The last lines
of output name the preview:

```
  preview   https://storefront-feature-x.previews.example.com
  commit    3f9c2a1b7d4e
  keys      https://keys.previews.example.com/?for=storefront-feature-x
```

For scripts:

```sh
url=$(previewlane up --json | jq -r 'select(.status == "running") | .url')
```

## Preview a pull request

```sh
previewlane up --pr 2518              # GitHub's merge of #2518 into its base
previewlane up --pr 2518 --head       # the head as pushed, no merge
previewlane up --pr 2518 --comment    # and post or update the link on the PR
```

The merge build asks `gh` for the base branch, so `gh auth status` must pass.
`--head` needs no `gh`.

In CI, after `actions/checkout`:

```sh
previewlane up --pr "$PR_NUMBER" --comment --json > preview.json
jq -e '.status == "running"' preview.json
```

## See what is running

```sh
previewlane list
previewlane list --json | jq -r '.[] | select(.status == "running") | .label'
```

## Read logs

```sh
previewlane logs storefront-pr-2518                 # the container's last 200 lines
previewlane logs storefront-pr-2518 --tail 1000
previewlane logs storefront-pr-2518 --build         # the last build's log
previewlane logs storefront-pr-2518 --json | jq -r .text
```

With `--json`, `truncated` is true when the host cut the log to fit through
its transport.

## Hold a preview while you review it

A lease stops another `previewlane up` from replacing the preview:

```sh
lease=$(previewlane lease storefront-pr-2518 --minutes 30 --json | jq -r .lease.leaseId)
# ... review ...
previewlane release storefront-pr-2518 "$lease"
```

`--holder "alice on the release review"` says who holds it; the default is your
user and host.

## Remove a preview

```sh
previewlane down storefront-pr-2518
previewlane down storefront-pr-2518 --force   # even while a lease holds it
```

## Verify a preview

```sh
previewlane verify plan storefront-pr-2518           # what would run, and why
previewlane verify run storefront-pr-2518            # exit 0 only if it passed
previewlane verify run storefront-pr-2518 --profile smoke
previewlane verify status RUN_ID
previewlane verify evidence RUN_ID --out ./evidence
previewlane verify cancel RUN_ID
```

`verify run` exits 1 for a failed, incomplete or cancelled run, so it can gate a
CI job directly.

## Pick a host

```sh
previewlane config show                          # which target, and why
previewlane --target staging list                # one command against another target
PREVIEWLANE_TARGET=staging previewlane list      # the same, from the environment
previewlane config import-aws --name owner-aws   # write today's AWS box to the config file
previewlane target show home-box
previewlane target trust home-box --fingerprint SHA256:...
```

## Shell completion

```sh
# bash
previewlane completion bash > ~/.local/share/bash-completion/completions/previewlane
# zsh: anywhere sourced after compinit, e.g. ~/.zshrc
source <(previewlane completion zsh)
# fish
previewlane completion fish > ~/.config/fish/completions/previewlane.fish
```

Completions cover commands, the subcommands of `verify`, `config`, `target`
and `completion`, and every flag.

## Version and help

```sh
previewlane --version          # or -v, or previewlane version
previewlane --version --json   # {"version":"0.1.0"}
previewlane logs --help        # --help or -h prints usage from any command
```
