import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Antibody — Agent Security Control Plane",
  description: "Turn successful agent exploits into verified least-privilege harness patches.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
