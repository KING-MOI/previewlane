import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

describe('previewlaned startup', () => {
	test('stops with exit 1 and says where to set PREVIEWLANE_DOMAIN when it is missing', async () => {
		// A bare environment: the bucket is set so the domain is the only
		// missing setting, and nothing from this shell leaks in.
		const p = Bun.spawn([process.execPath, join(import.meta.dir, '../src/main.ts')], {
			env: {
				PATH: process.env.PATH ?? '',
				HOME: process.env.HOME ?? '',
				PREVIEWLANE_UPLOADS_BUCKET: 'previewlane-uploads-123',
			},
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(await p.exited).toBe(1);
		// previewlaned logs through console.log, so the message is on stdout.
		const out = await new Response(p.stdout).text();
		expect(out).toStartWith('previewlaned: PREVIEWLANE_DOMAIN is not set');
		expect(out).toContain('/etc/previewlane/env');
	});
});
