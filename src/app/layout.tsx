import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { MobileNav, Sidebar } from "@/components/shell/Sidebar";
import { PageFooter } from "@/components/shell/PageFooter";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

const SITE = "Pix, visualized";
const DESCRIPTION =
  "Interactive, low-level explorations of Pix, Brazil's instant payment system: BR Code QR codes and CRC16, DICT keys and claims, SPI ISO 20022 messages (pacs.008, pacs.002, pacs.004, camt.053), ICOM, XMLDSig, RSFN certificates, the API Pix, Pix Automático and MED.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: { default: SITE, template: `%s · ${SITE}` },
  description: DESCRIPTION,
  openGraph: { title: SITE, description: DESCRIPTION, type: "website", siteName: SITE },
  twitter: { card: "summary_large_image", title: SITE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <MobileNav />
            <main className="mx-auto max-w-7xl px-4 pt-10 pb-24 sm:px-8">
              {children}
              <PageFooter />
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
