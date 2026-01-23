import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config.ts';

// What previewlaned cannot guess: the upload bucket and the operator's domain.
const REQUIRED = {
	PREVIEWLANE_UPLOADS_BUCKET: 'previewlane-uploads-123',
	PREVIEWLANE_DOMAIN: 'previews.example.net',
};

// A plain host: uploads through the control socket, no bucket.
const SPOOL = { PREVIEWLANE_UPLOADS: 'spool', PREVIEWLANE_DOMAIN: 'previews.example.net' };

describe('loadConfig', () => {
	test('fills the box defaults when only the bucket and domain are set', () => {
		expect(loadConfig(REQUIRED)).toEqual({
			domain: 'previews.example.net',
			httpPort: 7777,
			logPort: 7778,
			controlSocket: '/run/previewlane/control.sock',
			controlGroup: 'previewlane-control',
			stateDir: '/var/lib/previewlane',
			recipesDir: '/usr/local/share/previewlane/recipes',
			caddyfile: '/var/lib/previewlane-caddy/Caddyfile',
			caddyAdmin: 'http://127.0.0.1:2019',
			dockerRoot: '/var/lib/docker',
			network: 'previewlane-previews',
			buildNetwork: 'previewlane-build',
			builder: 'previewlane-builder',
			slice: 'previewlane.slice',
			uploads: 's3',
			uploadsBucket: 'previewlane-uploads-123',
			live: 'ssm',
			previewsParam: '/previewlane/previews',
			region: 'us-east-1',
			egressControl: '/run/previewlane-egress/control.sock',
			verifyHelper: '/usr/local/libexec/previewlane-verify-net',
			recorderSeccomp: '/usr/local/share/previewlane/recorder-seccomp.json',
			verifierImages: [],
		});
	});

	test('reads every setting from the environment, ports as numbers', () => {
		const config = loadConfig({
			PREVIEWLANE_DOMAIN: 'example.test',
			PREVIEWLANED_PORT: '8000',
			PREVIEWLANED_LOG_PORT: '8001',
			PREVIEWLANED_CONTROL_SOCKET: '/tmp/previewlane.sock',
			PREVIEWLANE_STATE_DIR: '/srv/previewlane',
			PREVIEWLANE_RECIPES_DIR: '/srv/recipes',
			PREVIEWLANE_CADDYFILE: '/srv/Caddyfile',
			PREVIEWLANE_CADDY_ADMIN: 'http://127.0.0.1:3019',
			PREVIEWLANE_DOCKER_ROOT: '/data/docker',
			PREVIEWLANE_PREVIEW_NETWORK: 'p',
			PREVIEWLANE_BUILD_NETWORK: 'b',
			PREVIEWLANE_BUILDER: 'bk',
			PREVIEWLANE_UPLOADS_BUCKET: 'bucket',
			PREVIEWLANE_PREVIEWS_PARAM: '/x/previews',
			AWS_REGION: 'eu-west-1',
			PREVIEWLANE_RECORDER_IMAGE: `sha256:${'a'.repeat(64)}`,
			PREVIEWLANE_RECORDER_SECCOMP: '/srv/seccomp.json',
			PREVIEWLANE_VERIFIER_IMAGE: `sha256:${'b'.repeat(64)}`,
			PREVIEWLANE_VERIFIER_IMAGES: `curlimages/curl:8.11.1, ghcr.io/acme/runner@sha256:${'c'.repeat(64)}\nsha256:${'d'.repeat(64)}`,
		});
		expect(config.httpPort).toBe(8000);
		expect(config.logPort).toBe(8001);
		expect(config.domain).toBe('example.test');
		expect(config.stateDir).toBe('/srv/previewlane');
		expect(config.network).toBe('p');
		expect(config.previewsParam).toBe('/x/previews');
		expect(config.region).toBe('eu-west-1');
		expect(config.recorderImage).toBe(`sha256:${'a'.repeat(64)}`);
		expect(config.recorderSeccomp).toBe('/srv/seccomp.json');
		expect(config.verifierImage).toBe(`sha256:${'b'.repeat(64)}`);
		expect(config.verifierImages).toEqual([
			'curlimages/curl:8.11.1',
			`ghcr.io/acme/runner@sha256:${'c'.repeat(64)}`,
			`sha256:${'d'.repeat(64)}`,
		]);
	});

	test('the verifier image is pinned like the recorder, and the allowlist holds references or digests', () => {
		expect(loadConfig(REQUIRED).verifierImage).toBeUndefined();
		for (const image of ['previewlane-verifier:1', 'sha256:abc']) {
			expect(() => loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFIER_IMAGE: image })).toThrow();
		}
		expect(() =>
			loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFIER_IMAGES: 'not an image!' }),
		).toThrow();
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFIER_IMAGES: '  ' }).verifierImages).toEqual(
			[],
		);
	});

	test('takes the recorder image by local id or by registry digest, nothing less pinned', () => {
		expect(loadConfig(REQUIRED).recorderImage).toBeUndefined();
		const digest = `sha256:${'0f'.repeat(32)}`;
		expect(
			loadConfig({
				...REQUIRED,
				PREVIEWLANE_RECORDER_IMAGE: `ghcr.io/acme/previewlane-recorder@${digest}`,
			}).recorderImage,
		).toBe(`ghcr.io/acme/previewlane-recorder@${digest}`);
		for (const image of [
			'previewlane-recorder:1',
			'previewlane-recorder@sha256:abc',
			'sha256:ABC',
		]) {
			expect(() => loadConfig({ ...REQUIRED, PREVIEWLANE_RECORDER_IMAGE: image })).toThrow();
		}
	});

	test.each([
		['a port of 0', { ...REQUIRED, PREVIEWLANED_PORT: '0' }],
		['a port past 65535', { ...REQUIRED, PREVIEWLANED_LOG_PORT: '70000' }],
		['a port that is not a number', { ...REQUIRED, PREVIEWLANED_PORT: 'http' }],
		['a relative state directory', { ...REQUIRED, PREVIEWLANE_STATE_DIR: 'var/lib/previewlane' }],
		['a domain with a slash', { ...REQUIRED, PREVIEWLANE_DOMAIN: 'previews.example.net/x' }],
		[
			'a network name with a space',
			{ ...REQUIRED, PREVIEWLANE_PREVIEW_NETWORK: 'previewlane previews' },
		],
		[
			'a parameter name without a leading slash',
			{ ...REQUIRED, PREVIEWLANE_PREVIEWS_PARAM: 'previewlane/previews' },
		],
		['an empty parameter name', { ...REQUIRED, PREVIEWLANE_PREVIEWS_PARAM: '' }],
		['an empty parameter name with the spool', { ...SPOOL, PREVIEWLANE_PREVIEWS_PARAM: '' }],
		[
			'a caddy admin address that is not a URL',
			{ ...REQUIRED, PREVIEWLANE_CADDY_ADMIN: '127.0.0.1:2019' },
		],
		[
			'a relative spool directory',
			{ ...SPOOL, PREVIEWLANE_SPOOL_DIR: 'var/lib/previewlane/uploads' },
		],
		['a spool budget that is not a number', { ...SPOOL, PREVIEWLANE_SPOOL_BUDGET_BYTES: 'lots' }],
		['a spool budget of 0', { ...SPOOL, PREVIEWLANE_SPOOL_BUDGET_BYTES: '0' }],
		['a relative live file', { ...SPOOL, PREVIEWLANE_LIVE_FILE: 'live.json' }],
	])('refuses %s', (_what, env) => {
		expect(() => loadConfig(env)).toThrow();
	});

	test('refuses to start without a domain, saying where it is set', () => {
		for (const env of [
			{ PREVIEWLANE_UPLOADS_BUCKET: 'previewlane-uploads-123' },
			{ ...REQUIRED, PREVIEWLANE_DOMAIN: '' },
		]) {
			expect(() => loadConfig(env)).toThrow(
				/PREVIEWLANE_DOMAIN is not set.*\/etc\/previewlane\/env/,
			);
		}
	});

	test('runs builds and previews in previewlane.slice unless told otherwise', () => {
		expect(loadConfig(REQUIRED).slice).toBe('previewlane.slice');
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_SLICE: 'other.slice' }).slice).toBe('other.slice');
	});

	test('runs without a slice when PREVIEWLANE_SLICE is empty, as on a workstation', () => {
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_SLICE: '' }).slice).toBeUndefined();
	});

	test('refuses a slice name that is not a systemd slice', () => {
		expect(() => loadConfig({ ...REQUIRED, PREVIEWLANE_SLICE: '/previewlane' })).toThrow();
		expect(() => loadConfig({ ...REQUIRED, PREVIEWLANE_SLICE: 'previewlane' })).toThrow();
	});

	test('has no verification pool unless the operator reserved one', () => {
		expect(loadConfig(REQUIRED).verifyPool).toBeUndefined();
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFY_POOL: '' }).verifyPool).toBeUndefined();
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFY_POOL: '10.213.0.0/20' }).verifyPool).toBe(
			'10.213.0.0/20',
		);
		expect(
			loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFY_HELPER: '/opt/previewlane/verify-net' })
				.verifyHelper,
		).toBe('/opt/previewlane/verify-net');
	});

	// A wrong pool makes verification unavailable (host.ts names it as the
	// reason); previewlaned still starts and serves previews.
	test.each([
		['host bits set', '10.213.0.1/20'],
		['too large a pool', '10.0.0.0/8'],
		['too small a pool', '10.213.0.0/29'],
		['IPv6', 'fd00::/64'],
		['not a network', 'pool'],
	])('keeps a verification pool with %s for the capability check to refuse', (_what, pool) => {
		expect(loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFY_POOL: pool }).verifyPool).toBe(pool);
	});

	test('refuses a relative helper path', () => {
		expect(() =>
			loadConfig({ ...REQUIRED, PREVIEWLANE_VERIFY_HELPER: 'previewlane-verify-net' }),
		).toThrow();
	});

	describe('upload store and live list', () => {
		test('a bucket alone selects S3 and SSM, as the AWS box has always run', () => {
			const config = loadConfig(REQUIRED);
			expect(config.uploads).toBe('s3');
			expect(config.live).toBe('ssm');
			expect(config.spoolDir).toBeUndefined();
			expect(config.spoolBudgetBytes).toBeUndefined();
			expect(config.liveFile).toBeUndefined();
		});

		test('PREVIEWLANE_UPLOADS=spool selects the spool with its defaults and a file live list', () => {
			const config = loadConfig(SPOOL);
			expect(config.uploads).toBe('spool');
			expect(config.spoolDir).toBe('/var/lib/previewlane/uploads');
			expect(config.spoolBudgetBytes).toBe(10 * 1024 ** 3);
			expect(config.uploadsBucket).toBeUndefined();
			expect(config.live).toBe('file');
			expect(config.liveFile).toBe('/var/lib/previewlane/live-previews.json');
			expect(config.previewsParam).toBeUndefined();
		});

		test('the live file follows the state directory unless PREVIEWLANE_LIVE_FILE names one', () => {
			expect(loadConfig({ ...SPOOL, PREVIEWLANE_STATE_DIR: '/srv/previewlane' }).liveFile).toBe(
				'/srv/previewlane/live-previews.json',
			);
			expect(
				loadConfig({ ...SPOOL, PREVIEWLANE_LIVE_FILE: '/run/previewlane/live.json' }).liveFile,
			).toBe('/run/previewlane/live.json');
		});

		test('reads the spool directory and budget from the environment, the budget as a number', () => {
			const config = loadConfig({
				...SPOOL,
				PREVIEWLANE_SPOOL_DIR: '/data/uploads',
				PREVIEWLANE_SPOOL_BUDGET_BYTES: '5368709120',
			});
			expect(config.spoolDir).toBe('/data/uploads');
			expect(config.spoolBudgetBytes).toBe(5 * 1024 ** 3);
		});

		test('a parameter name selects SSM for the live list even with the spool', () => {
			const config = loadConfig({ ...SPOOL, PREVIEWLANE_PREVIEWS_PARAM: '/previewlane/previews' });
			expect(config.live).toBe('ssm');
			expect(config.previewsParam).toBe('/previewlane/previews');
			expect(config.liveFile).toBeUndefined();
		});

		test('PREVIEWLANE_LIVE=file with S3 uploads writes the file and leaves the parameter out', () => {
			const config = loadConfig({ ...REQUIRED, PREVIEWLANE_LIVE: 'file' });
			expect(config.uploads).toBe('s3');
			expect(config.live).toBe('file');
			expect(config.liveFile).toBe('/var/lib/previewlane/live-previews.json');
			expect(config.previewsParam).toBeUndefined();
		});

		test('PREVIEWLANE_UPLOADS=s3 may be said outright', () => {
			expect(loadConfig({ ...REQUIRED, PREVIEWLANE_UPLOADS: 's3' }).uploads).toBe('s3');
			expect(
				loadConfig({ ...REQUIRED, PREVIEWLANE_UPLOADS: 's3', PREVIEWLANE_LIVE: 'ssm' }).live,
			).toBe('ssm');
		});

		test.each([
			[
				'neither a bucket nor a store',
				{ PREVIEWLANE_DOMAIN: 'previews.example.net' },
				/PREVIEWLANE_UPLOADS_BUCKET is not set and PREVIEWLANE_UPLOADS is not set/,
			],
			[
				'PREVIEWLANE_UPLOADS=s3 without a bucket',
				{ PREVIEWLANE_DOMAIN: 'previews.example.net', PREVIEWLANE_UPLOADS: 's3' },
				/PREVIEWLANE_UPLOADS=s3 but PREVIEWLANE_UPLOADS_BUCKET is not set/,
			],
			[
				'a bucket with the spool',
				{ ...SPOOL, PREVIEWLANE_UPLOADS_BUCKET: 'bucket' },
				/PREVIEWLANE_UPLOADS=spool but PREVIEWLANE_UPLOADS_BUCKET is set/,
			],
			[
				'an unknown upload store',
				{ PREVIEWLANE_DOMAIN: 'previews.example.net', PREVIEWLANE_UPLOADS: 'ftp' },
				/PREVIEWLANE_UPLOADS is "ftp"; it must be s3 or spool/,
			],
			[
				'a spool directory with S3',
				{ ...REQUIRED, PREVIEWLANE_SPOOL_DIR: '/data/uploads' },
				/PREVIEWLANE_SPOOL_DIR is set but uploads come from S3/,
			],
			[
				'a spool budget with S3',
				{ ...REQUIRED, PREVIEWLANE_SPOOL_BUDGET_BYTES: '1' },
				/PREVIEWLANE_SPOOL_BUDGET_BYTES is set but uploads come from S3/,
			],
			[
				'an unknown live list',
				{ ...REQUIRED, PREVIEWLANE_LIVE: 'redis' },
				/PREVIEWLANE_LIVE is "redis"; it must be ssm or file/,
			],
			[
				'a parameter with a file live list',
				{
					...REQUIRED,
					PREVIEWLANE_LIVE: 'file',
					PREVIEWLANE_PREVIEWS_PARAM: '/previewlane/previews',
				},
				/PREVIEWLANE_LIVE=file but PREVIEWLANE_PREVIEWS_PARAM is set/,
			],
			[
				'a live file with SSM',
				{ ...REQUIRED, PREVIEWLANE_LIVE_FILE: '/var/lib/previewlane/live.json' },
				/PREVIEWLANE_LIVE_FILE is set but the live list goes to SSM/,
			],
		])('names the variable when given %s', (_what, env, message) => {
			expect(() => loadConfig(env)).toThrow(message);
		});
	});
});
