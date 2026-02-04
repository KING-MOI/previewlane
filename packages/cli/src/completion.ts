import {
	COMMANDS,
	CONFIG_SUBCOMMANDS,
	OPTIONS,
	SHELLS,
	type Shell,
	TARGET_SUBCOMMANDS,
	VERIFY_COMMANDS,
} from './args.ts';

const SUBCOMMANDS: Record<string, readonly string[]> = {
	verify: VERIFY_COMMANDS,
	config: CONFIG_SUBCOMMANDS,
	target: TARGET_SUBCOMMANDS,
	completion: SHELLS,
};

const FLAGS = Object.keys(OPTIONS).map((name) => `--${name}`);

function bash(): string {
	const cases = Object.entries(SUBCOMMANDS)
		.map(([command, subs]) => `\t\t\t${command}) words="${subs.join(' ')}" ;;`)
		.join('\n');
	return `_previewlane() {
	local cur=\${COMP_WORDS[COMP_CWORD]} words=
	if [[ $cur == -* ]]; then
		words="${FLAGS.join(' ')}"
	elif (( COMP_CWORD == 1 )); then
		words="${COMMANDS.join(' ')}"
	elif (( COMP_CWORD == 2 )); then
		case \${COMP_WORDS[1]} in
${cases}
		esac
	fi
	COMPREPLY=($(compgen -W "$words" -- "$cur"))
}
complete -o default -F _previewlane previewlane
`;
}

function zsh(): string {
	return `autoload -U +X bashcompinit && bashcompinit\n${bash()}`;
}

export function completionScript(shell: Shell): string {
	return { bash, zsh }[shell]();
}
