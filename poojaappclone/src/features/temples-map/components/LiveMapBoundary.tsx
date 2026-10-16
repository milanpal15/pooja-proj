import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence for the live map: if the native view still fails to render (the module
 * probe passed but a view manager is missing or the style engine throws), report it so the screen
 * can fall back to the illustrated map instead of the route's error screen.
 */
export class LiveMapBoundary extends Component<
  { onError: (e: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
