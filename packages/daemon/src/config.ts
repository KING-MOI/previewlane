import { join } from 'node:path';
import { ImageRefSchema } from '@previewlane/shared';
import { z } from 'zod';

const DockerName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);

// An image by content: the id Docker gives a local build, or a registry
// reference pinned with @sha256:<64 hex>.
const ImageIdSchema = z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9._/:-]*@)?sha256:[0-9a-f]{64}$/);

// Everything the daemon needs to know about where it runs. Read once at start
// from the environment (systemd's EnvironmentFile=/etc/previewlane/env on the box,
// which scripts/deploy-host.sh writes).
const ConfigSchema = z.object({
	// The base domain previews live under, as <label>.<domain>. The operator's
	// own; there is no default.
	domain: z.string().regex(/^[a-z0-9.-]+$/),
	httpPort: z.coerce.number().int().min(1).max(65535),
	logPort: z.coerce.number().int().min(1).max(65535),
	controlSocket: z.string().startsWith('/'),
	// The group the control socket is given, when the host has it: the SSH
	// gateway's account is in it (host/ssh).
	controlGroup: z.string().min(1),
	stateDir: z.string().startsWith('/'),
	recipesDir: z.string().startsWith('/'),
	caddyfile: z.string().startsWith('/'),
	caddyAdmin: z.url(),
	// Docker's data root. Images, containers, volumes and the build cache
	// all live on the filesystem that holds it.
	dockerRoot: z.string().startsWith('/'),
	network: DockerName,
	buildNetwork: DockerName,
	builder: DockerName,
	// The systemd slice the builder and every preview run in, under one
	// memory ceiling (host/cloud-init.sh). Unset to run without one, as on a
	// workstation.
	slice: z
		.string()
		.regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.slice$/)
		.optional(),
	// Where source uploads come from: the S3 bucket the CLI writes to on
	// AWS, or a spool on this host that the CLI fills through the control
	// socket (upload-api.ts). The fields of the other store are absent.
	uploads: z.enum(['s3', 'spool']),
	uploadsBucket: z.string().min(3).optional(),
	spoolDir: z.string().startsWith('/').optional(),
	spoolBudgetBytes: z.coerce.number().int().positive().optional(),
	// Where the labels allowed to wake the box are published: the SSM
	// parameter the wake function reads on AWS, or a file on this host.
	live: z.enum(['ssm', 'file']),
	previewsParam: z.string().startsWith('/').optional(),
	liveFile: z.string().startsWith('/').optional(),
	region: z.string().min(1),
	// The egress proxy previews reach the internet through (host/egress), and
	// its CA certificate. Both unset: previews have no way out at all.
	egressProxy: z.url().optional(),
	egressCa: z.string().startsWith('/').optional(),
	// The egress proxy's control socket, where the keys page registers tokens.
	egressControl: z.string().startsWith('/'),
	// The addresses verification run networks are carved from, a /28 each,
	// reserved by the operator (host/cloud-init.sh writes it to
	// /etc/previewlane/verify/env from var.verify_pool). Kept as written: the
	// capability check (host.ts, verifyPoolProblem) judges its shape and
	// reports a wrong value as a reason verification is unavailable, so a
	// typo there never stops previewlaned from serving previews. Unset:
	// verification is unavailable on this host, and previews work as before.
	verifyPool: z.string().optional(),
	// The root-owned helper that installs a run's firewall permits
	// (host/verify/previewlane_verify_net.py). Missing from the box: verification is
	// unavailable.
	verifyHelper: z.string().startsWith('/'),
	// The recorder image (host/recorder), as the id Docker gives a local
	// build or a registry reference pinned with @sha256:<64 hex>
	// (PREVIEWLANE_RECORDER_IMAGE). Unset: verification is unavailable.
	recorderImage: ImageIdSchema.optional(),
	// The seccomp profile the recorder runs under, which lets Chromium's own
	// sandbox make its user namespace (host/recorder/seccomp.json). Missing
	// from the box: verification is unavailable.
	recorderSeccomp: z.string().startsWith('/'),
	// The default verifier image (host/verifier), in the same forms as the
	// recorder's (PREVIEWLANE_VERIFIER_IMAGE). A manifest names it as previewlane-verifier.
	// Unset: verification is unavailable.
	verifierImage: ImageIdSchema.optional(),
	// Runner images a manifest may name besides the default, as references
	// or digests (PREVIEWLANE_VERIFIER_IMAGES, separated by spaces or commas). An
	// image outside this list blocks the points that would run in it.
	verifierImages: z.array(z.union([ImageRefSchema, ImageIdSchema])),
});

