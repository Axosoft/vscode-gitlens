import { ContextProvider } from '@lit/context';
import type { ReactiveControllerHost } from 'lit';
import type { State } from '../../home/protocol';
import { DidChangeSubscription } from '../../home/protocol';
import type { Disposable } from '../shared/events';
import type { HostIpc } from '../shared/ipc';
import { stateContext } from './context';

type ReactiveElementHost = Partial<ReactiveControllerHost> & HTMLElement;

export class HomeStateProvider implements Disposable {
	private readonly disposable: Disposable;
	private readonly provider: ContextProvider<{ __context__: State }, ReactiveElementHost>;
	private readonly state: State;

	constructor(
		host: ReactiveElementHost,
		state: State,
		private readonly _ipc: HostIpc,
	) {
		this.state = state;
		this.provider = new ContextProvider(host, { context: stateContext, initialValue: state });

		this.disposable = this._ipc.onReceiveMessage(msg => {
			switch (true) {
				case DidChangeSubscription.is(msg):
					this.state.subscription = msg.params.subscription;
					this.state.avatar = msg.params.avatar;
					this.state.organizationsCount = msg.params.organizationsCount;
					this.state.timestamp = Date.now();

					this.provider.setValue(this.state, true);
					break;
			}
		});
	}

	dispose() {
		this.disposable.dispose();
	}
}
