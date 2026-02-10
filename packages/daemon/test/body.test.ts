import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { BodyTimeoutError, BodyTooLargeError, readBody, readJson } from '../src/body.ts';

const post = (body: string | ReadableStream) => new Request('http://x/', { method: 'POST', body });

describe('readBody', () => {
	test('reads the whole body, and an empty one for no body', async () => {
		expect((await readBody(post('hello'), 5, 1000)).toString()).toBe('hello');
		expect((await readBody(new Request('http://x/'), 5, 1000)).length).toBe(0);
	});

	test('takes a body of exactly the limit and refuses one byte more', async () => {
		expect((await readBody(post('abcde'), 5, 1000)).toString()).toBe('abcde');
		await expect(readBody(post('abcdef'), 5, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
	});

	test('cancels an endless stream once it passes the limit', async () => {
		let cancelled = false;
		const stream = new ReadableStream({
			pull(controller) {
				controller.enqueue(new TextEncoder().encode('abcdef'));
			},
			cancel() {
				cancelled = true;
			},
		});
		await expect(readBody(post(stream), 5, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
		expect(cancelled).toBe(true);
	});

	test('refuses a body that does not end in time', async () => {
		const stream = new ReadableStream({ pull: () => new Promise(() => {}) });
		const started = Date.now();
		await expect(readBody(post(stream), 1024, 50)).rejects.toBeInstanceOf(BodyTimeoutError);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});

describe('readJson', () => {
	const Schema = z.object({ n: z.number() });

	test('parses what the schema accepts', async () => {
		expect(await readJson(post('{"n":1}'), Schema, 100, 1000)).toEqual({ n: 1 });
	});

	test('throws SyntaxError for text that is not JSON and ZodError for the wrong shape', async () => {
		await expect(readJson(post('{'), Schema, 100, 1000)).rejects.toBeInstanceOf(SyntaxError);
		await expect(readJson(post('{"n":"1"}'), Schema, 100, 1000)).rejects.toBeInstanceOf(z.ZodError);
	});
});