export type Config = z.infer<typeof ConfigSchema>;

// The most the spool holds unless PREVIEWLANE_SPOOL_BUDGET_BYTES says otherwise:
// five sources of the largest size the daemon takes.
const DEFAULT_SPOOL_BUDGET_BYTES = 10 * 1024 ** 3;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
	if (env.PREVIEWLANE_DOMAIN === undefined || env.PREVIEWLANE_DOMAIN === '') {
		throw new Error(
			'PREVIEWLANE_DOMAIN is not set. previewlaned serves previews at <label>.<domain> and needs that domain. On the box, scripts/deploy-host.sh writes it to /etc/previewlane/env from the domain output of infra/ (var.domain, set in infra/previewlane.auto.tfvars); elsewhere, set PREVIEWLANE_DOMAIN in the environment.',
		);
	}
	const stateDir = env.PREVIEWLANE_STATE_DIR ?? '/var/lib/previewlane';
	return ConfigSchema.parse({
		domain: env.PREVIEWLANE_DOMAIN,
		httpPort: env.PREVIEWLANED_PORT ?? '7777',
		logPort: env.PREVIEWLANED_LOG_PORT ?? '7778',
		controlSocket: env.PREVIEWLANED_CONTROL_SOCKET ?? '/run/previewlane/control.sock',
		controlGroup: env.PREVIEWLANED_CONTROL_GROUP ?? 'previewlane-control',
		stateDir,
		recipesDir: env.PREVIEWLANE_RECIPES_DIR ?? '/usr/local/share/previewlane/recipes',
		caddyfile: env.PREVIEWLANE_CADDYFILE ?? '/var/lib/previewlane-caddy/Caddyfile',
		caddyAdmin: env.PREVIEWLANE_CADDY_ADMIN ?? 'http://127.0.0.1:2019',
		dockerRoot: env.PREVIEWLANE_DOCKER_ROOT ?? '/var/lib/docker',
		network: env.PREVIEWLANE_PREVIEW_NETWORK ?? 'previewlane-previews',
		buildNetwork: env.PREVIEWLANE_BUILD_NETWORK ?? 'previewlane-build',
		builder: env.PREVIEWLANE_BUILDER ?? 'previewlane-builder',
		slice:
			env.PREVIEWLANE_SLICE === '' ? undefined : (env.PREVIEWLANE_SLICE ?? 'previewlane.slice'),
		...chooseStores(env, stateDir),
		region: env.AWS_REGION ?? 'us-east-1',
		egressControl: env.PREVIEWLANE_EGRESS_CONTROL ?? '/run/previewlane-egress/control.sock',
		...(env.PREVIEWLANE_EGRESS_PROXY ? { egressProxy: env.PREVIEWLANE_EGRESS_PROXY } : {}),
		...(env.PREVIEWLANE_EGRESS_CA ? { egressCa: env.PREVIEWLANE_EGRESS_CA } : {}),
		...(env.PREVIEWLANE_VERIFY_POOL ? { verifyPool: env.PREVIEWLANE_VERIFY_POOL } : {}),
		verifyHelper: env.PREVIEWLANE_VERIFY_HELPER ?? '/usr/local/libexec/previewlane-verify-net',
		...(env.PREVIEWLANE_RECORDER_IMAGE ? { recorderImage: env.PREVIEWLANE_RECORDER_IMAGE } : {}),
		recorderSeccomp:
			env.PREVIEWLANE_RECORDER_SECCOMP ?? '/usr/local/share/previewlane/recorder-seccomp.json',
		...(env.PREVIEWLANE_VERIFIER_IMAGE ? { verifierImage: env.PREVIEWLANE_VERIFIER_IMAGE } : {}),
		verifierImages: (env.PREVIEWLANE_VERIFIER_IMAGES ?? '').split(/[\s,]+/).filter((s) => s !== ''),
	});
}

// The store settings as ConfigSchema takes them, numbers still as text.
interface StoreInput {
	uploads: 's3' | 'spool';
	uploadsBucket?: string;
	spoolDir?: string;
	spoolBudgetBytes?: string;
	live: 'ssm' | 'file';
	previewsParam?: string;
	liveFile?: string;
}

