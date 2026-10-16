import { Component, type ReactNode } from 'react';

type Props = { blockId: string; type: string; children: ReactNode };

/**
 * One block that throws must not take the Home down with it: it renders
 * nothing and says why in the log. Remounted (by key) when the layout changes,
 * so a fixed layout recovers without a restart.
 */
export class BlockBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[home] block "${this.props.blockId}" (${this.props.type}) failed to render and was skipped`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
