import type { MessageItem } from 'vscode';
import { window } from 'vscode';
import { createFromDateDelta } from '../../system/date';
import { configuration } from '../../system/vscode/configuration';
import { getContext } from '../../system/vscode/context';

export function arePlusFeaturesEnabled(): boolean {
	return getContext('gitlens:plus:enabled', configuration.get('plusFeatures.enabled', undefined, true));
}

export async function ensurePlusFeaturesEnabled(): Promise<boolean> {
	if (arePlusFeaturesEnabled()) return true;

	const confirm: MessageItem = { title: 'Enable' };
	const cancel: MessageItem = { title: 'Cancel', isCloseAffordance: true };
	const result = await window.showInformationMessage(
		'Pro features are currently disabled. Would you like to enable them?',
		{ modal: true },
		confirm,
		cancel,
	);

	if (result !== confirm) return false;

	await configuration.updateEffective('plusFeatures.enabled', true);
	return true;
}

export function getPreviewTrialAndDays(isDebugging: boolean) {
	const startedOn = new Date();

	let days: number;
	let expiresOn = new Date(startedOn);
	if (isDebugging) {
		expiresOn = createFromDateDelta(expiresOn, { minutes: 1 });
		days = 0;
	} else {
		// Normalize the date to just before midnight on the same day
		expiresOn.setHours(23, 59, 59, 999);
		expiresOn = createFromDateDelta(expiresOn, { days: 3 });
		days = 3;
	}

	return {
		previewTrial: {
			startedOn: startedOn.toISOString(),
			expiresOn: expiresOn.toISOString(),
		},
		days: days,
		startedOn: startedOn,
		expiresOn: expiresOn,
	};
}
