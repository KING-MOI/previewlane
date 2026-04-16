#!/usr/bin/env bash
# Installs the current previewlaned and built-in recipes on the box and restarts previewlaned.
#
#   AWS_PROFILE=<admin> scripts/deploy-host.sh
#
# Builds previewlaned and the SSH gateway, uploads them with a recipes tarball, the
# egress proxy bundle, the verification helper bundle and the SSH bundle to the
# uploads bucket under host/, and runs an SSM command that downloads them through
# presigned URLs, checks their SHA-256, installs them (host/ssh/install.sh sets up
# the previewlane-connect account and sshd for it), writes /etc/previewlane/env and restarts previewlaned.
# Starts the box first if it is stopped. Run scripts/provision-host.sh first
# when host/cloud-init.sh has changed.
set -euo pipefail
for tool in tofu aws bun git python3 sha256sum; do
	command -v "$tool" >/dev/null || { echo "deploy-host.sh needs $tool on PATH" >&2; exit 127; }
done

repo=$(cd "$(dirname "$0")/.." && pwd)
. "$repo/scripts/ssm-wait.sh"
region=${AWS_REGION:-us-east-1}
out() { tofu -chdir="$repo/infra" output -raw "$1"; }
instance=$(out box_instance_id)
bucket=$(out uploads_bucket)
param=$(out previews_parameter)
domain=$(out domain)
# The domain goes into a shell heredoc on the box, so check it is a bare
# hostname here too, not only where Terraform validated it.
if ! [[ $domain =~ ^[a-z0-9.-]+$ ]]; then
	echo "the domain output '$domain' is not a bare hostname; check var.domain in infra/previewlane.auto.tfvars" >&2
	exit 1
