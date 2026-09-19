import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type Props = { children: ReactNode; resetKey: string; isZh: boolean };

class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { isZh } = this.props;
    return (
      <main className="empty-page container" role="alert">
        <p className="eyebrow">YC Auto USA</p>
        <h1>
          {isZh ? "页面暂时无法显示" : "This page could not be displayed"}
        </h1>
        <p>
          {isZh
            ? "请重试，或返回车辆列表继续浏览。"
            : "Please try again, or return to the inventory to keep browsing."}
        </p>
        <button
          className="button button--dark"
          type="button"
          onClick={() => window.location.reload()}
        >
          {isZh ? "重试" : "Try again"}
        </button>{" "}
        <a
          className="button button--outline"
          href={isZh ? "/zh/inventory" : "/inventory"}
        >
          {isZh ? "浏览车辆" : "Browse inventory"}
        </a>
      </main>
    );
  }
}

export function ApplicationErrorBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  return (
    <ErrorBoundary
      resetKey={location.key}
      isZh={location.pathname === "/zh" || location.pathname.startsWith("/zh/")}
    >
      {children}
    </ErrorBoundary>
  );
}
