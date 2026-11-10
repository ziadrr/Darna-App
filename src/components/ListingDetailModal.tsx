import React, { useState } from 'react';
import {
  X,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  Calendar,
  CheckCircle2,
  Phone,
  MessageCircle,
  Mail,
  ShieldAlert,
  Share2,
  Heart,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building,
  Info
} from 'lucide-react';
import { Listing } from '../types';
import { formatMAD, formatMoroccanPhone, buildWhatsAppLink } from '../utils/rentalLogic';
import { AudioTourPlayer } from './AudioTourPlayer';
import { SingleLocationMap } from './MoroccoMap';

interface ListingDetailModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onOpenReport: (listing: Listing) => void;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
  onOpenReport,
}) => {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [contactMessageSent, setContactMessageSent] = useState(false);
  const [messageText, setMessageText] = useState('');

  if (!isOpen || !listing) return null;

  const images = listing.images?.length > 0 ? listing.images : [
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80'
  ];

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSendInternalMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    setContactMessageSent(true);
    setTimeout(() => {
      setMessageText('');
      setContactMessageSent(false);
    }, 3500);
  };

  const whatsappLink = buildWhatsAppLink(
    listing.contact.whatsapp || listing.contact.phone,
    listing.title
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Sticky Header Bar */}
        <div className="px-5 py-3.5 bg-white border-b border-stone-200 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#1E3D34]/10 text-[#1E3D34]">
              {listing.category}
            </span>
            <span className="text-xs text-stone-500 font-medium">
              Réf : {listing.id}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
              title="Partager le lien"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => onToggleFavorite(listing.id, e)}
              className={`p-2 rounded-xl transition-colors ${
                isFavorite ? 'text-red-500 bg-red-50' : 'text-stone-600 hover:bg-stone-100'
              }`}
              title="Favoris"
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {copiedLink && (
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-medium text-center animate-fade-in">
              Lien de l'annonce copié dans le presse-papier !
            </div>
          )}

          {/* Photo Gallery Carousel */}
          <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-[16/10] sm:aspect-[16/9] shadow-md">
            <img
              src={images[activePhotoIdx]}
              alt={`${listing.title} - photo ${activePhotoIdx + 1}`}
              className="w-full h-full object-cover transition-all duration-300"
            />

            {images.length > 1 && (
              <>
                <button
                  onClick={() => setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActivePhotoIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Thumbnails strip */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1 bg-black/50 backdrop-blur-md rounded-full">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePhotoIdx(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        activePhotoIdx === i ? 'bg-amber-400 scale-125' : 'bg-white/60 hover:bg-white'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* AI Audio Tour (TTS) */}
          <AudioTourPlayer listing={listing} />

          {/* Title, Location & Price Box */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-stone-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">
                {listing.title}
              </h1>
              <div className="flex items-center gap-2 text-stone-600 text-sm mt-2">
                <MapPin className="w-4 h-4 text-[#C15C3D] shrink-0" />
                <span>
                  {listing.district}, {listing.city} {listing.contact.showExactAddress && listing.address ? `(${listing.address})` : ''}
                </span>
              </div>
            </div>

            <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200/90 shrink-0 text-right md:text-right">
              <span className="block text-xs uppercase font-bold tracking-wider text-stone-500">Loyer demandé</span>
              <span className="text-2xl font-extrabold text-[#C15C3D]">
                {formatMAD(listing.price, listing.period)}
              </span>
              {listing.deposit && (
                <span className="block text-xs text-stone-500 mt-1">
                  Caution : {listing.deposit.toLocaleString('fr-FR')} MAD
                </span>
              )}
            </div>
          </div>

          {/* Key Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
              <Maximize2 className="w-5 h-5 text-stone-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-stone-500 uppercase font-semibold">Superficie</span>
                <span className="font-bold text-stone-800 text-sm">{listing.surface} m²</span>
              </div>
            </div>

            {listing.bedrooms !== undefined && listing.bedrooms > 0 && (
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
                <Bed className="w-5 h-5 text-stone-400 shrink-0" />
                <div>
                  <span className="block text-[10px] text-stone-500 uppercase font-semibold">Chambres</span>
                  <span className="font-bold text-stone-800 text-sm">{listing.bedrooms}</span>
                </div>
              </div>
            )}

            {listing.bathrooms !== undefined && listing.bathrooms > 0 && (
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
                <Bath className="w-5 h-5 text-stone-400 shrink-0" />
                <div>
                  <span className="block text-[10px] text-stone-500 uppercase font-semibold">Salles de bain</span>
                  <span className="font-bold text-stone-800 text-sm">{listing.bathrooms}</span>
                </div>
              </div>
            )}

            <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-stone-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-stone-500 uppercase font-semibold">Disponibilité</span>
                <span className="font-bold text-stone-800 text-sm truncate">{listing.availableFrom || 'Immédiate'}</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-stone-900">Description du bien</h3>
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-stone-50/50 p-4 rounded-2xl border border-stone-200/60">
              {listing.description}
            </p>
          </div>

          {/* Amenities */}
          {listing.amenities?.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-base text-stone-900">Équipements & Caractéristiques</h3>
              <div className="flex flex-wrap gap-2">
                {listing.amenities.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-medium border border-stone-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Location Map */}
          {listing.latitude && listing.longitude && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-stone-900">Localisation sur la carte</h3>
                <span className="text-xs text-stone-500">
                  {listing.contact.showExactAddress && listing.address
                    ? listing.address
                    : `Secteur approximatif : ${listing.district}, ${listing.city}`}
                </span>
              </div>
              <SingleLocationMap
                latitude={listing.latitude}
                longitude={listing.longitude}
                title={listing.title}
                subtitle={
                  listing.contact.showExactAddress && listing.address
                    ? `${listing.address}, ${listing.district}, ${listing.city}`
                    : `${listing.district}, ${listing.city} (Adresse exacte protégée)`
                }
              />
            </div>
          )}

          {/* Direct Advertiser Contact Section */}
          <div className="bg-[#FAF7F2] p-5 sm:p-6 rounded-3xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#1E3D34] text-amber-200 font-bold flex items-center justify-center text-lg shadow-sm">
                  {listing.contact.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-stone-900 text-base">{listing.contact.name}</h4>
                    {listing.contact.type === 'professionnel' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E3D34] text-white flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-amber-300" /> Agence Pro
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                        Particulier
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">Membre vérifié sur Darna Maroc</p>
                </div>
              </div>

              <div className="text-right text-xs text-emerald-700 font-semibold bg-emerald-100/70 px-3 py-1 rounded-full border border-emerald-200">
                Direct sans frais d'intermédiaire
              </div>
            </div>

            {/* Contact Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* WhatsApp direct button (dominant in Morocco) */}
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Contacter sur WhatsApp</span>
              </a>

              {/* Phone call button if enabled */}
              {listing.contact.showPhone && listing.contact.phone ? (
                <a
                  href={`tel:${listing.contact.phone}`}
                  className="py-3 px-4 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <Phone className="w-4 h-4" />
                  <span>{formatMoroccanPhone(listing.contact.phone)}</span>
                </a>
              ) : (
                <div className="py-3 px-4 bg-stone-200 text-stone-600 rounded-2xl font-medium text-xs flex items-center justify-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Numéro masqué par l'annonceur</span>
                </div>
              )}
            </div>

            {/* Internal message form */}
            <form onSubmit={handleSendInternalMessage} className="pt-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Ou envoyer un message sécurisé au bailleur :
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Bonjour, je souhaite convenir d'une date de visite..."
                  className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D] bg-white"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim()}
                  className="px-4 py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  Envoyer
                </button>
              </div>
              {contactMessageSent && (
                <p className="text-xs text-emerald-700 font-medium mt-1.5 animate-fade-in">
                  Votre message a bien été transmis à l'annonceur !
                </p>
              )}
            </form>
          </div>

          {/* Safety & Report Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-stone-200 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Conseil Darna : Ne versez jamais d'acompte sans visite physique des lieux.</span>
            </div>
            <button
              onClick={() => onOpenReport(listing)}
              className="text-stone-400 hover:text-red-600 flex items-center gap-1.5 transition-colors font-medium self-start sm:self-auto"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Signaler cette annonce</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
