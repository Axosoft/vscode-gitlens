/*global document window*/
import { CssVariables } from '@gitkraken/gitkraken-components/lib/components/graph/GraphContainer';
import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { GraphConfig } from 'src/config';
import {
	ColumnChangeCommandType,
	CommitListCallback,
	DidChangeCommitsNotificationType,
	DidChangeConfigNotificationType,
	DidChangeNotificationType,
	GraphColumnConfig,
	GraphRepository,
	MoreCommitsCommandType,
	SelectRepositoryCommandType,
	State,
} from '../../../../plus/webviews/graph/protocol';
import { debounce } from '../../../../system/function';
import { DidChangeConfigurationNotificationType , onIpc } from '../../../../webviews/protocol';
import { App } from '../../shared/appBase';
import { mix } from '../../shared/colors';
import { GraphWrapper } from './GraphWrapper';
import './graph.scss';

export class GraphApp extends App<State> {
	private callback?: CommitListCallback;
	private $menu?: HTMLElement;

	constructor() {
		super('GraphApp');
	}

	protected override onBind() {
		const disposables = super.onBind?.() ?? [];

		console.log('GraphApp onBind log', this.state.log);

		const $root = document.getElementById('root');
		if ($root != null) {
			render(
				<GraphWrapper
					subscriber={(callback: CommitListCallback) => this.registerEvents(callback)}
					onColumnChange={debounce(
						(name: string, settings: GraphColumnConfig) => this.onColumnChanged(name, settings),
						250,
					)}
					onSelectRepository={debounce((path: GraphRepository) => this.onRepositoryChanged(path), 250)}
					onMoreCommits={(...params) => this.onMoreCommits(...params)}
					{...this.state}
				/>,
				$root,
			);
			disposables.push({
				dispose: () => unmountComponentAtNode($root),
			});
		}

		return disposables;
	}

	protected override onMessageReceived(e: MessageEvent) {
		console.log('onMessageReceived', e);

		const msg = e.data;
		switch (msg.method) {
			case DidChangeNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeNotificationType, msg, params => {
					this.setState({ ...this.state, ...params.state });
					this.refresh(this.state);
				});
				break;

			case DidChangeCommitsNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeCommitsNotificationType, msg, params => {
					this.setState({
						...this.state,
						commits: params.commits,
						log: params.log,
					});
					this.refresh(this.state);
				});
				break;

			case DidChangeConfigNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeConfigNotificationType, msg, params => {
					this.setState({ ...this.state, config: params.config });
					this.refresh(this.state);
				});
				break;

			case DidChangeConfigurationNotificationType.method:
				this.log(`${this.appName}.onMessageReceived(${msg.id}): name=${msg.method}`);

				onIpc(DidChangeConfigurationNotificationType, msg, params => {
					this.setState({ ...this.state, mixedColumnColors: this.getGraphColors(params.config.graph) });
					this.refresh(this.state);
				});
				break;

			default:
				super.onMessageReceived?.(e);
		}
	}

	private getGraphColors(config: GraphConfig | undefined): CssVariables {
		// this will be called on theme updated as well as on config updated since it is dependent on the column colors from config changes and the background color from the theme
		const body = document.body;
    	const computedStyle = window.getComputedStyle(body);
		const bgColor = computedStyle.getPropertyValue('--color-background');
		const columnColors = ((config?.columnColors) != null) ? config.columnColors : ['#00bcd4', '#ff9800', '#9c27b0', '#2196f3', '#009688', '#ffeb3b', '#ff5722', '#795548'];
		const mixedGraphColors: CssVariables = {};
		for (let i = 0; i < columnColors.length; i++) {
			for (const mixInt of [15,25,45,50]) {
				mixedGraphColors[`--graph-color-${i}-bg${mixInt}`] = mix(bgColor, columnColors[i], mixInt);
			}
		}
		return mixedGraphColors;
	}

	protected override onThemeUpdated() {
		this.setState({ ...this.state, mixedColumnColors: this.getGraphColors(this.state.config) });
		this.refresh(this.state);
	}

	private onColumnChanged(name: string, settings: GraphColumnConfig) {
		this.sendCommand(ColumnChangeCommandType, {
			name: name,
			config: settings,
		});
	}

	private onRepositoryChanged(repo: GraphRepository) {
		this.sendCommand(SelectRepositoryCommandType, {
			path: repo.path,
		});
	}

	private onMoreCommits(limit?: number) {
		this.sendCommand(MoreCommitsCommandType, {
			limit: limit,
		});
	}

	private registerEvents(callback: CommitListCallback): () => void {
		this.callback = callback;

		return () => {
			this.callback = undefined;
		};
	}

	private refresh(state: State) {
		if (this.callback !== undefined) {
			this.callback(state);
		}
	}
}

new GraphApp();
