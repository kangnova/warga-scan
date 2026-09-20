import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WargaScan — Scanner KTP & Kartu Keluarga",
  description: "Ekstraksi & validasi data KTP dan Kartu Keluarga dengan AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
