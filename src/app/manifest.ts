import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FiberOS - FTTH Rollout & Progress Management',
    short_name: 'FiberOS',
    description: 'Sistem Manajemen Progres Harian & Rollout FTTH GCI-MTI Blora',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0f172a',
    theme_color: '#1e40af',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

