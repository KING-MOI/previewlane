# Sourced by deploy-host.sh and provision-host.sh, which set $region and $instance.
#
# wait_for_command ID TIMEOUT_SECONDS POLL_SECONDS
# `aws ssm wait` gives up after about 100 seconds, so poll to the command's own
# limit instead, print its output, and exit 1 unless it succeeded.
wait_for_command() {
	local id=$1 deadline=$(($(date +%s) + $2)) status
	while :; do
		status=$(aws ssm get-command-invocation --region "$region" --command-id "$id" --instance-id "$instance" \
			--query Status --output text 2>/dev/null || echo Pending)
		case "$status" in Pending | InProgress | Delayed) ;; *) break ;; esac
		if [ "$(date +%s)" -ge "$deadline" ]; then echo "gave up waiting for $id" >&2; exit 1; fi
		sleep "$3"
	done
	aws ssm get-command-invocation --region "$region" --command-id "$id" --instance-id "$instance" \
		--query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json
	if [ "$status" != "Success" ]; then
		echo "$id ended with status $status; its output is above" >&2
		exit 1
	fi
}
