import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Liquid Fast Download',
    short_name: 'LiquidFast',
    description: 'Motor avanzado de rastreo, extracción y descarga para Manga (PDF, ZIP, CBZ), Video (MP4, MP3) e Imágenes.',
    start_url: '/',
    id: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#10b981',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      }
    ],
    categories: ['utilities', 'productivity', 'multimedia'],
    // Web Share Target API standard for Android share sheet reception
    share_target: {
      action: '/',
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },
  };
}
