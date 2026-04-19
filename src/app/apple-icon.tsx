import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          borderRadius: 40,
        }}
      >
        {/* Upward trend line — the core mark */}
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
          {/* Chart grid lines (subtle) */}
          <line x1="10" y1="75" x2="90" y2="75" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <line x1="10" y1="25" x2="90" y2="25" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

          {/* Growth area fill */}
          <path
            d="M15 78 L35 55 L55 62 L85 18 L85 78 Z"
            fill="rgba(255,255,255,0.12)"
          />

          {/* Main trend line */}
          <path
            d="M15 78 L35 55 L55 62 L85 18"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Arrow head */}
          <path
            d="M73 18 L85 18 L85 30"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* App name */}
        <div
          style={{
            display: "flex",
            marginTop: 2,
            fontSize: 18,
            fontWeight: 700,
            color: "white",
            letterSpacing: -0.5,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          RetireWise
        </div>
      </div>
    ),
    { ...size }
  );
}
