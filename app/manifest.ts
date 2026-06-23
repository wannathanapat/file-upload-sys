import { MetadataRoute } from 'next';
import { getDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'ระบบส่งงาน AS INS';
  let shortName = 'AS-INS-Upload';
  let description = 'ระบบส่งเอกสารใบงานและวิดีโอ';
  let icon = '/coway-logo-new.png';

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'app_config', 'system_settings'));
    if (snap.exists()) {
      const data = snap.data();
      name = data.pwa_name || data.app_name || name;
      shortName = data.pwa_short || shortName;
      description = data.pwa_desc || description;
      icon = data.pwa_icon || data.app_logo || icon;
    }
  } catch (e) {
    console.warn("Could not read dynamic manifest settings", e);
  }

  return {
    name,
    short_name: shortName,
    description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f46e5',
    icons: [
      {
        src: icon,
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
