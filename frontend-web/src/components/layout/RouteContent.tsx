import { Component, Suspense, type ReactNode, type RefObject } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useRoutePageReveal } from "../../animations/useRoutePageReveal";
import { PageHeader } from "./PageHeader";

type RouteContentProps = {
  rootRef: RefObject<HTMLElement | null>;
};

class PageLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        role="alert"
        className="workspace-panel space-y-3 p-6 text-sm text-slate-400"
      >
        <PageHeader title="Page unavailable" />
        <p>Could not open this page. Reload to try again.</p>
        <button
          type="button"
          className="workspace-button"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }
}

function RevealedOutlet({ rootRef }: RouteContentProps) {
  const { pathname } = useLocation();
  // An effect in this subtree waits for the lazy page to commit, so entrance
  // animations still find its panels rather than animating the loading fallback.
  useRoutePageReveal(rootRef, pathname);
  return <Outlet />;
}

/** Leave navigation available while a workspace downloads or fails to load. */
export function RouteContent({ rootRef }: RouteContentProps) {
  return (
    <PageLoadBoundary>
      <Suspense
        fallback={
          <div
            role="status"
            className="workspace-panel p-6 text-sm text-slate-400"
          >
            <PageHeader title="Loading page" />
            Loading…
          </div>
        }
      >
        <RevealedOutlet rootRef={rootRef} />
      </Suspense>
    </PageLoadBoundary>
  );
}
