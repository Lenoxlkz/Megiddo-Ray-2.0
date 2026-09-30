import type { Metadata, Viewport } from 'next';
import './globals.css'; // Global styles
import { I18nProvider } from '@/components/I18nProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AlertsProvider } from '@/components/AlertsProvider';
import { AlertsPanel } from '@/components/AlertsPanel';

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Liquid Fast Download',
  description: 'Motor avanzado de rastreo, extracción y descarga para Manga, Video e Imágenes.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Liquid Fast',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Liquid Fast Download',
    description: 'Motor avanzado de rastreo, extracción y descarga para Manga, Video e Imágenes.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liquid Fast Download',
    description: 'Motor avanzado de rastreo, extracción y descarga para Manga, Video e Imágenes.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('liquid_theme') || 'dark';
                document.documentElement.setAttribute('data-theme', t);
                document.documentElement.classList.toggle('light', t === 'light');
                document.documentElement.classList.toggle('dark', t === 'dark');
              } catch (e) {}

              // Service Worker Registration for PWA installability
              if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                if (window.self !== window.top) {
                  // Inside preview iframe: unregister any SW to avoid chunk caching conflicts
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    for (var r of regs) { r.unregister(); }
                  }).catch(function() {});
                } else {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function(err) {
                      console.log('SW registration note:', err);
                    });
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <AlertsProvider>
              {children}
              <AlertsPanel />
            </AlertsProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

