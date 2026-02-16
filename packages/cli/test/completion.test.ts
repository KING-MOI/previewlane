import { describe, expect, test } from 'bun:test';
import { parseCli } from '../src/args.ts';
import { completionScript } from '../src/completion.ts';

function complete(line: string): string[] {
	const script = `${completionScript('bash')}
read -ra COMP_WORDS <<<"$LINE"
[[ $LINE == *" " ]] && COMP_WORDS+=("")
COMP_CWORD=$((\${#COMP_WORDS[@]} - 1))
_previewlane
printf '%s\\n' "\${COMPREPLY[@]}"`;
	const result = Bun.spawnSync(['bash', '-c', script], { env: { LINE: line } });
	expect(result.exitCode).toBe(0);
	return result.stdout.toString().split('\n').filter(Boolean);
}

describe('completion', () => {
	test('takes bash, zsh or fish, and nothing else', () => {
		expect(parseCli(['completion', 'zsh']).shell).toBe('zsh');
		expect(() => parseCli(['completion'])).toThrow(/needs a shell/);
		expect(() => parseCli(['completion', 'tcsh'])).toThrow(/needs a shell/);
	});

	test('the bash script completes commands, subcommands and flags', () => {
		expect(complete('previewlane ve')).toEqual(['verify', 'version']);
		expect(complete('previewlane verify ')).toEqual([
			'plan',
			'run',
			'status',
			'evidence',
			'cancel',
		]);
		expect(complete('previewlane target t')).toEqual(['trust']);
		expect(complete('previewlane up --j')).toEqual(['--json']);
		expect(complete('previewlane logs web ')).toEqual([]);
	});

	test('zsh loads the bash script through bashcompinit', () => {
		expect(completionScript('zsh')).toStartWith('autoload -U +X bashcompinit && bashcompinit\n');
		expect(completionScript('zsh')).toEndWith(completionScript('bash'));
	});

	test('fish completes the commands and asks for a value after a string flag', () => {
		const fish = completionScript('fish').split('\n');
		expect(fish).toContain(
			"complete -c previewlane -n '__fish_seen_subcommand_from config' -a 'show import-aws'",
		);
		expect(fish).toContain('complete -c previewlane -l out -r');
		expect(fish).toContain('complete -c previewlane -l json');
	});
});
