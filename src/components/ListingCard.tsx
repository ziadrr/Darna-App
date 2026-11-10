import React from 'react';
import { Heart, MapPin, Bed, Bath, Maximize2, Building, Sparkles } from 'lucide-react';
import { Listing } from '../types';
import { formatMAD, calculateDistanceKm, isListingBoostActive } from '../utils/rentalLogic';

interface ListingCardProps {
  listing: Listing;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onClick: () => void;
  userLocation?: { lat: number; lng: number; city?: string } | null;
}

export const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  isFavorite,
  onToggleFavorite,
  onClick,
  userLocation,
}) => {
  const primaryImage =
    listing.images?.[0] ||
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80';

  const isSponsored = isListingBoostActive(listing);

  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1 ${
        isSponsored
          ? 'border-amber-400/90 ring-1 ring-amber-400/50 shadow-md hover:shadow-xl'
          : 'border-stone-200/90 hover:border-[#C15C3D]/40 shadow-xs hover:shadow-xl'
      }`}
    >
      {/* Image container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <img
          src={primaryImage}
          alt={listing.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 pr-10">
          {isSponsored && (
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-400 text-stone-950 shadow-sm flex items-center gap-1 border border-amber-300">
              <Sparkles className="w-3 h-3 fill-current" /> Sponsorisé
            </span>
          )}
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md text-[#1E3D34] shadow-xs border border-stone-200/60 uppercase tracking-wider">
            {listing.category}
          </span>
          {listing.contact.type === 'professionnel' ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E3D34]/90 text-amber-200 backdrop-blur-md flex items-center gap-1 shadow-xs">
              <Building className="w-3 h-3" /> Professionnel
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-900/75 text-white backdrop-blur-md shadow-xs">
              Particulier
            </span>
          )}
          {listing.isDemo && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/95 text-amber-900 border border-amber-300 backdrop-blur-md shadow-xs">
              Annonce de démonstration
            </span>
          )}
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => onToggleFavorite(listing.id, e)}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all z-10 shadow-md ${
            isFavorite
              ? 'bg-red-500 text-white scale-110'
              : 'bg-white/90 text-stone-600 hover:text-red-500 hover:bg-white backdrop-blur-md'
          }`}
          title={isFavorite ? 'Retirer des favoris' : 'Enregistrer dans mes favoris'}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        {/* Photo count indicator */}
        {listing.images?.length > 1 && (
          <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] text-white font-medium">
            1/{listing.images.length} photos
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-stone-900 text-sm sm:text-base line-clamp-1 group-hover:text-[#C15C3D] transition-colors">
            {listing.title}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
            <MapPin className="w-3.5 h-3.5 text-[#C15C3D] shrink-0" />
            <span className="truncate font-medium">
              {listing.district}, {listing.city}
            </span>
          </div>

          {/* Price */}
          <div className="mt-2.5 font-bold text-[#C15C3D] text-base sm:text-lg">
            {formatMAD(listing.price, listing.period)}
          </div>
        </div>

        {/* Features Specs */}
        <div className="mt-3.5 pt-3 border-t border-stone-100 flex items-center flex-wrap gap-2.5 text-xs text-stone-600">
          {listing.bedrooms !== undefined && listing.bedrooms > 0 && (
            <div className="flex items-center gap-1">
              <Bed className="w-3.5 h-3.5 text-stone-400" />
              <span>{listing.bedrooms} ch</span>
            </div>
          )}
          {listing.bathrooms !== undefined && listing.bathrooms > 0 && (
            <div className="flex items-center gap-1">
              <Bath className="w-3.5 h-3.5 text-stone-400" />
              <span>{listing.bathrooms} sdb</span>
            </div>
          )}
          {listing.furnished !== undefined && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium">
              {listing.furnished ? 'Meublé' : 'Non meublé'}
            </span>
          )}
          <div className="flex items-center gap-1 ml-auto font-semibold text-stone-700">
            <Maximize2 className="w-3 h-3 text-stone-400" />
            <span>{listing.surface} m²</span>
          </div>
        </div>
      </div>
    </div>
  );
};
