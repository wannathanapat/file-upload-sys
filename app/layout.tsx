import type { Metadata, Viewport } from "next";
import { getDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import PWAInstallPrompt from "./PWAInstallPrompt";


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#29ABE2',
};

const notoSansThai = Noto_Sans_Thai({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["thai", "latin"],
  variable: "--font-noto-thai",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  let title       = "Coway Chiangrai";
  let description = "ระบบส่งเอกสารใบงานและวิดีโอ Coway Chiangrai";
  let icon        = "/coway-logo-new.png";

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'app_config', 'system_settings'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.app_name)    title       = data.app_name;
      if (data.app_subtitle) description = data.app_subtitle;
      if (data.app_favicon)  icon        = data.app_favicon;
      else if (data.app_logo) icon       = data.app_logo;
    }
  } catch (e) {
    console.warn("Could not read dynamic metadata settings", e);
  }

  return {
    title,
    description,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title,
      startupImage: '/icon-512x512.png',
    },
    icons: {
      icon: [
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icon-192x192.png',  sizes: '192x192', type: 'image/png' },
        { url: icon },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      other: [
        { rel: 'mask-icon', url: '/icon-192x192.png', color: '#29ABE2' },
      ],
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'msapplication-TileColor': '#29ABE2',
      'msapplication-TileImage': '/icon-144x144.png',
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} h-full antialiased`}
    >
      <body className={`${notoSansThai.className} min-h-full flex flex-col bg-slate-50 text-slate-900`}>
        <Providers>
          <PWAInstallPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
