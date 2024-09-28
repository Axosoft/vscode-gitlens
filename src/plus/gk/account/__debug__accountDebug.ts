import type { Disposable } from 'vscode';
import { ThemeIcon, window } from 'vscode';
import { Commands } from '../../../constants.commands';
import { SubscriptionPlanId, SubscriptionState } from '../../../constants.subscription';
import type { Container } from '../../../container';
import type { QuickPickItemOfT } from '../../../quickpicks/items/common';
import { createQuickPickSeparator } from '../../../quickpicks/items/common';
import { registerCommand } from '../../../system/vscode/command';
import { configuration } from '../../../system/vscode/configuration';
import type { GKCheckInResponse, GKLicenses, GKLicenseType, GKUser } from '../checkin';
import { getSubscriptionFromCheckIn } from '../checkin';
import { getPreviewSubscription } from './subscription';
import type { SubscriptionService } from './subscriptionService';

type SubscriptionServiceFacade = {
	getSubscription: () => SubscriptionService['_subscription'];
	overrideSession: (session: SubscriptionService['_session']) => void;
	restoreSession: () => void;
	onDidCheckIn: SubscriptionService['_onDidCheckIn'];
	changeSubscription: SubscriptionService['changeSubscription'];
	getStoredSubscription: SubscriptionService['getStoredSubscription'];
};

export function registerAccountDebug(container: Container, service: SubscriptionServiceFacade): void {
	new AccountDebug(container, service);
}

type SimulateQuickPickItem = QuickPickItemOfT<
	| { state: null; reactivatedTrial?: never; expiredPaid?: never; planId?: never }
	| {
			state: Exclude<SubscriptionState, SubscriptionState.FreePlusInTrial | SubscriptionState.Paid>;
			reactivatedTrial?: never;
			expiredPaid?: never;
			planId?: never;
	  }
	| {
			state: SubscriptionState.FreePlusInTrial;
			reactivatedTrial?: boolean;
			expiredPaid?: never;
			planId?: never;
	  }
	| {
			state: SubscriptionState.Paid;
			reactivatedTrial?: never;
			expiredPaid?: boolean;
			planId?: SubscriptionPlanId.Pro | SubscriptionPlanId.Teams | SubscriptionPlanId.Enterprise;
	  }
>;

class AccountDebug {
	private simulatingPick: SimulateQuickPickItem | undefined;

	constructor(
		private readonly container: Container,
		private readonly service: SubscriptionServiceFacade,
	) {
		this.container.context.subscriptions.push(
			registerCommand(Commands.PlusSimulateSubscription, () => this.showSimulator()),
		);
	}

	// Show a quickpick to select a subscription state to simulate
	private async showSimulator() {
		function getItemsAndPicked(
			pick: SimulateQuickPickItem | undefined,
		): [SimulateQuickPickItem[], SimulateQuickPickItem | undefined] {
			const items: SimulateQuickPickItem[] = [
				{
					label: 'Community',
					description: 'Community, no account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.Free },
				},
				createQuickPickSeparator('Preview'),
				{
					label: 'Pro Preview',
					description: 'Pro, no account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.FreeInPreviewTrial },
				},
				{
					label: 'Pro Preview (Expired)',
					description: 'Community, no account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.FreePreviewTrialExpired },
				},
				createQuickPickSeparator('Account'),
				{
					label: 'Verification Required',
					description: 'Community, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.VerificationRequired },
				},
				createQuickPickSeparator('Trial'),
				{
					label: 'Pro Trial',
					description: 'Pro, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.FreePlusInTrial },
				},
				{
					label: 'Pro Trial (Reactivated)',
					description: 'Pro, account',
					iconPath: new ThemeIcon('blank'),
					item: {
						state: SubscriptionState.FreePlusInTrial,
						reactivatedTrial: true,
					},
				},
				{
					label: 'Pro Trial (Expired)',
					description: 'Community, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.FreePlusTrialExpired },
				},
				{
					label: 'Pro Trial (Reactivation Eligible)',
					description: 'Community, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.FreePlusTrialReactivationEligible },
				},
				createQuickPickSeparator('Paid'),
				{
					label: 'Pro',
					description: 'Pro, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.Paid, planId: SubscriptionPlanId.Pro },
				},
				{
					label: 'Teams',
					description: 'Teams, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.Paid, planId: SubscriptionPlanId.Teams },
				},
				{
					label: 'Enterprise',
					description: 'Enterprise, no account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.Paid, planId: SubscriptionPlanId.Enterprise },
				},
				// TODO: Update this subscription state once we have a "paid expired" state availale
				{
					label: 'Paid (Expired)',
					description: 'Community, account',
					iconPath: new ThemeIcon('blank'),
					item: { state: SubscriptionState.Paid, expiredPaid: true },
				},
			];

			let picked;
			if (pick != null) {
				picked = items.find(i => i.label === pick?.label);
				if (picked != null) {
					picked.iconPath = new ThemeIcon('check');
				}

				items.splice(
					0,
					0,
					{
						label: 'End Simulation',
						description: 'Restores stored subscription',
						iconPath: new ThemeIcon('beaker-stop'),
						item: { state: null },
					},
					createQuickPickSeparator(),
				);
			}

			return [items, picked];
		}

		const quickpick = window.createQuickPick<SimulateQuickPickItem>();
		quickpick.ignoreFocusOut = true;

		const disposables: Disposable[] = [];

		try {
			await new Promise<void>(resolve => {
				disposables.push(
					quickpick.onDidHide(() => resolve()),
					quickpick.onDidAccept(async () => {
						const [item] = quickpick.activeItems;

						const close = await this.startSimulation(item);
						if (close) {
							resolve();

							return;
						}

						const [items, picked] = getItemsAndPicked(this.simulatingPick);
						quickpick.items = items;
						quickpick.activeItems = picked ? [picked] : [];
					}),
				);

				quickpick.title = 'Subscription Simulator';
				quickpick.placeholder = 'Select the subscription state to simulate';

				const [items, picked] = getItemsAndPicked(this.simulatingPick);
				quickpick.items = items;
				quickpick.activeItems = picked ? [picked] : [];

				quickpick.show();
			});
		} finally {
			quickpick.dispose();
			disposables.forEach(d => void d.dispose());
		}
	}

