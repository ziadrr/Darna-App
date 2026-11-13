import React from 'react';
import {
  Search,
  SlidersHorizontal,
  Building,
  RotateCcw,
  Map,
  List,
  X,
  ArrowUpDown,
  Check,
  LocateFixed
} from 'lucide-react';
import { ListingFilter } from '../types';
import { MOROCCAN_CITIES, CATEGORIES_CONFIG, AVAILABLE_AMENITIES } from '../data/moroccoLocations';

interface FilterBarProps {
  filters: ListingFilter;
  onChangeFilters: (newFilters: ListingFilter) => void;
  onResetFilters: () => void;
  viewMode: 'list' | 'map';
  onChangeViewMode: (mode: 'list' | 'map') => void;
  isFilterDrawerOpen: boolean;
  onToggleFilterDrawer: () => void;
  totalResultsCount: number;
  onRequestGpsLocation?: () => void;
  isLocatingGps?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  appartement: '🏢',
  studio: '🛋️',
  maison: '🏠',
  villa: '🏡',
  chambre: '🛏️',
  garage: '🚗',
  parking: '🅿️',
  commerce: '🏬',
  bureau: '💼',
  terrain: '🌳',
  autre: '🔑',
};

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  viewMode,
  onChangeViewMode,
  isFilterDrawerOpen,
  onToggleFilterDrawer,
  totalResultsCount,
  onRequestGpsLocation,
  isLocatingGps,
}) => {
  const currentCity = MOROCCAN_CITIES.find(
    (c) => c.name.toLowerCase() === (filters.city || '').toLowerCase()
  );

  const activeFiltersCount = [
    filters.city && filters.city !== 'all',
    filters.district && filters.district !== 'all',
    filters.category && filters.category !== 'all',
    filters.priceMin !== undefined && filters.priceMin > 0,
    filters.priceMax !== undefined && filters.priceMax < 50000,
    filters.surfaceMin !== undefined && filters.surfaceMin > 0,
    filters.bedrooms && filters.bedrooms !== 'all',
    filters.furnished !== undefined && filters.furnished !== 'all',
    filters.advertiserType && filters.advertiserType !== 'all',
    (filters.amenities?.length || 0) > 0,
  ].filter(Boolean).length;

  const toggleAmenity = (amenity: string) => {
    const current = filters.amenities || [];
    const updated = current.includes(amenity)
      ? current.filter((a) => a !== amenity)
      : [...current, amenity];
    onChangeFilters({ ...filters, amenities: updated });
  };

  return (
    <div className="space-y-4">
      {/* Main Search Input Bar */}
      <div className="bg-white p-2.5 sm:p-3 rounded-3xl shadow-sm border border-stone-200/90 flex flex-wrap sm:flex-nowrap items-center gap-2">
        <div className="flex-1 min-w-[180px] flex items-center gap-2.5 px-3">
          <Search className="w-5 h-5 text-stone-400 shrink-0" />
          <input
            type="text"
            value={filters.query || ''}
            onChange={(e) => onChangeFilters({ ...filters, query: e.target.value })}
            placeholder="Ville, quartier ou mot-clé (ex: Guéliz, Maârif, Agdal)..."
            className="w-full text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:outline-none bg-transparent"
          />
          {filters.query && (
            <button
              onClick={() => onChangeFilters({ ...filters, query: '' })}
              className="p-1 rounded-full text-stone-400 hover:text-stone-600"
              title="Effacer la recherche"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Button "Autour de moi" */}
        {onRequestGpsLocation && (
          <button
            type="button"
            onClick={onRequestGpsLocation}
            disabled={isLocatingGps}
            className="px-3 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-[#1E3D34] border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
            title="Détecter ma position exacte pour afficher les annonces les plus proches"
          >
            <LocateFixed className={`w-3.5 h-3.5 text-[#C15C3D] ${isLocatingGps ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isLocatingGps ? 'Localisation...' : 'Autour de moi'}
            </span>
          </button>
        )}

        {/* Quick Sort Selector */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-700">
          <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
          <select
            value={filters.sortBy || 'recent'}
            onChange={(e) => onChangeFilters({ ...filters, sortBy: e.target.value as any })}
            className="bg-transparent font-semibold focus:outline-none cursor-pointer"
            aria-label="Trier les annonces"
          >
            <option value="recent">Plus récentes</option>
            <option value="nearest">Plus proches de moi</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
            <option value="surface_desc">Grande superficie</option>
          </select>
        </div>

        {/* Terracotta Filter Icon Button */}
        <button
          onClick={onToggleFilterDrawer}
          className="relative px-3.5 py-2.5 sm:p-3 rounded-2xl flex items-center gap-1.5 justify-center transition-all bg-[#C15C3D] text-white hover:bg-[#a94f33] shadow-xs"
          title="Ouvrir les filtres avancés"
        >
          <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-xs font-bold sm:hidden">Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="-top-1.5 -right-1.5 sm:absolute w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* List / Map view switcher */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-2xl shrink-0 ml-auto sm:ml-0">
          <button
            type="button"
            onClick={() => onChangeViewMode('list')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'list'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Liste</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('map')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'map'
                ? 'bg-[#1E3D34] text-white shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>Carte</span>
          </button>
        </div>
      </div>

      {/* Horizontal Category Cards (All 11 Categories — touch swipe & pointer drag enabled) */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing select-none"
        onMouseDown={(e) => {
          const el = e.currentTarget;
          const startX = e.pageX - el.offsetLeft;
          const scrollLeft = el.scrollLeft;
          const onMove = (moveEvent: MouseEvent) => {
            const x = moveEvent.pageX - el.offsetLeft;
            el.scrollLeft = scrollLeft - (x - startX);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <button
          onClick={() => onChangeFilters({ ...filters, category: 'all' })}
          className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold shrink-0 transition-all flex items-center gap-2 ${
            !filters.category || filters.category === 'all'
              ? 'bg-white border-[#1E3D34] text-[#1E3D34] shadow-xs ring-1 ring-[#1E3D34]/20'
              : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
          }`}
        >
          <Building className="w-4 h-4 text-[#1E3D34]" />
          <span>Toutes ({totalResultsCount})</span>
        </button>

        {CATEGORIES_CONFIG.map((cat) => {
          const isSelected = filters.category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onChangeFilters({ ...filters, category: cat.id })}
              className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-white border-[#C15C3D] text-[#C15C3D] shadow-xs ring-1 ring-[#C15C3D]/20'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              <span>{CATEGORY_ICONS[cat.id] || '🔑'}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Extended Filters Drawer */}
      {isFilterDrawerOpen && (
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-lg space-y-5 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-sm text-stone-900">Filtres de recherche avancés</h3>
              <p className="text-[11px] text-stone-500">
                Affinez votre recherche par budget, superficie, chambres et équipements
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onResetFilters}
                className="text-xs text-stone-500 hover:text-[#C15C3D] flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg hover:bg-stone-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser</span>
              </button>
              <button
                onClick={onToggleFilterDrawer}
                className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* City */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Ville :</label>
              <select
                value={filters.city || 'all'}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    city: e.target.value === 'all' ? undefined : e.target.value,
                    district: undefined,
                  })
                }
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D]"
              >
                <option value="all">Toutes les villes du Maroc</option>
                {MOROCCAN_CITIES.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.nameAr})
                  </option>
                ))}
              </select>
            </div>

            {/* District */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Quartier :</label>
              <select
                value={filters.district || 'all'}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    district: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
                disabled={!filters.city || filters.city === 'all'}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D] disabled:opacity-50"
              >
                <option value="all">Tous les quartiers</option>
                {currentCity?.popularDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Min & Max Price in MAD */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Budget Loyer (MAD) :
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={filters.priceMin || ''}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      priceMin: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Min DH"
                  className="w-full text-xs px-2.5 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D]"
                />
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={filters.priceMax && filters.priceMax < 50000 ? filters.priceMax : ''}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      priceMax: e.target.value ? Number(e.target.value) : 50000,
                    })
                  }
                  placeholder="Max DH"
                  className="w-full text-xs px-2.5 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D]"
                />
              </div>
            </div>

            {/* Min Surface (m²) */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Superficie min (m²) :
              </label>
              <input
                type="number"
                min={0}
                step={5}
                value={filters.surfaceMin || ''}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    surfaceMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Ex: 50 m²"
                className="w-full text-xs px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D]"
              />
            </div>
          </div>

          {/* Second Row: Bedrooms, Furnished, SortBy */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-stone-100">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Chambres min :
              </label>
              <div className="flex gap-1">
                {(['all', 1, 2, 3, 4] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => onChangeFilters({ ...filters, bedrooms: b as any })}
                    className={`flex-1 py-2 text-xs rounded-xl border font-semibold transition-colors ${
                      filters.bedrooms === b || (!filters.bedrooms && b === 'all')
                        ? 'bg-[#C15C3D] text-white border-[#C15C3D]'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {b === 'all' ? 'Tous' : b === 4 ? '4+' : b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Ameublement :
              </label>
              <div className="flex gap-1.5 text-xs">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: true, label: 'Meublé' },
                  { id: false, label: 'Non meublé' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onChangeFilters({ ...filters, furnished: item.id as any })}
                    className={`flex-1 py-2 px-2.5 rounded-xl border font-semibold transition-colors ${
                      filters.furnished === item.id ||
                      (filters.furnished === undefined && item.id === 'all')
                        ? 'bg-[#1E3D34] text-white border-[#1E3D34]'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Trier par :
              </label>
              <select
                value={filters.sortBy || 'recent'}
                onChange={(e) => onChangeFilters({ ...filters, sortBy: e.target.value as any })}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D]"
              >
                <option value="recent">Plus récentes d'abord</option>
                <option value="nearest">Proximité (les plus proches de moi)</option>
                <option value="price_asc">Prix : du moins cher au plus cher</option>
                <option value="price_desc">Prix : du plus cher au moins cher</option>
                <option value="surface_desc">Superficie : de la plus grande à la plus petite</option>
              </select>
            </div>
          </div>

          {/* Amenities Filter Checkboxes */}
          <div className="pt-3 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-700 mb-2">
              Équipements recherchés :
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_AMENITIES.slice(0, 10).map((amenity) => {
                const isSelected = (filters.amenities || []).includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D] font-bold'
                        : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    <span>{amenity}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-stone-100">
            <span className="text-xs text-stone-600 font-bold">
              {totalResultsCount} annonce(s) correspondante(s)
            </span>
            <button
              onClick={onToggleFilterDrawer}
              className="px-5 py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
            >
              Afficher les {totalResultsCount} résultat(s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
