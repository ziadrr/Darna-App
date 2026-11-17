import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet-gesture-handling';
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import {
  MapPin,
  ArrowUpRight,
  X,
  Compass,
  Layers,
  AlertTriangle,
  Hand,
} from 'lucide-react';
import { Listing } from '../types';
import {
  formatMAD,
  handleListingImageError,
  FALLBACK_LISTING_IMAGE_URL,
  CARTO_VOYAGER_TILE_URL,
  CARTO_VOYAGER_ATTRIBUTION,
  OSM_FALLBACK_TILE_URL,
  OSM_FALLBACK_ATTRIBUTION,
  TOPO_TILE_URL,
  TOPO_ATTRIBUTION,
  MOROCCO_MIN_ZOOM,
  MOROCCO_MAX_BOUNDS,
  formatMapMarkerPriceMAD,
  getMapMarkerColors,
  getListingTransactionType,
} from '../utils/rentalLogic';
import { MOROCCAN_CITIES } from '../data/moroccoLocations';

// Configure default Leaflet marker icons from local package assets instead of unpkg CDN
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

interface MoroccoMapProps {
  listings: Listing[];
  selectedListing?: Listing | null;
  onSelectListing: (listing: Listing) => void;
  center?: [number, number];
  zoom?: number;
}

/**
 * Attaches a primary tile layer (CARTO Voyager or Relief) with automatic fallback
 * to OpenStreetMap on `tileerror`, and notifies `onUnavailableChange(true)` if both fail.
 */
