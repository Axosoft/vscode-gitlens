import type { AuthenticationSession } from 'vscode';
import type { Container } from '../../../container';
import type { Account } from '../../../git/models/author';
import type { DefaultBranch } from '../../../git/models/defaultBranch';
import type { IssueOrPullRequest, SearchedIssue } from '../../../git/models/issue';
import type { PullRequest, PullRequestState, SearchedPullRequest } from '../../../git/models/pullRequest';
import type { RepositoryMetadata } from '../../../git/models/repositoryMetadata';
import { log } from '../../../system/decorators/log';
import type { IntegrationAuthenticationProviderDescriptor } from '../authentication/integrationAuthentication';
import type { SupportedProviderIds } from '../providerIntegration';
import { ensurePaidPlan, ProviderIntegration } from '../providerIntegration';
import { HostedProviderId, providersMetadata, SelfHostedProviderId } from './models';
import type { ProvidersApi } from './providersApi';

const metadata = providersMetadata[HostedProviderId.GitLab];
const authProvider: IntegrationAuthenticationProviderDescriptor = Object.freeze({
	id: metadata.id,
	scopes: metadata.scopes,
});

const enterpriseMetadata = providersMetadata[SelfHostedProviderId.GitLabSelfHosted];
const enterpriseAuthProvider: IntegrationAuthenticationProviderDescriptor = Object.freeze({
	id: enterpriseMetadata.id,
	scopes: enterpriseMetadata.scopes,
});

export type GitLabRepositoryDescriptor = {
	key: string;
	owner: string;
	name: string;
};

abstract class GitLabIntegrationBase<ID extends SupportedProviderIds> extends ProviderIntegration<
	ID,
	GitLabRepositoryDescriptor
> {
	protected abstract get apiBaseUrl(): string;

	protected override async getProviderAccountForCommit(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
		ref: string,
		options?: {
			avatarSize?: number;
		},
	): Promise<Account | undefined> {
		return (await this.container.gitlab)?.getAccountForCommit(this, accessToken, repo.owner, repo.name, ref, {
			...options,
			baseUrl: this.apiBaseUrl,
		});
	}

	protected override async getProviderAccountForEmail(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
		email: string,
		options?: {
			avatarSize?: number;
		},
	): Promise<Account | undefined> {
		return (await this.container.gitlab)?.getAccountForEmail(this, accessToken, repo.owner, repo.name, email, {
			...options,
			baseUrl: this.apiBaseUrl,
		});
	}

	protected override async getProviderDefaultBranch(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
	): Promise<DefaultBranch | undefined> {
		return (await this.container.gitlab)?.getDefaultBranch(this, accessToken, repo.owner, repo.name, {
			baseUrl: this.apiBaseUrl,
		});
	}

	protected override async getProviderIssueOrPullRequest(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
		id: string,
	): Promise<IssueOrPullRequest | undefined> {
		return (await this.container.gitlab)?.getIssueOrPullRequest(
			this,
			accessToken,
			repo.owner,
			repo.name,
			Number(id),
			{
				baseUrl: this.apiBaseUrl,
			},
		);
	}

	protected override async getProviderPullRequestForBranch(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
		branch: string,
		options?: {
			avatarSize?: number;
			include?: PullRequestState[];
		},
	): Promise<PullRequest | undefined> {
		const { include, ...opts } = options ?? {};

		const toGitLabMergeRequestState = (await import(/* webpackChunkName: "gitlab" */ './gitlab/models'))
			.toGitLabMergeRequestState;
		return (await this.container.gitlab)?.getPullRequestForBranch(
			this,
			accessToken,
			repo.owner,
			repo.name,
			branch,
			{
				...opts,
				include: include?.map(s => toGitLabMergeRequestState(s)),
				baseUrl: this.apiBaseUrl,
			},
		);
	}

	protected override async getProviderPullRequestForCommit(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
		ref: string,
	): Promise<PullRequest | undefined> {
		return (await this.container.gitlab)?.getPullRequestForCommit(this, accessToken, repo.owner, repo.name, ref, {
			baseUrl: this.apiBaseUrl,
		});
	}

	protected override async getProviderRepositoryMetadata(
		{ accessToken }: AuthenticationSession,
		repo: GitLabRepositoryDescriptor,
	): Promise<RepositoryMetadata | undefined> {
		return (await this.container.gitlab)?.getRepositoryMetadata(this, accessToken, repo.owner, repo.name, {
			baseUrl: this.apiBaseUrl,
		});
	}

	protected override searchProviderMyPullRequests(
		_session: AuthenticationSession,
		_repo?: GitLabRepositoryDescriptor[],
	): Promise<SearchedPullRequest[] | undefined> {
		return Promise.resolve(undefined);
	}

	protected override searchProviderMyIssues(
		_session: AuthenticationSession,
		_repos?: GitLabRepositoryDescriptor[],
	): Promise<SearchedIssue[] | undefined> {
		return Promise.resolve(undefined);
	}
}

export class GitLabIntegration extends GitLabIntegrationBase<HostedProviderId.GitLab> {
	readonly authProvider = authProvider;
	readonly id = HostedProviderId.GitLab;
	protected readonly key = this.id;
	readonly name: string = 'GitLab';
	get domain(): string {
		return metadata.domain;
	}

	protected get apiBaseUrl(): string {
		return 'https://gitlab.com/api';
	}
}

export class GitLabSelfHostedIntegration extends GitLabIntegrationBase<SelfHostedProviderId.GitHubEnterprise> {
	readonly authProvider = enterpriseAuthProvider;
	readonly id = SelfHostedProviderId.GitHubEnterprise;
	protected readonly key = `${this.id}:${this.domain}` as const;
	readonly name = 'GitLab Self-Hosted';
	get domain(): string {
		return this._domain;
	}
	protected override get apiBaseUrl(): string {
		return `https://${this._domain}/api`;
	}

	constructor(
		container: Container,
		override readonly api: ProvidersApi,
		private readonly _domain: string,
	) {
		super(container, api);
	}

	@log()
	override async connect(): Promise<boolean> {
		if (!(await ensurePaidPlan(`${this.name} instance`, this.container))) {
			return false;
		}

		return super.connect();
	}
}
