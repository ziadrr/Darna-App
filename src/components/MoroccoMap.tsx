import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Maximize2, Bed, Bath, ArrowUpRight, X, Compass, Layers } from 'lucide-react';
import { Listing } from '../types';
import { formatMAD } from '../utils/rentalLogic';
import { MOROCCAN_CITIES } from '../data/moroccoLocations';

interface MoroccoMapProps {
  listings: Listing[];
  selectedListing?: Listing | null;
  onSelectListing: (listing: Listing) => void;
  center?: [number, number];
  zoom?: number;
}

export const MoroccoMap: React.FC<MoroccoMapProps> = ({
  listings,
  selectedListing,
  onSelectListing,
  center = [32.2, -6.8],
  zoom = 6,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);
  const [activeCityId, setActiveCityId] = useState<string>('all');
  const [mapStyle, setMapStyle] = useState<'street' | 'topo'>('street');
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const centerLat = center[0];
  const centerLng = center[1];

  const getTileConfig = (style: 'street' | 'topo') => {
    if (style === 'topo') {
      return {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, and the GIS User Community',
      };
    }
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
    };
  };

  // Initialize Leaflet map once and handle resize/cleanup properly
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(container, {
      center: [centerLat, centerLng],
      zoom,
      zoomControl: false,
      scrollWheelZoom: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const tileCfg = getTileConfig(mapStyle);
    const tileLayer = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: 19,
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Ensure tiles render properly after layout/animations
    const timer1 = setTimeout(() => map.invalidateSize(), 100);
    const timer2 = setTimeout(() => map.invalidateSize(), 400);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Switch tile style if user toggles between Street and Topo
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const tileCfg = getTileConfig(mapStyle);
    tileLayerRef.current = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [mapStyle]);

  // Fly to external center coordinates when city filter changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView([centerLat, centerLng], zoom, { animate: true });
  }, [centerLat, centerLng, zoom]);

  // Render markers and auto-fit bounds when listings update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    const validListings = listings.filter(
      (l) => typeof l.latitude === 'number' && typeof l.longitude === 'number' && !isNaN(l.latitude) && !isNaN(l.longitude)
    );

    const bounds: [number, number][] = [];

    validListings.forEach((listing) => {
      const isSelected =
        selectedListing?.id === listing.id || previewListing?.id === listing.id;

      bounds.push([listing.latitude, listing.longitude]);

      const customIcon = L.divIcon({
        className: 'leaflet-div-icon',
        html: `
          <div style="
            background-color: ${isSelected ? '#1E3D34' : '#C15C3D'};
            color: white;
            font-weight: 800;
            font-size: 12px;
            padding: 5px 10px;
            border-radius: 9999px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.28);
            border: 2.5px solid white;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
            transition: transform 0.2s ease, background-color 0.2s ease;
          ">
            <span>${listing.price.toLocaleString('fr-FR')} DH</span>
          </div>
        `,
        iconSize: [90, 32],
        iconAnchor: [45, 16],
      });

      const marker = L.marker([listing.latitude, listing.longitude], {
        icon: customIcon,
      });

      marker.on('click', () => {
        setPreviewListing(listing);
        map.flyTo([listing.latitude, listing.longitude], Math.max(map.getZoom(), 13), {
          duration: 0.6,
        });
      });

      markersGroup.addLayer(marker);
    });

    // Fit bounds if multiple listings and no specific city jump is active
    if (bounds.length > 0 && activeCityId === 'all' && centerLat === 32.2) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      } catch {
        // ignore bounds error
      }
    }
  }, [listings, selectedListing, previewListing]);

  const handleJumpToCity = (cityId: string) => {
    setActiveCityId(cityId);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (cityId === 'all') {
      const validCoords = listings
        .filter((l) => l.latitude && l.longitude)
        .map((l) => [l.latitude, l.longitude] as [number, number]);
      if (validCoords.length > 0) {
        map.fitBounds(validCoords, { padding: [50, 50], maxZoom: 12 });
      } else {
        map.flyTo([32.2, -6.8], 6, { duration: 0.8 });
      }
      return;
    }

    const foundCity = MOROCCAN_CITIES.find((c) => c.id === cityId);
    if (foundCity) {
      map.flyTo([foundCity.lat, foundCity.lng], 13, { duration: 0.8 });
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-md overflow-hidden flex flex-col">
      {/* Top Map Toolbar: Quick City Navigation & Style Switcher */}
      <div className="px-4 py-3 bg-[#FAF7F2] border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-stone-600 flex items-center gap-1 mr-1 shrink-0">
            <Compass className="w-4 h-4 text-[#C15C3D]" />
            <span>Accès rapide :</span>
          </span>
          <button
            type="button"
            onClick={() => handleJumpToCity('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCityId === 'all'
                ? 'bg-[#1E3D34] text-white shadow-xs'
                : 'bg-white text-stone-700 border border-stone-200 hover:border-[#C15C3D]'
            }`}
          >
            Tout le Maroc ({listings.length})
          </button>
          {MOROCCAN_CITIES.slice(0, 6).map((city) => {
            const count = listings.filter(
              (l) => l.city.toLowerCase() === city.name.toLowerCase()
            ).length;
            return (
              <button
                key={city.id}
                type="button"
                onClick={() => handleJumpToCity(city.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                  activeCityId === city.id
                    ? 'bg-[#C15C3D] text-white shadow-xs'
                    : 'bg-white text-stone-700 border border-stone-200 hover:border-[#C15C3D]'
                }`}
              >
                {city.name} {count > 0 && <span className="opacity-75">({count})</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setMapStyle((prev) => (prev === 'street' ? 'topo' : 'street'))}
          className="px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 flex items-center gap-1.5 shrink-0"
          title="Changer le style de fond de carte"
        >
          <Layers className="w-3.5 h-3.5 text-[#1E3D34]" />
          <span>Fond : {mapStyle === 'street' ? 'Plan Routier' : 'Topographique'}</span>
        </button>
      </div>

      {/* Main Split Body: Map Canvas + Side/Bottom Interactive Property List */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Interactive Map Container with explicit height so Leaflet never collapses */}
        <div className="lg:col-span-2 relative w-full h-[460px] sm:h-[560px] bg-stone-100">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Preview Card when a marker is clicked */}
          {previewListing && (
            <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:w-96 z-[500] bg-white rounded-2xl shadow-2xl border border-stone-200 p-3.5 animate-fade-in">
              <button
                type="button"
                onClick={() => setPreviewListing(null)}
                className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600"
                title="Fermer l'aperçu"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex gap-3">
                <img
                  src={
                    previewListing.images[0] ||
                    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80'
                  }
                  alt={previewListing.title}
                  className="w-24 h-24 rounded-xl object-cover shrink-0 border border-stone-200"
                />
                <div className="flex-1 min-w-0 pr-5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#1E3D34]/10 text-[#1E3D34]">
                    {previewListing.category}
                  </span>
                  <h4 className="font-bold text-stone-900 text-sm truncate mt-1">
                    {previewListing.title}
                  </h4>
                  <p className="text-xs text-stone-500 truncate">
                    📍 {previewListing.district}, {previewListing.city}
                  </p>
                  <p className="font-extrabold text-[#C15C3D] text-sm mt-1">
                    {formatMAD(previewListing.price, previewListing.period)}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs text-stone-600">
                  <span>📐 {previewListing.surface} m²</span>
                  {previewListing.bedrooms && <span>🛏️ {previewListing.bedrooms} ch</span>}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectListing(previewListing)}
                  className="px-3.5 py-1.5 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <span>Voir la fiche</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Legend Overlay */}
          <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-stone-200 text-[11px] flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-semibold text-stone-700">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C15C3D]"></span>
              <span>Annonce ({listings.length})</span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-stone-700">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1E3D34]"></span>
              <span>Sélectionnée</span>
            </div>
          </div>
        </div>

        {/* Right Side Panel: Interactive List synced with the Map */}
        <div className="border-t lg:border-t-0 lg:border-l border-stone-200 flex flex-col h-[360px] lg:h-[560px] bg-stone-50/50">
          <div className="p-3.5 bg-white border-b border-stone-200 flex items-center justify-between">
            <h4 className="font-bold text-xs uppercase tracking-wider text-stone-700">
              Biens géolocalisés ({listings.length})
            </h4>
            <span className="text-[11px] text-stone-500">Cliquez pour centrer</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {listings.length === 0 ? (
              <div className="text-center py-12 text-xs text-stone-500">
                Aucune annonce à afficher sur cette zone.
              </div>
            ) : (
              listings.map((item) => {
                const isSelected = previewListing?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setPreviewListing(item);
                      if (mapInstanceRef.current && item.latitude && item.longitude) {
                        mapInstanceRef.current.flyTo([item.latitude, item.longitude], 14, {
                          duration: 0.6,
                        });
                      }
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex gap-3 items-center ${
                      isSelected
                        ? 'bg-[#FAF7F2] border-[#C15C3D] shadow-sm ring-1 ring-[#C15C3D]/30'
                        : 'bg-white border-stone-200/90 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={
                        item.images[0] ||
                        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=300&q=80'
                      }
                      alt={item.title}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200"
                    />
                    <div className="flex-1 min-w-0">
                      <h5 className="font-bold text-xs text-stone-900 truncate">
                        {item.title}
                      </h5>
                      <p className="text-[11px] text-stone-500 truncate">
                        📍 {item.district}, {item.city}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-extrabold text-xs text-[#C15C3D]">
                          {formatMAD(item.price, item.period)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectListing(item);
                          }}
                          className="text-[11px] font-bold text-[#1E3D34] hover:underline flex items-center gap-0.5"
                        >
                          <span>Détails</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface SingleLocationMapProps {
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  interactivePicker?: boolean;
  onChangeCoordinates?: (lat: number, lng: number) => void;
}

export const SingleLocationMap: React.FC<SingleLocationMapProps> = ({
  latitude,
  longitude,
  title,
  subtitle,
  interactivePicker = false,
  onChangeCoordinates,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(container, {
      center: [latitude, longitude],
      zoom: 14,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ',
      maxZoom: 19,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'leaflet-div-icon',
      html: `
        <div style="
          background-color: #C15C3D;
          color: white;
          font-weight: 700;
          font-size: 11px;
          padding: 6px 12px;
          border-radius: 9999px;
          box-shadow: 0 6px 16px rgba(0,0,0,0.3);
          border: 2.5px solid white;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        ">
          <span>📍</span>
          <span>${title.slice(0, 26)}</span>
        </div>
      `,
      iconSize: [140, 32],
      iconAnchor: [70, 16],
    });

    const marker = L.marker([latitude, longitude], {
      icon: pinIcon,
      draggable: interactivePicker,
    }).addTo(map);

    if (interactivePicker && onChangeCoordinates) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChangeCoordinates(Number(pos.lat.toFixed(5)), Number(pos.lng.toFixed(5)));
      });
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChangeCoordinates(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
      });
    }

    mapRef.current = map;
    markerRef.current = marker;

    const timer = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [latitude, longitude, title, interactivePicker]);

  return (
    <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-xs bg-stone-100">
      <div ref={containerRef} className="w-full h-56 sm:h-64" />
      <div className="px-4 py-2.5 bg-[#FAF7F2] border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
        <div className="flex items-center gap-1.5 truncate">
          <MapPin className="w-3.5 h-3.5 text-[#C15C3D] shrink-0" />
          <span className="truncate font-medium">{subtitle || title}</span>
        </div>
        {interactivePicker && (
          <span className="text-[11px] text-[#C15C3D] font-bold shrink-0">
            Cliquez sur la carte pour déplacer le repère
          </span>
        )}
      </div>
    </div>
  );
};
