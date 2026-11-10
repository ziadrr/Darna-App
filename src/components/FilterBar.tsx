import React from 'react';
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Building,
  RotateCcw,
  Map,
  List,
  Sparkles,
  X
} from 'lucide-react';
import { ListingFilter, PropertyCategory, AdvertiserType } from '../types';
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
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  viewMode,
  onChangeViewMode,
  isFilterDrawerOpen,
  onToggleFilterDrawer,
  totalResultsCount,
}) => {
  const currentCity = MOROCCAN_CITIES.find(
    (c) => c.name.toLowerCase() === (filters.city || '').toLowerCase()
  );

  const activeFiltersCount = [
    filters.city && filters.city !== 'all',
    filters.district && filters.district !== 'all',
    filters.category && filters.category !== 'all',
    filters.priceMin !== undefined && filters.priceMin > 0,
    filters.priceMax !== undefined && filters.priceMax < 100000,
    filters.bedrooms && filters.bedrooms !== 'all',
    filters.furnished !== undefined && filters.furnished !== 'all',
    filters.advertiserType && filters.advertiserType !== 'all',
    (filters.amenities?.length || 0) > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search Input matching mockup */}
      <div className="bg-white p-2.5 sm:p-3 rounded-3xl shadow-sm border border-stone-200/90 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2.5 px-3">
          <Search className="w-5 h-5 text-stone-400 shrink-0" />
          <input
            type="text"
            value={filters.query || ''}
            onChange={(e) => onChangeFilters({ ...filters, query: e.target.value })}
            placeholder="Ville, quartier ou mot-clé..."
            className="w-full text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:outline-none bg-transparent"
          />
          {filters.query && (
            <button
              onClick={() => onChangeFilters({ ...filters, query: '' })}
              className="p-1 rounded-full text-stone-400 hover:text-stone-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Terracotta Filter Icon Button matching the phone mockup */}
        <button
          onClick={onToggleFilterDrawer}
          className={`relative p-3 rounded-2xl flex items-center justify-center transition-all ${
            activeFiltersCount > 0
              ? 'bg-[#C15C3D] text-white shadow-md'
              : 'bg-[#C15C3D] text-white hover:bg-[#a94f33]'
          }`}
          title="Ouvrir les filtres avancés"
        >
          <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* List / Map view switcher */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-2xl shrink-0">
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

      {/* Horizontal Category Cards matching Mockup */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 scrollbar-none">
        <button
          onClick={() => onChangeFilters({ ...filters, category: 'all' })}
          className={`px-4 py-3 rounded-2xl border text-xs font-bold shrink-0 transition-all flex items-center gap-2 ${
            !filters.category || filters.category === 'all'
              ? 'bg-white border-[#1E3D34] text-[#1E3D34] shadow-xs ring-1 ring-[#1E3D34]/20'
              : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
          }`}
        >
          <Building className="w-4 h-4 text-[#1E3D34]" />
          <span>Toutes</span>
        </button>

        {CATEGORIES_CONFIG.map((cat) => {
          const isSelected = filters.category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onChangeFilters({ ...filters, category: cat.id })}
              className={`px-4 py-3 rounded-2xl border text-xs font-bold shrink-0 transition-all flex items-center gap-2 ${
                isSelected
                  ? 'bg-white border-[#C15C3D] text-[#C15C3D] shadow-xs ring-1 ring-[#C15C3D]/20'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
              }`}
            >
              <span>{cat.id === 'appartement' ? '🏢' : cat.id === 'villa' ? '🏡' : cat.id === 'garage' ? '🚗' : cat.id === 'commerce' ? '🏬' : cat.id === 'bureau' ? '💼' : '🔑'}</span>
              <span>{cat.label.split('&')[0].trim()}</span>
            </button>
          );
        })}
      </div>

      {/* Extended Filters Drawer */}
      {isFilterDrawerOpen && (
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-lg space-y-4 animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="font-bold text-sm text-stone-900">Filtres de recherche avancés</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onResetFilters}
                className="text-xs text-stone-500 hover:text-[#C15C3D] flex items-center gap-1"
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

            {/* Max Price in MAD */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Loyer max (MAD) : {filters.priceMax ? `${filters.priceMax.toLocaleString()} DH` : 'Illimité'}
              </label>
              <input
                type="range"
                min="1000"
                max="50000"
                step="500"
                value={filters.priceMax || 50000}
                onChange={(e) =>
                  onChangeFilters({ ...filters, priceMax: Number(e.target.value) })
                }
                className="w-full accent-[#C15C3D]"
              />
            </div>

            {/* Bedrooms */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Chambres min :</label>
              <div className="flex gap-1">
                {(['all', 1, 2, 3, 4] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => onChangeFilters({ ...filters, bedrooms: b as any })}
                    className={`flex-1 py-2 text-xs rounded-lg border font-semibold ${
                      filters.bedrooms === b || (!filters.bedrooms && b === 'all')
                        ? 'bg-[#C15C3D] text-white border-[#C15C3D]'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    {b === 'all' ? 'Tous' : b === 4 ? '4+' : b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Advertiser Type & Furnished */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Type d'annonceur :</label>
              <div className="flex gap-2 text-xs">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'particulier', label: 'Particulier direct' },
                  { id: 'professionnel', label: 'Agence Pro' },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() =>
                      onChangeFilters({ ...filters, advertiserType: type.id as any })
                    }
                    className={`px-3 py-1.5 rounded-xl border font-semibold ${
                      filters.advertiserType === type.id || (!filters.advertiserType && type.id === 'all')
                        ? 'bg-[#1E3D34] text-white border-[#1E3D34]'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">Ameublement :</label>
              <div className="flex gap-2 text-xs">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: true, label: 'Meublé' },
                  { id: false, label: 'Non meublé' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      onChangeFilters({ ...filters, furnished: item.id as any })
                    }
                    className={`px-3 py-1.5 rounded-xl border font-semibold ${
                      filters.furnished === item.id || (filters.furnished === undefined && item.id === 'all')
                        ? 'bg-[#1E3D34] text-white border-[#1E3D34]'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-stone-500 font-medium">
              {totalResultsCount} annonce(s) trouvée(s)
            </span>
            <button
              onClick={onToggleFilterDrawer}
              className="px-5 py-2 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Voir les résultats
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
