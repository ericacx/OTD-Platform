import { Component, Suspense } from "react";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";

import type { ErrorInfo, ReactNode } from "react";

interface AsyncBoundaryProps {
  children: ReactNode;
  errorFallback?: ReactNode;
  loadingFallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface AsyncBoundaryState {
  error: Error | null;
}

class InnerErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: Error, info: ErrorInfo) => void },
  AsyncBoundaryState
> {
  override state: AsyncBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AsyncBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  override render() {
    if (this.state.error) {
      return this.props.fallback ?? <ErrorState error={this.state.error} />;
    }
    return this.props.children;
  }
}

export function AsyncBoundary({ children, errorFallback, loadingFallback, onError }: AsyncBoundaryProps) {
  return (
    <InnerErrorBoundary
      {...(errorFallback !== undefined ? { fallback: errorFallback } : {})}
      {...(onError ? { onError } : {})}
    >
      <Suspense fallback={loadingFallback ?? <LoadingState />}>{children}</Suspense>
    </InnerErrorBoundary>
  );
}