function attachTileLayerWithFallback(
  map: L.Map,
  style: 'street' | 'topo',
  onUnavailableChange: (unavailable: boolean) => void
): L.TileLayer {
  onUnavailableChange(false);

  const primaryUrl = style === 'topo' ? TOPO_TILE_URL : CARTO_VOYAGER_TILE_URL;
  const primaryOptions: L.TileLayerOptions =
    style === 'topo'
      ? {
          attribution: TOPO_ATTRIBUTION,
          detectRetina: true,
          maxZoom: 19,
        }
      : {
          attribution: CARTO_VOYAGER_ATTRIBUTION,
          detectRetina: true,
          subdomains: 'abcd',
          maxZoom: 19,
        };

  let switchedToOsmFallback = false;
  const primaryLayer = L.tileLayer(primaryUrl, primaryOptions);

  primaryLayer.on('tileload', () => {
    onUnavailableChange(false);
  });

  primaryLayer.on('tileerror', () => {
    if (switchedToOsmFallback) return;
    switchedToOsmFallback = true;

    try {
      if (map.hasLayer(primaryLayer)) {
        map.removeLayer(primaryLayer);
      }
    } catch {
      // ignore removal error if map was destroyed
    }

    const fallbackOsmLayer = L.tileLayer(OSM_FALLBACK_TILE_URL, {
      attribution: OSM_FALLBACK_ATTRIBUTION,
      detectRetina: true,
      subdomains: 'abc',
      maxZoom: 19,
    });

    fallbackOsmLayer.on('tileload', () => {
      onUnavailableChange(false);
    });

    fallbackOsmLayer.on('tileerror', () => {
      onUnavailableChange(true);
    });

    fallbackOsmLayer.addTo(map);
  });

  primaryLayer.addTo(map);
  return primaryLayer;
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
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);
  const [activeCityId, setActiveCityId] = useState<string>('all');
  const [mapStyle, setMapStyle] = useState<'street' | 'topo'>('street');
  const [tileUnavailable, setTileUnavailable] = useState<boolean>(false);
  const [showTwoFingerHint, setShowTwoFingerHint] = useState<boolean>(false);
  const twoFingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const centerLat = center[0];
  const centerLng = center[1];

  const fitMapToListings = useCallback(
    (targetMap: L.Map, targetListings: Listing[]) => {
      const validCoords = targetListings
        .filter(
          (l) =>
            typeof l.latitude === 'number' &&
            typeof l.longitude === 'number' &&
            !isNaN(l.latitude) &&
            !isNaN(l.longitude) &&
            l.latitude !== 0 &&
            l.longitude !== 0
        )
        .map((l) => [l.latitude, l.longitude] as [number, number]);

      if (validCoords.length === 1) {
        targetMap.setView(validCoords[0], 13, { animate: false });
      } else if (validCoords.length > 1) {
        try {
          targetMap.fitBounds(validCoords, {
            padding: [48, 48],
            maxZoom: 13,
          });
        } catch {
          // ignore bounds error
        }
      }
    },
    []
  );

  // Initialize Leaflet map once and handle resize/visibility/gesture cleanup properly
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const moroccoBounds = L.latLngBounds(MOROCCO_MAX_BOUNDS[0], MOROCCO_MAX_BOUNDS[1]);

    const map = L.map(container, {
      center: [centerLat, centerLng],
      zoom: Math.max(zoom, MOROCCO_MIN_ZOOM),
      minZoom: MOROCCO_MIN_ZOOM,
      maxBounds: moroccoBounds,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
      scrollWheelZoom: false,
      // Enable leaflet-gesture-handling so mobile scroll isn't hijacked
      gestureHandling: true,
    } as L.MapOptions);

    L.control.zoom({ position: 'topright' }).addTo(map);

    tileLayerRef.current = attachTileLayerWithFallback(
      map,
      mapStyle,
      setTileUnavailable
    );

    const clusterFactory = (
      L as unknown as {
        markerClusterGroup?: (opts?: Record<string, unknown>) => L.LayerGroup;
      }
    ).markerClusterGroup;

    const markersGroup: L.LayerGroup =
      typeof clusterFactory === 'function'
        ? clusterFactory({
            showCoverageOnHover: false,
            maxClusterRadius: 45,
            spiderfyOnMaxZoom: true,
            zoomToBoundsOnClick: true,
            iconCreateFunction: (cluster: { getChildCount: () => number }) => {
              const count = cluster.getChildCount();
              const size = count >= 20 ? 50 : count >= 10 ? 46 : 42;
              return L.divIcon({
                html: `<div style="
                  width: ${size}px;
                  height: ${size}px;
                  min-width: 40px;
                  min-height: 40px;
                  border-radius: 9999px;
                  background-color: #1E3D34;
                  color: #FFFFFF;
                  font-weight: 800;
                  font-size: 13px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border: 3px solid #FFFFFF;
                  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
                "><span>${count}</span></div>`,
                className: 'darna-marker-cluster',
                iconSize: L.point(size, size),
              });
            },
          })
        : L.layerGroup();

    markersGroup.addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Two-finger touch handling on mobile so 1-finger touch scrolls the page
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (window.innerWidth < 1024) {
          map.dragging.disable();
          setShowTwoFingerHint(true);
          if (twoFingerTimerRef.current) clearTimeout(twoFingerTimerRef.current);
          twoFingerTimerRef.current = setTimeout(() => {
            setShowTwoFingerHint(false);
          }, 1600);
        }
      } else if (e.touches.length >= 2) {
        map.dragging.enable();
        setShowTwoFingerHint(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        map.dragging.enable();
        setShowTwoFingerHint(false);
      }
    };

    const handleTouchEnd = () => {
      if (window.innerWidth >= 1024) {
        map.dragging.enable();
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Ensure tiles and bounds render properly when switching from "Liste" to "Carte" and on window resize
    const refreshMapSize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore if unmounted
      }
    };

    const rafId = requestAnimationFrame(refreshMapSize);
    const timer1 = setTimeout(refreshMapSize, 100);
    const timer2 = setTimeout(refreshMapSize, 380);

    const handleWindowResize = () => {
      refreshMapSize();
    };
    window.addEventListener('resize', handleWindowResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        refreshMapSize();
      });
      resizeObserver.observe(container);
    }

    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          refreshMapSize();
        }
      });
      intersectionObserver.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (twoFingerTimerRef.current) clearTimeout(twoFingerTimerRef.current);
      window.removeEventListener('resize', handleWindowResize);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Switch tile style when user toggles between Plan (CARTO Voyager) and Relief (Topo)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      try {
        map.removeLayer(tileLayerRef.current);
      } catch {
        // ignore
      }
    }

    tileLayerRef.current = attachTileLayerWithFallback(
      map,
      mapStyle,
      setTileUnavailable
    );
  }, [mapStyle]);

  // Render price pill markers (clustered) and fit bounds to filtered listings
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    map.invalidateSize({ animate: false });
    markersGroup.clearLayers();

    const validListings = listings.filter(
      (l) =>
        typeof l.latitude === 'number' &&
        typeof l.longitude === 'number' &&
        !isNaN(l.latitude) &&
        !isNaN(l.longitude) &&
        l.latitude !== 0 &&
        l.longitude !== 0
    );

    validListings.forEach((listing) => {
      const isSelected =
        selectedListing?.id === listing.id || previewListing?.id === listing.id;
      const txType = getListingTransactionType(listing);
      const markerTheme = getMapMarkerColors(txType, isSelected);
      const priceLabel = formatMapMarkerPriceMAD(listing.price);

      const customIcon = L.divIcon({
        className: 'darna-price-marker-icon',
        html: `
          <div
            data-listing-id="${listing.id}"
            data-tx-type="${txType}"
            data-selected="${isSelected ? 'true' : 'false'}"
            style="
              background-color: ${markerTheme.backgroundColor};
              color: ${markerTheme.textColor};
              font-weight: 800;
              font-size: 12px;
              line-height: 1.1;
              min-height: 40px;
              min-width: 56px;
              padding: 7px 12px;
              border-radius: 9999px;
              box-shadow: ${
                isSelected
                  ? '0 10px 24px rgba(30, 61, 52, 0.45)'
                  : '0 6px 16px rgba(0, 0, 0, 0.28)'
              };
              border: 2.5px solid ${markerTheme.borderColor};
              white-space: nowrap;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              cursor: pointer;
              transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
              transition: transform 0.2s ease, background-color 0.2s ease;
              touch-action: manipulation;
            "
          >
            <span>${priceLabel}</span>
          </div>
        `,
        iconSize: [110, 40],
        iconAnchor: [55, 20],
      });

      const marker = L.marker([listing.latitude, listing.longitude], {
        icon: customIcon,
        zIndexOffset: markerTheme.zIndexOffset,
      });

      marker.on('click', () => {
        setPreviewListing(listing);
        map.flyTo([listing.latitude, listing.longitude], Math.max(map.getZoom(), 14), {
          duration: 0.6,
        });
      });

      markersGroup.addLayer(marker);
    });

    // Fit initial or filtered bounds when no single marker preview is locking the camera
    if (validListings.length > 0 && !previewListing && activeCityId === 'all') {
      fitMapToListings(map, validListings);
    }
  }, [listings, selectedListing, previewListing, activeCityId, fitMapToListings]);

  const handleJumpToCity = (cityId: string) => {
    setActiveCityId(cityId);
    setPreviewListing(null);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (cityId === 'all') {
      fitMapToListings(map, listings);
      return;
    }

    const foundCity = MOROCCAN_CITIES.find((c) => c.id === cityId);
    if (foundCity) {
      map.flyTo([foundCity.lat, foundCity.lng], 13, { duration: 0.8 });
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-md overflow-hidden flex flex-col">
      {/* Top Map Toolbar: Quick City Navigation & Plan / Relief Switcher */}
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

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shrink-0">
          <button
            type="button"
            onClick={() => setMapStyle('street')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              mapStyle === 'street'
                ? 'bg-[#1E3D34] text-white shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="Afficher le fond de carte Plan (CARTO Voyager)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Plan</span>
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('topo')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              mapStyle === 'topo'
                ? 'bg-[#1E3D34] text-white shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="Afficher le fond de carte Relief (Topographique)"
          >
            <span>Relief</span>
          </button>
        </div>
      </div>

      {/* Main Split Body: Full-width >=65vh Map on Mobile with List below; 3-Column Grid on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Interactive Map Container: min-h-[65vh] on mobile, lg:col-span-2 on desktop */}
        <div className="lg:col-span-2 relative w-full min-h-[65vh] h-[65vh] lg:min-h-[580px] lg:h-[580px] bg-stone-100">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Discrete Fallback Error Message if both CARTO Voyager and OpenStreetMap fail */}
          {tileUnavailable && (
            <div
              role="status"
              data-testid="map-tile-unavailable"
              className="absolute top-14 left-3 z-[450] bg-amber-50/95 backdrop-blur-md text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl shadow-sm text-xs font-semibold flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Fond de carte indisponible</span>
            </div>
          )}

          {/* Discrete Two-Finger Gesture Hint on Mobile when single finger touches map */}
          {showTwoFingerHint && (
            <div
              role="status"
              data-testid="map-two-finger-hint"
              className="lg:hidden pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 z-[460] bg-stone-900/85 text-white px-4 py-3 rounded-2xl shadow-lg text-xs font-bold flex items-center justify-center gap-2 text-center"
            >
              <Hand className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Utilisez deux doigts pour déplacer la carte</span>
            </div>
          )}

          {/* Floating Preview Card when a marker is clicked */}
          {previewListing && (
            <div className="absolute bottom-4 left-3 right-3 sm:left-6 sm:right-auto sm:w-96 z-[500] bg-white rounded-2xl shadow-2xl border border-stone-200 p-3.5 animate-fade-in">
              <button
                type="button"
                onClick={() => setPreviewListing(null)}
                className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600"
                title="Fermer l'aperçu"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex gap-3">
                <img
                  src={previewListing.images[0] || FALLBACK_LISTING_IMAGE_URL}
                  alt={previewListing.title}
                  onError={handleListingImageError}
                  className="w-24 h-24 rounded-xl object-cover shrink-0 border border-stone-200"
                />
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full text-white ${
                        getListingTransactionType(previewListing) === 'vente'
                          ? 'bg-[#0F4C81]'
                          : 'bg-[#C15C3D]'
                      }`}
                    >
                      {getListingTransactionType(previewListing) === 'vente'
                        ? 'À vendre'
                        : 'À louer'}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#1E3D34]/10 text-[#1E3D34]">
                      {previewListing.category}
                    </span>
                  </div>
                  <h4 className="font-bold text-stone-900 text-sm truncate mt-1">
                    {previewListing.title}
                  </h4>
                  <p className="text-xs text-stone-500 truncate">
                    📍 {previewListing.district}, {previewListing.city}
                  </p>
                  <p className="font-extrabold text-[#C15C3D] text-sm mt-1">
                    {formatMAD(
                      previewListing.price,
                      previewListing.period,
                      getListingTransactionType(previewListing)
                    )}
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
                  className="px-3.5 py-2 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <span>Voir la fiche</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Legend Overlay: Location vs Vente vs Sélectionnée */}
          <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-stone-200 text-[11px] flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 font-bold text-stone-700">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C15C3D]"></span>
              <span>Location</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-stone-700">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F4C81]"></span>
              <span>Vente</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-stone-700">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1E3D34]"></span>
              <span>Sélectionnée</span>
            </div>
          </div>
        </div>

        {/* Bottom (Mobile) / Right Side (Desktop) Panel: Interactive List synced with the Map */}
        <div className="border-t lg:border-t-0 lg:border-l border-stone-200 flex flex-col max-h-[440px] lg:max-h-none lg:h-[580px] bg-stone-50/50">
          <div className="p-3.5 bg-white border-b border-stone-200 flex items-center justify-between">
            <h4 className="font-bold text-xs uppercase tracking-wider text-stone-700">
              Biens géolocalisés ({listings.length})
            </h4>
            <span className="text-[11px] text-stone-500">Touchez pour centrer</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {listings.length === 0 ? (
              <div className="text-center py-12 text-xs text-stone-500">
                Aucune annonce à afficher sur cette zone.
              </div>
            ) : (
              listings.map((item) => {
                const isSelected =
                  previewListing?.id === item.id || selectedListing?.id === item.id;
                const txType = getListingTransactionType(item);
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
                        ? 'bg-[#FAF7F2] border-[#1E3D34] shadow-sm ring-1 ring-[#1E3D34]/30'
                        : 'bg-white border-stone-200/90 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={item.images[0] || FALLBACK_LISTING_IMAGE_URL}
                      alt={item.title}
                      onError={handleListingImageError}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full text-white ${
                            txType === 'vente' ? 'bg-[#0F4C81]' : 'bg-[#C15C3D]'
                          }`}
                        >
                          {txType === 'vente' ? 'Vente' : 'Location'}
                        </span>
                        <h5 className="font-bold text-xs text-stone-900 truncate">
                          {item.title}
                        </h5>
                      </div>
                      <p className="text-[11px] text-stone-500 truncate">
                        📍 {item.district}, {item.city}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span
                          className={`font-extrabold text-xs ${
                            txType === 'vente' ? 'text-[#0F4C81]' : 'text-[#C15C3D]'
                          }`}
                        >
                          {formatMAD(item.price, item.period, txType)}
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
  const [tileUnavailable, setTileUnavailable] = useState<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const moroccoBounds = L.latLngBounds(MOROCCO_MAX_BOUNDS[0], MOROCCO_MAX_BOUNDS[1]);

    const map = L.map(container, {
      center: [latitude, longitude],
      zoom: 14,
      minZoom: MOROCCO_MIN_ZOOM,
      maxBounds: moroccoBounds,
      maxBoundsViscosity: 0.85,
      scrollWheelZoom: false,
      gestureHandling: true,
    } as L.MapOptions);

    attachTileLayerWithFallback(map, 'street', setTileUnavailable);

    const pinIcon = L.divIcon({
      className: 'darna-single-pin-icon',
      html: `
        <div style="
          background-color: #C15C3D;
          color: white;
          font-weight: 700;
          font-size: 11px;
          min-height: 40px;
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
      iconSize: [150, 40],
      iconAnchor: [75, 20],
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

    const refreshSize = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore
      }
    };

    const timer = setTimeout(refreshSize, 150);
    window.addEventListener('resize', refreshSize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(refreshSize);
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', refreshSize);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [latitude, longitude, title, interactivePicker]);

  return (
    <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-xs bg-stone-100 relative">
      <div ref={containerRef} className="w-full h-56 sm:h-64" />
      {tileUnavailable && (
        <div
          role="status"
          className="absolute top-3 left-3 z-[450] bg-amber-50/95 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-xl text-[11px] font-semibold"
        >
          Fond de carte indisponible
        </div>
      )}
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