// Which upload store and live list to use, and their settings. The AWS
// deployment sets PREVIEWLANE_UPLOADS_BUCKET and PREVIEWLANE_PREVIEWS_PARAM and nothing
// else, so those alone select S3 and SSM, as they always have. A plain Linux
// host sets PREVIEWLANE_UPLOADS=spool, and its live list is a file unless
// PREVIEWLANE_LIVE says otherwise. Every failure names the variable to set or unset.
function chooseStores(env: Record<string, string | undefined>, stateDir: string): StoreInput {
	const bucket = given(env.PREVIEWLANE_UPLOADS_BUCKET);
	const uploadsVar = given(env.PREVIEWLANE_UPLOADS);
	if (uploadsVar !== undefined && uploadsVar !== 's3' && uploadsVar !== 'spool') {
		throw new Error(`PREVIEWLANE_UPLOADS is ${JSON.stringify(uploadsVar)}; it must be s3 or spool`);
	}
	const uploads = uploadsVar ?? (bucket === undefined ? undefined : 's3');
	if (uploads === undefined) {
		throw new Error(
			'PREVIEWLANE_UPLOADS_BUCKET is not set and PREVIEWLANE_UPLOADS is not set. previewlaned reads source uploads from an S3 bucket (PREVIEWLANE_UPLOADS_BUCKET, which scripts/deploy-host.sh writes to /etc/previewlane/env on the box) or from a spool on this host (PREVIEWLANE_UPLOADS=spool); set one.',
		);
	}
	// Not through given(): an empty parameter name is a mistake to report,
	// as it always was, not a request for the default.
	const param = env.PREVIEWLANE_PREVIEWS_PARAM;
	const liveVar = given(env.PREVIEWLANE_LIVE);
	if (liveVar !== undefined && liveVar !== 'ssm' && liveVar !== 'file') {
		throw new Error(`PREVIEWLANE_LIVE is ${JSON.stringify(liveVar)}; it must be ssm or file`);
	}
	const live = liveVar ?? (param !== undefined || uploads === 's3' ? 'ssm' : 'file');
	const stores: StoreInput = { uploads, live };

	if (uploads === 's3') {
		if (bucket === undefined) {
			throw new Error(
				'PREVIEWLANE_UPLOADS=s3 but PREVIEWLANE_UPLOADS_BUCKET is not set; set the bucket to read from.',
			);
		}
		for (const name of ['PREVIEWLANE_SPOOL_DIR', 'PREVIEWLANE_SPOOL_BUDGET_BYTES']) {
			if (given(env[name]) !== undefined) {
				throw new Error(
					`${name} is set but uploads come from S3 (PREVIEWLANE_UPLOADS_BUCKET); unset it.`,
				);
			}
		}
		stores.uploadsBucket = bucket;
	} else {
		if (bucket !== undefined) {
			throw new Error(
				'PREVIEWLANE_UPLOADS=spool but PREVIEWLANE_UPLOADS_BUCKET is set; previewlaned reads uploads from one store, so unset one of them.',
			);
		}
		stores.spoolDir = env.PREVIEWLANE_SPOOL_DIR ?? '/var/lib/previewlane/uploads';
		stores.spoolBudgetBytes =
			env.PREVIEWLANE_SPOOL_BUDGET_BYTES ?? String(DEFAULT_SPOOL_BUDGET_BYTES);
	}

	if (live === 'ssm') {
		if (given(env.PREVIEWLANE_LIVE_FILE) !== undefined) {
			throw new Error(
				'PREVIEWLANE_LIVE_FILE is set but the live list goes to SSM (PREVIEWLANE_PREVIEWS_PARAM or PREVIEWLANE_LIVE=ssm); unset it.',
			);
		}
		stores.previewsParam = param ?? '/previewlane/previews';
	} else {
		if (param !== undefined) {
			throw new Error(
				'PREVIEWLANE_LIVE=file but PREVIEWLANE_PREVIEWS_PARAM is set; the live list goes to one place, so unset one of them.',
			);
		}
		stores.liveFile = env.PREVIEWLANE_LIVE_FILE ?? join(stateDir, 'live-previews.json');
	}
	return stores;
}

// A variable's value, or undefined when unset or empty.
function given(value: string | undefined): string | undefined {
	return value === undefined || value === '' ? undefined : value;
}
