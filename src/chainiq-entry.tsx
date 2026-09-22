import { useEffect, useState, type ComponentType } from "react";
import "./chainiq/index.css";
import "./chainiq/user/App.css";
import "./chainiq/user/theme/user-theme.css";

export function ChainIQApp() {
  const [App, setApp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("./chainiq/App.jsx"),
      import("./chainiq/user/theme/applyPlatformTheme"),
      import("./chainiq/api"),
    ]).then(([mod, theme, api]) => {
      theme.applyPlatformTheme();
      api.purgeLegacyClientStorage();
      if (!cancelled) setApp(() => mod.default as ComponentType);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!App) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#2A2E36",
          color: "#EAECEF",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          Chain<span style={{ color: "#F0B90B" }}> / </span>IQ
        </div>
        <div style={{ color: "#A8AEB8" }}>Backoffice Administration</div>
      </div>
    );
  }

  return <App />;
}
