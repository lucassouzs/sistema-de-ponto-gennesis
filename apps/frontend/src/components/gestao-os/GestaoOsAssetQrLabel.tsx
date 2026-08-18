'use client';

import React from 'react';
import type { GestaoOsAssetQr } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';

type GestaoOsAssetQrLabelProps = {
  label: GestaoOsAssetQr;
  companyName?: string;
  logoSrc?: string;
};

export function GestaoOsAssetQrLabel({
  label,
  companyName = 'Gennesis Engenharia',
  logoSrc = '/logopv.png'
}: GestaoOsAssetQrLabelProps) {
  const location =
    [label.buildingName, label.sectorName, label.placeName]
      .filter((part) => part?.trim())
      .join('  ·  ') || label.locationLabel.replace(/ › /g, '  ·  ');
  const brand = companyName.replace(/ Engenharia.*$/i, '');

  return (
    <article className="mx-auto grid w-full max-w-[420px] grid-cols-[1fr_148px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="" className="h-7 w-auto object-contain" />
          ) : null}
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900">{brand}</span>
        </div>
        <div>
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-900">
            {label.name}
          </p>
          {location ? (
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{location}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-center p-3 pr-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={label.dataUrl}
          alt={`QR Code ${label.name}`}
          className="h-[132px] w-[132px] bg-white object-contain"
        />
      </div>
    </article>
  );
}
