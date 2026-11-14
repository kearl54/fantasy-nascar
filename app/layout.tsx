import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import Image from 'next/image'
import Link from 'next/link'

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Next.js and Supabase Starter Kit",
  description: "The fastest way to build apps with Next.js and Supabase",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <header className="w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center">
              <Link href="/" className="inline-flex items-center">
                <Image
                  src="/racerpicks-logo.png"
                  alt="RacerPicks"
                  width={220}
                  height={60}
                  className="h-10 w-auto sm:h-12"
                  priority
                />
              </Link>
            </div>
          </header>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