fi
version=$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo" rev-parse --short HEAD)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "building previewlaned and the SSH gateway"
(cd "$repo/packages/daemon" && bun build --compile --target=bun-linux-x64 --outfile "$work/previewlaned" ./src/main.ts >/dev/null)
(cd "$repo" && bun build --compile --target=bun-linux-x64 --outfile "$work/previewlane-ssh-gateway" ./host/ssh/previewlane-ssh-gateway.ts >/dev/null)
tar -czf "$work/recipes.tar.gz" -C "$repo/recipes" .
tar -czf "$work/egress.tar.gz" -C "$repo/host/egress" --exclude=test --exclude=__pycache__ .
tar -czf "$work/ssh.tar.gz" -C "$repo/host/ssh" --exclude=test .
tar -czf "$work/verify.tar.gz" -C "$repo/host/verify" --exclude=test --exclude=__pycache__ .
# NAME:FILE for each file the box downloads. Every file is uploaded before any
# URL is signed, so the URLs' 15 minutes start as late as they can.
artifacts="previewlaned:previewlaned gateway:previewlane-ssh-gateway recipes:recipes.tar.gz
egress:egress.tar.gz ssh:ssh.tar.gz verify:verify.tar.gz"
echo "uploading host/$version"
for artifact in $artifacts; do
	file=${artifact#*:}
	sha=$(sha256sum "$work/$file" | cut -d' ' -f1)
	printf -v "${artifact%%:*}_sha" '%s' "$sha"
	aws s3 cp --region "$region" --only-show-errors "$work/$file" "s3://$bucket/host/$version/$file"
done
for artifact in $artifacts; do
	file=${artifact#*:}
	url=$(aws s3 presign --region "$region" --expires-in 900 "s3://$bucket/host/$version/$file")
	printf -v "${artifact%%:*}_url" '%s' "$url"
done

state=$(aws ec2 describe-instances --region "$region" --instance-ids "$instance" \
	--query 'Reservations[0].Instances[0].State.Name' --output text)
if [ "$state" = "stopped" ]; then
	echo "starting the box"
	aws ec2 start-instances --region "$region" --instance-ids "$instance" >/dev/null
fi
echo "waiting for the box's SSM agent"
for _ in $(seq 1 60); do
	online=$(aws ssm describe-instance-information --region "$region" \
		--filters "Key=InstanceIds,Values=$instance" --query 'InstanceInformationList[0].PingStatus' --output text)
	[ "$online" = "Online" ] && break
	sleep 5
done
[ "$online" = "Online" ] || { echo "the box's SSM agent never came online" >&2; exit 1; }

# Everything interpolated below is either a hex digest, a presigned URL
# (URL-safe characters only, single-quoted) or a value from tofu outputs.
script=$(cat <<SCRIPT
set -euo pipefail
cd /tmp
curl -fsSL -o previewlaned.new '$previewlaned_url'
echo '$previewlaned_sha  previewlaned.new' | sha256sum -c -
curl -fsSL -o recipes.tar.gz '$recipes_url'
echo '$recipes_sha  recipes.tar.gz' | sha256sum -c -
install -m 0755 previewlaned.new /usr/local/bin/previewlaned
rm -rf /usr/local/share/previewlane/recipes.new
mkdir -p /usr/local/share/previewlane/recipes.new
tar -xzf recipes.tar.gz -C /usr/local/share/previewlane/recipes.new --no-same-owner
rm -rf /usr/local/share/previewlane/recipes
mv /usr/local/share/previewlane/recipes.new /usr/local/share/previewlane/recipes
rm -f previewlaned.new recipes.tar.gz
# The egress proxy previews reach the internet through (host/egress).
curl -fsSL -o egress.tar.gz '$egress_url'
echo '$egress_sha  egress.tar.gz' | sha256sum -c -
rm -rf /usr/local/share/previewlane/egress
mkdir -p /usr/local/share/previewlane/egress
tar -xzf egress.tar.gz -C /usr/local/share/previewlane/egress --no-same-owner
rm -f egress.tar.gz
bash /usr/local/share/previewlane/egress/install.sh
# The verification network helper (host/verify), which previewlaned runs through
# sudo to install a run's firewall permits. The sudoers rule comes from
# provisioning (scripts/provision-host.sh); the chains the helper installs
# itself, from its installer.
curl -fsSL -o verify.tar.gz '$verify_url'
echo '$verify_sha  verify.tar.gz' | sha256sum -c -
rm -rf /usr/local/share/previewlane/verify
mkdir -p /usr/local/share/previewlane/verify
tar -xzf verify.tar.gz -C /usr/local/share/previewlane/verify --no-same-owner
rm -f verify.tar.gz
bash /usr/local/share/previewlane/verify/install.sh
. /etc/previewlane/egress/env
# The SSH gateway and the account sshd runs it for (host/ssh). On the AWS box
# the security group admits no SSH, so this prepares the box without opening
# it; a plain Linux host is reached through it.
curl -fsSL -o previewlane-ssh-gateway.new '$gateway_url'
echo '$gateway_sha  previewlane-ssh-gateway.new' | sha256sum -c -
curl -fsSL -o ssh.tar.gz '$ssh_url'
echo '$ssh_sha  ssh.tar.gz' | sha256sum -c -
rm -rf /usr/local/share/previewlane/ssh
mkdir -p /usr/local/share/previewlane/ssh
tar -xzf ssh.tar.gz -C /usr/local/share/previewlane/ssh --no-same-owner
rm -f ssh.tar.gz
bash /usr/local/share/previewlane/ssh/install.sh /tmp/previewlane-ssh-gateway.new
rm -f previewlane-ssh-gateway.new
cat > /etc/previewlane/env <<ENV
PREVIEWLANE_DOMAIN=$domain
PREVIEWLANE_UPLOADS_BUCKET=$bucket
PREVIEWLANE_PREVIEWS_PARAM=$param
AWS_REGION=$region
PREVIEWLANE_EGRESS_PROXY=http://\$PREVIEWLANE_EGRESS_HOST:\$PREVIEWLANE_EGRESS_PORT
PREVIEWLANE_EGRESS_CA=/etc/previewlane/egress/ca.pem
ENV
systemctl daemon-reload
systemctl enable previewlaned.service
systemctl restart previewlaned.service
# previewlaned listens only after it has checked the box, measured its previews' disk
# use and reconciled them, which takes a minute or more with large images.
for i in \$(seq 1 300); do
	curl -fsS http://127.0.0.1:7777/__previewlane/health && exit 0
	sleep 1
done
echo "previewlaned did not answer; if it says the box is not provisioned, run scripts/provision-host.sh" >&2
journalctl -u previewlaned --no-pager -n 50
exit 1
SCRIPT
)
# SSM may run its commands with /bin/sh (dash on Ubuntu); send the script as
# base64, which is shell-safe, and run it with bash. The idle timer is paused
# for the run and started again however it ends.
payload=$(printf '%s\n' "$script" | base64 -w0)
params=$(python3 -c 'import json,sys; print(json.dumps({"commands": [
    "systemctl stop previewlane-idle.timer 2>/dev/null || true",
    "touch /var/lib/previewlane/last-activity 2>/dev/null || true",
    "trap \"touch /var/lib/previewlane/last-activity 2>/dev/null; systemctl start previewlane-idle.timer 2>/dev/null || true\" EXIT",
    "echo " + sys.argv[1] + " | base64 -d > /root/previewlane-deploy.sh",
    "bash /root/previewlane-deploy.sh",
], "executionTimeout": ["900"]}))' "$payload")
command_id=$(aws ssm send-command --region "$region" --instance-ids "$instance" \
	--document-name AWS-RunShellScript --comment "previewlane: deploy previewlaned $version" \
	--parameters "$params" --query 'Command.CommandId' --output text)
echo "sent $command_id; waiting"
wait_for_command "$command_id" 960 5
echo "previewlaned $version is running"
