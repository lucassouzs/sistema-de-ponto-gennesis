'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import * as L from 'leaflet';
import { STATUS_LABELS, type GestaoOsStatus } from '../gestaoOsTypes';
import type { GestaoOsReportsGeo } from '../gestaoOsTypes';

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((m) => m.Popup),
  { ssr: false }
);

type Building = GestaoOsReportsGeo['buildings'][number];

export function GestaoOsReportsGeoMap({
  buildings,
  showAssets = true,
  showWorkOrders = true
}: {
  buildings: Building[];
  showAssets?: boolean;
  showWorkOrders?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(buildings[0]?.id ?? null);

  const points = useMemo(() => {
    return buildings
      .filter((b) => b.latitude != null && b.longitude != null && Number.isFinite(b.latitude) && Number.isFinite(b.longitude))
      .map((b) => ({
        ...b,
        lat: Number(b.latitude),
        lng: Number(b.longitude)
      }));
  }, [buildings]);

  const center = useMemo(() => {
    if (!points.length) return { lat: -23.55, lng: -46.63 };
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return { lat, lng };
  }, [points]);

  const selected = selectedId ? buildings.find((b) => b.id === selectedId) || null : null;

  if (!points.length) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
        Nenhum prédio com <b>lat/lng</b> válido encontrado (no recorte atual).
      </div>
    );
  }

  const zoom = points.length === 1 ? 16 : 11;

  const buildingIcon = (count: number, isSelected: boolean) => {
    const size = isSelected ? 36 : 32;
    const bg = isSelected ? '#DC2626' : '#EF4444';
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
    const displayCount = safeCount > 99 ? '99+' : String(safeCount);

    // Pin “teardrop” em SVG (mais elegante e consistente em zoom).
    const html = `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="${bg}"
          stroke="#ffffff"
          stroke-width="2"
        />
        <circle cx="12" cy="9" r="4.25" fill="#ffffff" />
        <text
          x="12"
          y="9"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="7"
          font-weight="800"
          fill="${bg}"
        >${displayCount}</text>
      </svg>
    `;
    return L.divIcon({
      className: '',
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size]
    });
  };

  return (
    <div className="relative h-[440px] overflow-visible rounded-lg border border-gray-200 dark:border-gray-700">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
        keyboard={true}
        doubleClickZoom={true}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

          {points.map((b) => {
            const workOrdersCount = b.workOrdersCount ?? 0;
            const assetsCount = b.assetsCount ?? 0;
            const isSelected = b.id === selectedId;
            const badgeCount = showWorkOrders ? workOrdersCount : showAssets ? assetsCount : workOrdersCount;

            return (
              <Marker
                key={b.id}
                position={[b.lat, b.lng]}
                icon={buildingIcon(badgeCount, isSelected)}
                eventHandlers={{
                  click: () => setSelectedId(b.id)
                }}
              >
                <Popup maxWidth={420}>
                  <div className="text-xs" style={{ maxWidth: 420 }}>
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{b.name}</div>
                    <div className="text-[11px] text-gray-700 dark:text-gray-200 mt-0.5">
                      {b.address || 'Sem endereço'}
                    </div>

                    <div className="mt-2">
                      <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                        Chamados: {workOrdersCount}
                      </div>
                      {b.workOrders?.length ? (
                        <div className="mt-1 space-y-1">
                          {b.workOrders.slice(0, 4).map((wo) => (
                            <div key={wo.id} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                                  {wo.osNumber != null ? `OS #${wo.osNumber}` : `Chamado #${wo.displayNumber}`}
                                </div>
                                <div className="text-[10px] text-gray-700 dark:text-gray-200 truncate">
                                  {(STATUS_LABELS as Record<string, string>)[wo.status] ?? wo.status} · {wo.category}
                                </div>
                              </div>
                              {wo.overdue ? (
                                <span className="shrink-0 text-[10px] rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-200">
                                  Atrasada
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-gray-700 dark:text-gray-200">Nenhum chamado no recorte.</div>
                      )}
                      {b.workOrders.length > 4 ? (
                        <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-300">
                          +{b.workOrders.length - 4} outros
                        </div>
                      ) : null}
                    </div>

                    {b.assets?.length ? (
                      <div className="mt-2">
                        <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                          Ativos: {assetsCount}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {b.assets.slice(0, 4).map((a) => (
                            <span
                              key={a.id}
                              className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-200"
                            >
                              {a.name}
                            </span>
                          ))}
                        </div>
                        {b.assets.length > 4 ? (
                          <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-300">
                            +{b.assets.length - 4} outros
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Intencionalmente: para manter o mapa “limpo”, não desenhamos markers de OS/Ativos.
              O detalhe fica no modal superior direito e no popup do prédio. */}
        </MapContainer>

        {/* Modal overlay (topo direito) — dentro do mapa */}
        <div className="absolute top-3 right-3 z-[1000] w-[360px] max-w-[calc(100%-16px)] rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-lg">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {selected ? selected.name : '—'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {selected?.address || 'Sem endereço'}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                {selected?.workOrdersCount ?? 0} chamados
              </span>
            </div>

            {selected ? (
              <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                Predios/OS por status: {Object.entries(selected.byStatus).length || 0}
              </div>
            ) : null}
          </div>

          <div className="p-4 space-y-4 overflow-auto" style={{ maxHeight: 400 }}>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Chamados (topo)</h4>
              {selected?.workOrders?.length ? (
                <ul className="mt-2 space-y-2">
                  {selected.workOrders.slice(0, 8).map((wo) => (
                    <li key={wo.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {wo.osNumber != null ? `OS #${wo.osNumber}` : `Chamado #${wo.displayNumber}`}
                        </div>
                        <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
                          {wo.category} · {wo.status} · {wo.dueAt ? `SLA ${wo.dueAt.slice(0, 10)}` : '—'}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[11px] rounded-full px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                      >
                        {wo.overdue ? 'Atrasada' : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Nenhum chamado no recorte.</p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ativos (topo)</h4>
              {selected?.assets?.length ? (
                <ul className="mt-2 space-y-2">
                  {selected.assets.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{a.name}</div>
                        <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
                          {a.category || '—'}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">{a.code || ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Nenhum ativo no prédio.</p>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