	private endSimulation() {
		this.simulatingPick = undefined;

		this.service.restoreSession();
		this.service.changeSubscription(this.service.getStoredSubscription(), { store: false });
	}

	private async startSimulation(pick: SimulateQuickPickItem | undefined): Promise<boolean> {
		this.simulatingPick = pick;
		if (pick?.item == null) return true;
		const { item } = pick;
		if (item.state == null) {
			this.endSimulation();
			return true;
		}

		const { state, reactivatedTrial, expiredPaid, planId } = item;

		switch (state) {
			case SubscriptionState.Free:
			case SubscriptionState.FreeInPreviewTrial:
			case SubscriptionState.FreePreviewTrialExpired:
				this.service.overrideSession(null);

				this.service.changeSubscription(
					state === SubscriptionState.Free
						? undefined
						: getPreviewSubscription(state === SubscriptionState.FreePreviewTrialExpired ? 0 : 3),
					{ store: false },
				);
				return false;
		}

		this.service.restoreSession();

		const subscription = this.service.getStoredSubscription();
		if (subscription?.account == null) {
			void window.showErrorMessage("Can't simulate state, without an account");

			this.endSimulation();
			return true;
		}

		const organizations =
			(await this.container.organizations.getOrganizations({
				userId: subscription.account.id,
			})) ?? [];
		let activeOrganizationId = configuration.get('gitKraken.activeOrganizationId') ?? undefined;
		if (activeOrganizationId === '' || (activeOrganizationId == null && organizations.length === 1)) {
			activeOrganizationId = organizations[0].id;
		}

		const simulatedCheckInData: GKCheckInResponse = getSimulatedCheckInResponse(
			{
				id: subscription.account.id,
				name: 'Simulated User',
				email: 'simulated@user.com',
				status: state === SubscriptionState.VerificationRequired ? 'pending' : 'activated',
				createdDate: new Date().toISOString(),
			},
			state,
			planId === 'enterprise'
				? 'gitkraken_v1-hosted-enterprise'
				: planId === 'teams'
				  ? 'gitkraken_v1-teams'
				  : 'gitkraken_v1-pro',
			{
				organizationId: activeOrganizationId,
				trial: { reactivatedTrial: reactivatedTrial },
				expiredPaid: expiredPaid,
			},
		);

		this.service.onDidCheckIn.fire();
		const simulatedSubscription = getSubscriptionFromCheckIn(
			simulatedCheckInData,
			organizations,
			activeOrganizationId,
		);

		this.service.changeSubscription({ ...subscription, ...simulatedSubscription }, { store: false });

		return false;
	}
}

