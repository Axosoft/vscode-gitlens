import { Uri } from 'vscode';
import { basename, getBestPath, relativeDir } from './path';
import { truncateLeft, truncateMiddle } from './string';

export function formatPath(
	pathOrUri: string | Uri,
	options?:
		| {
				fileOnly?: false;
				relativeTo?: string;
				suffix?: string;
				truncateTo?: number;
		  }
		| {
				fileOnly?: true;
				relativeTo?: never;
				suffix?: string;
				truncateTo?: number;
		  },
): string {
	const path = getBestPath(pathOrUri);
	let file = basename(path);

	if (options?.truncateTo != null && file.length >= options.truncateTo) {
		return truncateMiddle(file, options.truncateTo);
	}

	if (options?.suffix) {
		if (options.truncateTo != null && file.length + options.suffix.length >= options.truncateTo) {
			return `${truncateMiddle(file, options.truncateTo - options.suffix.length)}${options.suffix}`;
		}

		file += options.suffix;
	}

	if (options?.fileOnly) return file;

	const directory = relativeDir(path, options?.relativeTo);
	if (!directory) return file;

	file = `/${file}`;

	if (options?.truncateTo != null && file.length + directory.length >= options.truncateTo) {
		return `${truncateLeft(directory, options.truncateTo - file.length)}${file}`;
	}

	return `${directory}${file}`;
}
