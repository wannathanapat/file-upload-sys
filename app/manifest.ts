import { MetadataRoute } from 'next';
import { getDb } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'Coway Chiangrai';
  let shortName = 'Coway CR';
  let description = 'ระบบส่งเอกสารใบงานและวิดีโอ Coway Chiangrai';
  let themeColor = '#29ABE2';

  try {
    const db = getDb();
    const snap = await getDoc(doc(db, 'app_config', 'system_settings'));
    if (snap.exists()) {
      const data = snap.data();
      name      = data.pwa_name  || data.app_name  || name;
      shortName = data.pwa_short || shortName;
      description = data.pwa_desc || description;
      themeColor  = data.pwa_theme || themeColor;
    }
  } catch (e) {
    console.warn('Could not read dynamic manifest settings', e);
  }

  return {
    name,
    short_name: shortName,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#29ABE2',
    theme_color: themeColor,
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon-72x72.png',
        sizes: '72x72',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-128x128.png',
        sizes: '128x128',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
