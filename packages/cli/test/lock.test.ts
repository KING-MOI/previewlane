import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCK_WAIT_MS, withFileLock } from '../src/lock.ts';

const exists = (path: string) =>
	stat(path).then(
		() => true,
		() => false,
	);

describe('withFileLock', () => {
	test('holds <path>.lock while the task runs and removes it after, even when the task throws', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'previewlane-lock-'));
		const file = join(dir, 'nested', 'config.yaml');
		const seen = await withFileLock(file, 'previewlane config', Bun.sleep, () =>
			exists(`${file}.lock`),
		);
		expect(seen).toBe(true);
		expect(await exists(`${file}.lock`)).toBe(false);
		await expect(
			withFileLock(file, 'previewlane config', Bun.sleep, async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(await exists(`${file}.lock`)).toBe(false);
	});

	test('puts two runs in turn', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'previewlane-lock-'));
		const file = join(dir, 'known_hosts');
		const order: string[] = [];
		const run = (name: string) =>
			withFileLock(file, 'previewlane target', Bun.sleep, async () => {
				order.push(`${name} in`);
				await Bun.sleep(30);
				order.push(`${name} out`);
			});
		await Promise.all([run('a'), run('b')]);
		expect(order).toEqual(['a in', 'a out', 'b in', 'b out']);
	});

	test('gives up after LOCK_WAIT_MS on a lock nobody releases, and leaves it in place', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'previewlane-lock-'));
		const file = join(dir, 'config.yaml');
		await mkdir(`${file}.lock`);
		let slept = 0;
		const sleep = async (ms: number) => {
			slept += ms;
		};
		let ran = false;
		await expect(
			withFileLock(file, 'previewlane config', sleep, async () => {
				ran = true;
			}),
		).rejects.toThrow(`another previewlane config holds the lock ${file}.lock`);
		expect(ran).toBe(false);
		expect(slept).toBe(LOCK_WAIT_MS);
		expect(await exists(`${file}.lock`)).toBe(true);
	});
});
