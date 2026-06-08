import { Component, type ReactNode } from "react";

// Catches render-time throws so a single bad component shows an error instead of
// blanking the whole app. Also logs the error+stack to the console for debugging.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[render] component threw:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <div className="max-w-2xl rounded-lg border border-zmkay-bad/40 bg-zmkay-bad/10 p-4">
            <div className="text-sm font-medium text-zmkay-bad mb-2">Render error</div>
            <pre className="text-xs font-mono text-zmkay-text whitespace-pre-wrap">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1.5 rounded-md text-xs bg-zmkay-panel2 border border-zmkay-edge text-zmkay-text hover:bg-zmkay-keyhi"
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
