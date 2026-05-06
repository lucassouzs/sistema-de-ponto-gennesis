'use client';

import { useEffect } from 'react';

export function Favicon() {
  useEffect(() => {
    // Remover favicons existentes
    const existingLinks = document.querySelectorAll("link[rel*='icon']");
    existingLinks.forEach(link => link.remove());

    // Adicionar novo favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = '/logoredonda.png';
    document.head.appendChild(link);

    // Adicionar shortcut icon
    const shortcutLink = document.createElement('link');
    shortcutLink.rel = 'shortcut icon';
    shortcutLink.type = 'image/png';
    shortcutLink.href = '/logoredonda.png';
    document.head.appendChild(shortcutLink);

    // Adicionar apple-touch-icon
    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = '/logoredonda.png';
    document.head.appendChild(appleLink);
  }, []);

  return null;
}

