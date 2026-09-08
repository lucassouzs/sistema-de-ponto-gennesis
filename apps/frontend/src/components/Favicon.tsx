'use client';

import { useEffect } from 'react';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

function applyFavicon(href: string) {
  document.querySelectorAll("link[rel*='icon'], link[rel='apple-touch-icon']").forEach((link) => {
    link.remove();
  });

  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/png';
  icon.href = href;
  document.head.appendChild(icon);

  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.type = 'image/png';
  shortcut.href = href;
  document.head.appendChild(shortcut);

  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = href;
  document.head.appendChild(apple);
}

export function Favicon() {
  const { logoSrc } = useBrandingLogo();

  useEffect(() => {
    applyFavicon(logoSrc);
  }, [logoSrc]);

  return null;
}
