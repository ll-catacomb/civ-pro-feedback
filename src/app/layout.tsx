import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CivPro Practice — Evidence-grounded feedback",
  description: "Course-specific formative feedback for Civil Procedure practice exams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
