import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacScott Apps",
  description: "The MacScott brothers' app and game showcase.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
