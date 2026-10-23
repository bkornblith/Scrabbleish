import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrabble with Friends",
  description: "Multiplayer Scrabble for 2–5 players with official rules and challenges.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0b1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap"
        />
        {/* Apply a saved light/dark choice before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem("scrabble-theme");if(m==="light"||m==="dark")document.documentElement.dataset.theme=m}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
