export function LoadingState() {
  return (
    <div className="studio-root" data-theme="dark">
      <div className="studio-loading">
        <span className="studio-spinner" />
        正在加载 Studio…
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="studio-root" data-theme="dark">
      <div className="studio-loading" style={{ flexDirection: "column", padding: 30 }}>
        <div className="studio-alert" style={{ maxWidth: 560 }}>
          {message}
        </div>
        <button
          className="studio-btn"
          data-variant="primary"
          type="button"
          onClick={onRetry}
          style={{ marginTop: 12 }}
        >
          重试
        </button>
      </div>
    </div>
  );
}

export function MissingHost({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const transport = (
    window as Window & {
      __DSH_TRANSPORT__?: { streamBaseUrl?: string };
    }
  ).__DSH_TRANSPORT__;

  return (
    <div className="studio-root" data-theme="dark">
      <div
        className="studio-loading"
        style={{ flexDirection: "column", textAlign: "center", padding: 30 }}
      >
        <div className="studio-alert" data-tone="warn" style={{ maxWidth: 680 }}>
          Studio Host 没有返回启动参数。插件可能刚启用，或当前页面的 DSH
          会话还没有完成认证。
        </div>
        {error !== null ? (
          <div
            className="studio-mono"
            style={{
              marginTop: 10,
              maxWidth: 720,
              color: "var(--st-muted)",
              overflowWrap: "anywhere",
            }}
          >
            {error}
          </div>
        ) : null}
        <div className="studio-faint" style={{ marginTop: 12, maxWidth: 620 }}>
          检查顺序：Plugins → Studio 是否启用；刷新页面；如果仍失败，重启 DSH
          后再试。桌面端和 Web 端都通过同一个 Host 路由获取启动参数。
        </div>
        <button
          className="studio-btn"
          data-variant="primary"
          type="button"
          style={{ marginTop: 14 }}
          onClick={onRetry}
        >
          刷新重试
        </button>
        <details
          className="studio-faint"
          style={{ marginTop: 18, maxWidth: 680, textAlign: "left", fontSize: 10 }}
        >
          <summary style={{ cursor: "pointer" }}>诊断信息</summary>
          <pre
            className="studio-mono"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8 }}
          >
            {JSON.stringify(
              {
                error,
                href: window.location.href,
                origin: window.location.origin,
                transportBase: transport?.streamBaseUrl ?? null,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </div>
  );
}
