import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Simba AI — Your AI marketing team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #0F6F68 0%, #00A99D 55%, #CCEEE6 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "#00A99D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            ✦
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 48, fontWeight: 700 }}>Simba AI</div>
            <div style={{ fontSize: 22, opacity: 0.85 }}>AI Marketing Team</div>
          </div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 600, maxWidth: 800, lineHeight: 1.2 }}>
          Your AI marketing team, always on.
        </div>
      </div>
    ),
    { ...size },
  );
}
