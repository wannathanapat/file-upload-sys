import type { Metadata, Viewport } from "next";
import { getDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Kanit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const kanit = Kanit({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["thai", "latin"],
  variable: "--font-kanit",
});

export async function generateMetadata(): Promise<Metadata> {
  let title = "ระบบส่งงาน AS INS";
  let description = "ระบบอัปโหลดเอกสารใบส่งงานและวิดีโอเข้า Google Drive และส่งแจ้งเตือน Telegram อัตโนมัติ";
  let icon = "/coway-logo-new.png";

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'app_config', 'system_settings'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.app_name) title = data.app_name;
      if (data.app_subtitle) description = data.app_subtitle;
      if (data.app_favicon) icon = data.app_favicon;
      else if (data.app_logo) icon = data.app_logo;
    }
  } catch (e) {
    console.warn("Could not read dynamic metadata settings", e);
  }

  return {
    title,
    description,
    icons: {
      icon: icon,
      apple: icon,
    }
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
      className={`${kanit.variable} h-full antialiased`}
    >
      <body className={`${kanit.className} min-h-full flex flex-col bg-slate-50 text-slate-900 select-none`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

