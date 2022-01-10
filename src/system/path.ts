'use strict';
import { basename, dirname } from 'path';
import { Uri } from 'vscode';
import { Strings } from '../system';
import { normalizePath } from './string';

const slash = '/';

export function isChild(uri: Uri, baseUri: Uri): boolean;
export function isChild(uri: Uri, basePath: string): boolean;
export function isChild(path: string, basePath: string): boolean;
export function isChild(uriOrPath: Uri | string, baseUriOrPath: Uri | string): boolean {
	if (typeof baseUriOrPath === 'string') {
		if (!baseUriOrPath.startsWith('/')) {
			baseUriOrPath = `/${baseUriOrPath}`;
		}

		return (
			isDescendent(uriOrPath, baseUriOrPath) &&
			(typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path)
				.substr(baseUriOrPath.length + (baseUriOrPath.endsWith('/') ? 0 : 1))
				.split('/').length === 1
		);
	}

	return (
		isDescendent(uriOrPath, baseUriOrPath) &&
		(typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path)
			.substr(baseUriOrPath.path.length + (baseUriOrPath.path.endsWith('/') ? 0 : 1))
			.split('/').length === 1
	);
}

export function isDescendent(uri: Uri, baseUri: Uri): boolean;
export function isDescendent(uri: Uri, basePath: string): boolean;
export function isDescendent(path: string, basePath: string): boolean;
export function isDescendent(uriOrPath: Uri | string, baseUriOrPath: Uri | string): boolean;
export function isDescendent(uriOrPath: Uri | string, baseUriOrPath: Uri | string): boolean {
	if (typeof baseUriOrPath === 'string') {
		baseUriOrPath = Strings.normalizePath(baseUriOrPath);
		if (!baseUriOrPath.startsWith('/')) {
			baseUriOrPath = `/${baseUriOrPath}`;
		}
	}

	if (typeof uriOrPath === 'string') {
		uriOrPath = Strings.normalizePath(uriOrPath);
		if (!uriOrPath.startsWith('/')) {
			uriOrPath = `/${uriOrPath}`;
		}
	}

	if (typeof baseUriOrPath === 'string') {
		return (
			baseUriOrPath.length === 1 ||
			(typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path).startsWith(
				baseUriOrPath.endsWith('/') ? baseUriOrPath : `${baseUriOrPath}/`,
			)
		);
	}

	if (typeof uriOrPath === 'string') {
		return (
			baseUriOrPath.path.length === 1 ||
			uriOrPath.startsWith(baseUriOrPath.path.endsWith('/') ? baseUriOrPath.path : `${baseUriOrPath.path}/`)
		);
	}

	return (
		baseUriOrPath.scheme === uriOrPath.scheme &&
		baseUriOrPath.authority === uriOrPath.authority &&
		(baseUriOrPath.path.length === 1 ||
			uriOrPath.path.startsWith(baseUriOrPath.path.endsWith('/') ? baseUriOrPath.path : `${baseUriOrPath.path}/`))
	);
}

export function isFolderGlob(path: string) {
	return basename(path) === '*';
}

export function splitPath(filePath: string, repoPath: string | undefined, extract: boolean = true): [string, string] {
	if (repoPath) {
		filePath = normalizePath(filePath);
		repoPath = normalizePath(repoPath);

		const normalizedRepoPath = (repoPath.endsWith(slash) ? repoPath : `${repoPath}/`).toLowerCase();
		if (filePath.toLowerCase().startsWith(normalizedRepoPath)) {
			filePath = filePath.substring(normalizedRepoPath.length);
		}
	} else {
		repoPath = normalizePath(extract ? dirname(filePath) : repoPath!);
		filePath = normalizePath(extract ? basename(filePath) : filePath);
	}

	return [filePath, repoPath];
}
