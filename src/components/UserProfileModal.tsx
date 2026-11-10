import React, { useState } from 'react';
import {
  X,
  User as UserIcon,
  Home,
  Heart,
  Plus,
  Trash2,
  Eye,
  CheckCircle,
  Clock,
  FileEdit,
  Shield,
  Building,
  ArrowRight
} from 'lucide-react';
import { Listing, User, UserRole } from '../types';
import { formatMAD } from '../utils/rentalLogic';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSwitchRole: (newRole: UserRole) => void;
  myListings: Listing[];
  favoriteListings: Listing[];
  onOpenListing: (listing: Listing) => void;
  onOpenCreateAd: () => void;
  onDeleteListing: (id: string) => Promise<void>;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSwitchRole,
  myListings,
  favoriteListings,
  onOpenListing,
  onOpenCreateAd,
  onDeleteListing,
}) => {
  const [activeTab, setActiveTab] = useState<'myAds' | 'favorites' | 'profile'>('myAds');
  const [statusFilter, setStatusFilter] = useState<'all' | 'publiee' | 'en_attente' | 'brouillon'>('all');

  if (!isOpen) return null;

  const filteredMyListings = myListings.filter((l) =>
    statusFilter === 'all' ? true : l.status === statusFilter
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-6 py-5 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1E3D34] text-white flex items-center justify-center font-bold text-lg">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-stone-900">{currentUser.name}</h3>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#C15C3D] text-white uppercase">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-stone-500">{currentUser.email} • {currentUser.phone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role switcher for quick testing */}
        <div className="bg-stone-50 px-6 py-2.5 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-stone-600">Simulateur de rôle (Test MVP) :</span>
          <div className="flex items-center gap-1.5">
            {[
              { id: 'visiteur', label: 'Visiteur' },
              { id: 'particulier', label: 'Particulier' },
              { id: 'professionnel', label: 'Agence Pro' },
              { id: 'admin', label: 'Admin' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => onSwitchRole(r.id as any)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                  currentUser.role === r.id
                    ? 'bg-[#1E3D34] text-white'
                    : 'bg-white text-stone-600 hover:bg-stone-200 border border-stone-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-stone-100 px-6 pt-2 bg-white text-xs font-bold gap-6">
          <button
            onClick={() => setActiveTab('myAds')}
            className={`py-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'myAds'
                ? 'border-[#C15C3D] text-[#C15C3D]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Mes annonces ({myListings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`py-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'favorites'
                ? 'border-[#C15C3D] text-[#C15C3D]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Heart className="w-4 h-4" />
            <span>Mes favoris ({favoriteListings.length})</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'myAds' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Status sub-filter */}
                <div className="flex gap-1.5 text-xs">
                  {[
                    { id: 'all', label: 'Toutes' },
                    { id: 'publiee', label: 'Publiées' },
                    { id: 'en_attente', label: 'En attente' },
                    { id: 'brouillon', label: 'Brouillons' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStatusFilter(s.id as any)}
                      className={`px-3 py-1 rounded-xl font-semibold border ${
                        statusFilter === s.id
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenCreateAd();
                  }}
                  className="px-4 py-2 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nouvelle annonce</span>
                </button>
              </div>

              {filteredMyListings.length === 0 ? (
                <div className="p-10 text-center bg-stone-50 rounded-2xl border border-stone-200">
                  <p className="text-xs text-stone-500">Aucune annonce trouvée dans cette section.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMyListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs hover:border-stone-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={listing.images[0] || 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=200&q=80'}
                          alt={listing.title}
                          className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                listing.status === 'publiee'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : listing.status === 'en_attente'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {listing.status === 'publiee'
                                ? 'Publiée'
                                : listing.status === 'en_attente'
                                ? 'En validation'
                                : listing.status}
                            </span>
                            <span className="text-[11px] text-stone-400">
                              {listing.district}, {listing.city}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs sm:text-sm text-stone-900 mt-1 line-clamp-1">
                            {listing.title}
                          </h4>
                          <span className="text-xs font-bold text-[#C15C3D]">
                            {formatMAD(listing.price, listing.period)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => {
                            onClose();
                            onOpenListing(listing);
                          }}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Voir</span>
                        </button>
                        <button
                          onClick={() => onDeleteListing(listing.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Supprimer l'annonce"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="space-y-3">
              {favoriteListings.length === 0 ? (
                <div className="p-10 text-center bg-stone-50 rounded-2xl border border-stone-200">
                  <Heart className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-500">
                    Vous n'avez pas encore enregistré d'annonces favorites.
                  </p>
                </div>
              ) : (
                favoriteListings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => {
                      onClose();
                      onOpenListing(listing);
                    }}
                    className="p-3 bg-white border border-stone-200 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:border-[#C15C3D] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div>
                        <h4 className="font-bold text-xs sm:text-sm text-stone-900 line-clamp-1">
                          {listing.title}
                        </h4>
                        <p className="text-[11px] text-stone-500">
                          📍 {listing.district}, {listing.city}
                        </p>
                        <span className="text-xs font-bold text-[#C15C3D]">
                          {formatMAD(listing.price, listing.period)}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-stone-400" />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