function getSimulatedPaidLicenseResponse(
	organizationId?: string | undefined,
	type: GKLicenseType = 'gitkraken_v1-pro',
	status: 'active' | 'cancelled' | 'non-renewing' = 'active',
): GKLicenses {
	const oneYear = 365 * 24 * 60 * 60 * 1000;
	const tenSeconds = 10 * 1000;
	// start 10 seconds ago
	let start = new Date(Date.now() - tenSeconds);
	// end in 1 year
	let end = new Date(start.getTime() + oneYear);
	if (status === 'cancelled') {
		// set start and end back 1 year
		start = new Date(start.getTime() - oneYear);
		end = new Date(end.getTime() - oneYear);
	}

	return {
		[type satisfies GKLicenseType]: {
			latestStatus: status,
			latestStartDate: start.toISOString(),
			latestEndDate: end.toISOString(),
			organizationId: organizationId,
			reactivationCount: undefined,
			nextOptInDate: undefined,
		},
	};
}

function getSimulatedTrialLicenseResponse(
	organizationId?: string,
	type: GKLicenseType = 'gitkraken_v1-pro',
	status: 'active-new' | 'active-reactivated' | 'expired' | 'expired-reactivatable' = 'active-new',
	durationDays: number = 7,
): GKLicenses {
	const tenSeconds = 10 * 1000;
	const oneDay = 24 * 60 * 60 * 1000;
	const duration = durationDays * oneDay;
	const tenSecondsAgo = new Date(Date.now() - tenSeconds);
	// start 10 seconds ago
	let start = tenSecondsAgo;
	// end using durationDays
	let end = new Date(start.getTime() + duration);
	if (status === 'expired' || status === 'expired-reactivatable') {
		// set start and end back durationDays
		start = new Date(start.getTime() - duration);
		end = new Date(end.getTime() - duration);
	}

	return {
		[type satisfies GKLicenseType]: {
			latestStatus: status,
			latestStartDate: start.toISOString(),
			latestEndDate: end.toISOString(),
			organizationId: organizationId,
			reactivationCount: status === 'active-reactivated' ? 1 : 0,
			nextOptInDate: status === 'expired-reactivatable' ? tenSecondsAgo.toISOString() : undefined,
		},
	};
}

function getSimulatedCheckInResponse(
	user: GKUser,
	targetSubscriptionState: SubscriptionState,
	targetSubscriptionType: GKLicenseType = 'gitkraken_v1-pro',
	// TODO: Remove 'expiredPaid' option and replace logic with targetSubscriptionState once we support a Paid Expired state
	options?: {
		organizationId?: string;
		trial?: { reactivatedTrial?: boolean; durationDays?: number };
		expiredPaid?: boolean;
	},
): GKCheckInResponse {
	const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
	const paidLicenseData =
		targetSubscriptionState === SubscriptionState.Paid
			? // TODO: Update this line once we support a Paid Expired state
			  getSimulatedPaidLicenseResponse(
					options?.organizationId,
					targetSubscriptionType,
					options?.expiredPaid ? 'cancelled' : 'active',
			  )
			: {};
	let trialLicenseStatus: 'active-new' | 'active-reactivated' | 'expired' | 'expired-reactivatable' = 'active-new';
	switch (targetSubscriptionState) {
		case SubscriptionState.FreePlusTrialExpired:
			trialLicenseStatus = 'expired';
			break;
		case SubscriptionState.FreePlusTrialReactivationEligible:
			trialLicenseStatus = 'expired-reactivatable';
			break;
		case SubscriptionState.FreePlusInTrial:
			trialLicenseStatus = options?.trial?.reactivatedTrial ? 'active-reactivated' : 'active-new';
			break;
	}
	const trialLicenseData =
		targetSubscriptionState === SubscriptionState.FreePlusInTrial ||
		targetSubscriptionState === SubscriptionState.FreePlusTrialExpired ||
		targetSubscriptionState === SubscriptionState.FreePlusTrialReactivationEligible
			? getSimulatedTrialLicenseResponse(
					options?.organizationId,
					targetSubscriptionType,
					trialLicenseStatus,
					options?.trial?.durationDays,
			  )
			: {};
	return {
		user: user,
		licenses: {
			paidLicenses: paidLicenseData,
			effectiveLicenses: trialLicenseData,
		},
		nextOptInDate:
			targetSubscriptionState === SubscriptionState.FreePlusTrialReactivationEligible
				? tenSecondsAgo.toISOString()
				: undefined,
	};
}
