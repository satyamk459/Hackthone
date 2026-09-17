import type { Metadata } from "next";
import "./globals.css";
import { FloatingChat } from "@/components/FloatingChat";

export const metadata: Metadata = {
  title: "ClaimWise | Insurance, made legible",
  description: "Understand your insurance. Make smarter claims.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}<FloatingChat /></body>
    </html>
  );
}
