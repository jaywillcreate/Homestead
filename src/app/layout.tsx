import type { Metadata } from "next";
import { Roboto_Flex, Roboto_Mono } from "next/font/google";
import "./globals.css";

const robotoFlex = Roboto_Flex({
  subsets: ["latin"],
  variable: "--font-roboto-flex",
  axes: ["opsz"],
});
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "Homestead — House Maintenance Manager",
  description:
    "Contractor directory, invoice parsing, job photos, reports, schedule and bids for your home.",
};

// Applies the persisted theme's CSS variables before first paint to avoid a flash.
const themeBootstrap = `try{var v=JSON.parse(localStorage.getItem("homestead-theme-vars")||"null");if(v){var r=document.documentElement;for(var k in v)r.style.setProperty(k,v[k]);}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${robotoFlex.variable} ${robotoMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
