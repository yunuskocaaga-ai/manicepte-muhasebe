import { ImageResponse } from "next/og";

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const dimension = Math.min(Math.max(Number(size) || 192, 32), 512);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          borderRadius: dimension * 0.18,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: dimension * 0.5,
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          M
        </span>
      </div>
    ),
    { width: dimension, height: dimension },
  );
}
