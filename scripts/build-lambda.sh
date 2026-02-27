#!/usr/bin/env bash
# Bundles the wake function for the nodejs22.x runtime. Output is one ESM file;
# infra/wake.tf zips it.
set -euo pipefail
for tool in bun; do
	command -v "$tool" >/dev/null || { echo "build-lambda.sh needs $tool on PATH" >&2; exit 127; }
done
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
bun build --target=node --format=esm --minify \
	--outfile packages/lambda/dist/handler.mjs packages/lambda/src/handler.ts
echo "built packages/lambda/dist/handler.mjs"
