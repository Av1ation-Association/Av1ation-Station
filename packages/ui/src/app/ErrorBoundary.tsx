import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../shared/Button";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * Keeps a render failure inside one screen from blanking the window. The shell and the
 * router stay mounted, so the user can reload without losing the rest of the session.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // React already reports the error; the component stack is the useful local addition.
        console.error("Unhandled render failure", error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (error === null) {
            return this.props.children;
        }

        return (
            <main id="main" className="mx-auto w-full max-w-[720px] px-6 py-16">
                <div className="rounded-lg border border-danger/30 bg-surface p-6" role="alert">
                    <h1 className="m-0 text-xl font-semibold tracking-tight text-ink">
                        This screen stopped rendering
                    </h1>
                    <p className="mt-2 mb-0 text-[13px] leading-relaxed text-ink-secondary">
                        The rest of the application is still running. Reload to return to Projects;
                        a diagnostic record was written to the service log.
                    </p>
                    <details className="mt-4 text-[12px] text-ink-muted">
                        <summary className="cursor-pointer select-none hover:text-ink-secondary">
                            Technical details
                        </summary>
                        <p className="mt-2 mb-0 break-words font-mono leading-relaxed">
                            {error.message}
                        </p>
                    </details>
                    <div className="mt-5">
                        <Button onClick={() => window.location.reload()}>Reload the window</Button>
                    </div>
                </div>
            </main>
        );
    }
}
