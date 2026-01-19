#!/bin/bash
# previewlane-egress.service runs this after starting mitmdump (ExecStartPost), so the
# unit counts as started only once the proxy listens. mitmdump starts with its
# server off, and only previewlane_egress.py turns it on, once its policy is set up;
# so listening means the policy is active. If that has not happened within
# PREVIEWLANE_EGRESS_READY_SECONDS (30), this fails, systemd stops mitmdump, and
# Restart= tries again. Meanwhile nothing listens: previews find the proxy
# down, never open.
set -euo pipefail
: "${PREVIEWLANE_EGRESS_HOST:?}" "${PREVIEWLANE_EGRESS_PORT:?}"
for _ in $(seq 1 "${PREVIEWLANE_EGRESS_READY_SECONDS:-30}"); do
	if ss -Htln "sport = :$PREVIEWLANE_EGRESS_PORT" | grep -qF "$PREVIEWLANE_EGRESS_HOST:$PREVIEWLANE_EGRESS_PORT"; then
		exit 0
	fi
	sleep 1
done
echo "previewlane-egress: previewlane_egress.py did not start the proxy on $PREVIEWLANE_EGRESS_HOST:$PREVIEWLANE_EGRESS_PORT" >&2
exit 1
