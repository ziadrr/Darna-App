import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Upload,
  Sparkles,
  AlertCircle,
  Trash2,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Listing, PropertyCategory, AdvertiserType, RentPeriod, User } from '../types';
import { MOROCCAN_CITIES, CATEGORIES_CONFIG, AVAILABLE_AMENITIES } from '../data/moroccoLocations';
import {
  validateListingForm,
  formatMAD,
  ValidationError,
  detectContactInPublicText
} from '../utils/rentalLogic';
import { AiImageStudioModal } from './AiImageStudioModal';
import { SingleLocationMap } from './MoroccoMap';

interface PostListingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (listingData: Partial<Listing>, editingId?: string) => Promise<void>;
  currentUser?: User | null;
  editingListing?: Listing | null;
}

export const PostListingWizard: React.FC<PostListingWizardProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentUser,
  editingListing,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isAiStudioOpen, setIsAiStudioOpen] = useState(false);

  // Form State
  const [category, setCategory] = useState<PropertyCategory>('appartement');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('Casablanca');
  const [district, setDistrict] = useState('Maârif');
  const [address, setAddress] = useState('');
  const [customLat, setCustomLat] = useState<number>(33.5731);
  const [customLng, setCustomLng] = useState<number>(-7.5898);
  const [showMapLocation, setShowMapLocation] = useState<boolean>(true);
  const [price, setPrice] = useState<number>(6500);
  const [period, setPeriod] = useState<RentPeriod>('mois');
  const [deposit, setDeposit] = useState<number>(13000);
  const [surface, setSurface] = useState<number>(75);
  const [bedrooms, setBedrooms] = useState<number>(2);
  const [bathrooms, setBathrooms] = useState<number>(1);
  const [floor, setFloor] = useState<number>(2);
  const [furnished, setFurnished] = useState<boolean>(true);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    'Ascenseur',
    'Climatisation',
    'Cuisine équipée',
  ]);
  const [images, setImages] = useState<string[]>([
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
  ]);
  const [availableFrom, setAvailableFrom] = useState('Immédiate');

  // Contact & Privacy State
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>('particulier');
  const [contactName, setContactName] = useState(currentUser?.name || '');
  const [contactPhone, setContactPhone] = useState(currentUser?.phone || '');
  const [contactEmail, setContactEmail] = useState(currentUser?.email || '');
  const [contactWhatsApp, setContactWhatsApp] = useState(currentUser?.phone || '');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(true);
  const [showExactAddress, setShowExactAddress] = useState(false);
  const [phoneConsentAccepted, setPhoneConsentAccepted] = useState(true);
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(true);

  useEffect(() => {
    if (editingListing) {
      setStep(1);
      setCategory(editingListing.category);
      setTitle(editingListing.title);
      setDescription(editingListing.description);
      setCity(editingListing.city);
      setDistrict(editingListing.district);
      setAddress(editingListing.address || '');
      setCustomLat(editingListing.latitude || 33.5731);
      setCustomLng(editingListing.longitude || -7.5898);
      setShowMapLocation(editingListing.contact?.showMapLocation !== false);
      setPrice(editingListing.price);
      setPeriod(editingListing.period);
      setDeposit(editingListing.deposit || 0);
      setSurface(editingListing.surface);
      setBedrooms(editingListing.bedrooms ?? 2);
      setBathrooms(editingListing.bathrooms ?? 1);
      setFloor(editingListing.floor ?? 1);
      setFurnished(editingListing.furnished ?? true);
      setSelectedAmenities(editingListing.amenities || []);
      setImages(editingListing.images || []);
      setAvailableFrom(editingListing.availableFrom || 'Immédiate');
      setAdvertiserType(editingListing.contact?.type || 'particulier');
      setContactName(editingListing.contact?.name || currentUser?.name || '');
      setContactPhone(editingListing.contact?.phone || currentUser?.phone || '');
      setContactEmail(editingListing.contact?.email || currentUser?.email || '');
      setContactWhatsApp(editingListing.contact?.whatsapp || editingListing.contact?.phone || '');
      setShowPhone(editingListing.contact?.showPhone ?? true);
      setShowEmail(editingListing.contact?.showEmail ?? false);
      setShowWhatsApp(editingListing.contact?.showWhatsApp ?? true);
      setShowExactAddress(editingListing.contact?.showExactAddress ?? false);
      setPhoneConsentAccepted(editingListing.contact?.phoneConsentAccepted !== false);
      setLegalConsentAccepted(true);
    } else if (currentUser) {
      setStep(1);
      setContactName(currentUser.name || '');
      setContactPhone(currentUser.phone || '');
      setContactWhatsApp(currentUser.phone || '');
      setContactEmail(currentUser.email || '');
      setAdvertiserType(currentUser.advertiserType || 'particulier');
    }
  }, [editingListing, currentUser, isOpen]);

  if (!isOpen) return null;

  const currentCategoryConfig = CATEGORIES_CONFIG.find((c) => c.id === category);
  const currentCityData = MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === city.toLowerCase());

  const titleLeak = detectContactInPublicText(title);
  const descLeak = detectContactInPublicText(description);

  const handleCityChange = (newCityName: string) => {
    setCity(newCityName);
    const matched = MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === newCityName.toLowerCase());
    if (matched) {
      setCustomLat(matched.lat);
      setCustomLng(matched.lng);
      if (matched.popularDistricts.length > 0) {
        setDistrict(matched.popularDistricts[0]);
      }
    }
  };

  const handleToggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const handleAddSampleImage = () => {
    const samples = [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    ];
    const unused = samples.find((s) => !images.includes(s)) || samples[0];
    setImages((prev) => [...prev, unused]);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const constructPayload = (): Partial<Listing> => {
    const lat = currentCityData?.lat || 33.5731;
    const lng = currentCityData?.lng || -7.5898;

    return {
      title,
      description,
      category,
      price: Number(price),
      period,
      deposit: Number(deposit) || undefined,
      surface: Number(surface),
      bedrooms: currentCategoryConfig?.requiresBedrooms ? Number(bedrooms) : undefined,
      bathrooms: currentCategoryConfig?.requiresBathrooms ? Number(bathrooms) : undefined,
      floor: Number(floor) || 0,
      furnished: currentCategoryConfig?.canBeFurnished ? furnished : undefined,
      amenities: selectedAmenities,
      images,
      city,
      district,
      address,
      latitude: customLat || lat,
      longitude: customLng || lng,
      availableFrom,
      contact: {
        name: contactName,
        type: advertiserType,
        phone: contactPhone,
        whatsapp: contactWhatsApp,
        email: contactEmail,
        showPhone,
        showEmail,
        showWhatsApp,
        showExactAddress,
        showMapLocation,
        phoneConsentAccepted,
      },
      legalConsentAccepted,
    };
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!title.trim() || title.trim().length < 5) {
        setValidationErrors([{ field: 'title', message: 'Le titre doit faire au moins 5 caractères.' }]);
        return;
      }
      if (titleLeak.hasContactInfo) {
        setValidationErrors([
          {
            field: 'title',
            message:
              'Pour votre sécurité, ne mettez pas de numéro de téléphone, e-mail ou lien dans le titre public.',
          },
        ]);
        return;
      }
      if (!city || !district) {
        setValidationErrors([{ field: 'location', message: 'Veuillez sélectionner la ville et le quartier.' }]);
        return;
      }
    } else if (step === 2) {
      if (!price || price <= 0 || !surface || surface <= 0) {
        setValidationErrors([{ field: 'specs', message: 'Le prix et la superficie doivent être supérieurs à 0.' }]);
        return;
      }
      if (!description.trim() || description.trim().length < 20) {
        setValidationErrors([{ field: 'description', message: 'La description doit faire au moins 20 caractères.' }]);
        return;
      }
      if (descLeak.hasContactInfo) {
        setValidationErrors([
          {
            field: 'description',
            message:
              'Veuillez retirer les numéros de téléphone, adresses e-mail ou liens de la description publique.',
          },
        ]);
        return;
      }
    } else if (step === 3) {
      if (images.length === 0) {
        setValidationErrors([{ field: 'images', message: 'Veuillez ajouter au moins une photo.' }]);
        return;
      }
    } else if (step === 4) {
      if ((showPhone || showWhatsApp) && (!contactPhone || contactPhone.trim().length < 8)) {
        setValidationErrors([
          { field: 'contactPhone', message: 'Un numéro de téléphone marocain valide est requis.' },
        ]);
        return;
      }
      if ((showPhone || showWhatsApp) && !phoneConsentAccepted) {
        setValidationErrors([
          {
            field: 'phoneConsent',
            message:
              'Vous devez donner votre accord explicite avant de rendre votre numéro visible aux utilisateurs connectés.',
          },
        ]);
        return;
      }
      if (!legalConsentAccepted) {
        setValidationErrors([
          {
            field: 'legal',
            message: 'Veuillez accepter les conditions et certifier votre autorisation.',
          },
        ]);
        return;
      }
    }

    setValidationErrors([]);
    setStep((prev) => (prev < 5 ? ((prev + 1) as any) : 5));
  };

  const handleSubmitFinal = async (asDraft: boolean = false) => {
    const payload = constructPayload();
    const errors = validateListingForm(payload);

    if (errors.length > 0 && !asDraft) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          ...payload,
          status: asDraft ? 'brouillon' : 'publiee',
        },
        editingListing?.id
      );
      onClose();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Wizard Header */}
        <div className="px-6 py-4 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-stone-900">
              {editingListing ? 'Modifier mon annonce' : 'Déposer une annonce sur Darna'}
            </h2>
            <p className="text-xs text-stone-500">
              Mise en relation directe et sécurisée avec les locataires au Maroc
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Indicator */}
        <div className="px-6 py-3 bg-white border-b border-stone-100 flex items-center justify-between text-xs">
          {[
            { num: 1, label: 'Bien & Lieu' },
            { num: 2, label: 'Détails & Prix' },
            { num: 3, label: 'Photos & IA' },
            { num: 4, label: 'Contact & Confidentialité' },
            { num: 5, label: 'Aperçu' },
          ].map((s) => {
            const isActive = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isActive
                      ? 'bg-[#C15C3D] text-white shadow-xs'
                      : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span
                  className={`hidden sm:inline font-medium ${
                    isActive ? 'text-[#C15C3D] font-bold' : 'text-stone-500'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Validation Errors banner */}
        {validationErrors.length > 0 && (
          <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <div>
              {validationErrors.map((e, idx) => (
                <div key={idx}>{e.message}</div>
              ))}
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: CATEGORY, TITLE & LOCATION */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  1. Quel type de bien proposez-vous ?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES_CONFIG.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-2.5 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D] ring-2 ring-[#C15C3D]/20 shadow-xs'
                            : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
                        }`}
                      >
                        <div className="font-bold text-xs">{cat.label}</div>
                        <div className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">
                          {cat.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Titre de votre annonce :
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Bel appartement 2 chambres meublé avec terrasse à Maârif"
                  className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                />
                {titleLeak.hasContactInfo && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Attention : Ne mettez pas de numéro de téléphone ou d'e-mail dans le titre public.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Ville au Maroc :
                  </label>
                  <select
                    value={city}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D] bg-white"
                  >
                    {MOROCCAN_CITIES.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.nameAr})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Quartier :
                  </label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D] bg-white"
                  >
                    {currentCityData?.popularDistricts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Adresse exacte (facultative et masquée par défaut) :
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Rue Jean Jaurès, Résidence Al Andalous"
                  className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  L'adresse exacte n'est jamais affichée sans votre autorisation explicite. Seuls la ville et le quartier sont publics.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-stone-700">
                    Position approximative sur la carte :
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMapLocation}
                      onChange={(e) => setShowMapLocation(e.target.checked)}
                      className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                    />
                    <span>Afficher la carte approximative sur l'annonce</span>
                  </label>
                </div>
                {showMapLocation && (
                  <SingleLocationMap
                    latitude={customLat}
                    longitude={customLng}
                    title={title || `${district}, ${city}`}
                    subtitle={`${district}, ${city} (Position approximative)`}
                    interactivePicker={true}
                    onChangeCoordinates={(lat, lng) => {
                      setCustomLat(lat);
                      setCustomLng(lng);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* STEP 2: SPECS, PRICING & AMENITIES */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Loyer en Dirhams (MAD) :
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Périodicité :
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as any)}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D] bg-white"
                  >
                    <option value="mois">Par mois (Bail classique)</option>
                    <option value="jour">Par jour (Courte durée)</option>
                    <option value="an">Par an</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Superficie (m²) :
                  </label>
                  <input
                    type="number"
                    value={surface}
                    onChange={(e) => setSurface(Number(e.target.value))}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              {/* Dynamic room/bathroom fields depending on category */}
              {currentCategoryConfig?.requiresBedrooms && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Nombre de chambres :
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedrooms}
                      onChange={(e) => setBedrooms(Number(e.target.value))}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-stone-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Salles de bain :
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bathrooms}
                      onChange={(e) => setBathrooms(Number(e.target.value))}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-stone-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Étage :
                    </label>
                    <input
                      type="number"
                      value={floor}
                      onChange={(e) => setFloor(Number(e.target.value))}
                      className="w-full text-sm px-4 py-2.5 rounded-xl border border-stone-300 bg-white"
                    />
                  </div>
                </div>
              )}

              {currentCategoryConfig?.canBeFurnished && (
                <div className="flex items-center gap-6">
                  <label className="text-xs font-bold text-stone-700">Ameublement :</label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="furnished"
                      checked={furnished}
                      onChange={() => setFurnished(true)}
                      className="text-[#C15C3D] focus:ring-[#C15C3D]"
                    />
                    <span>Meublé</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="furnished"
                      checked={!furnished}
                      onChange={() => setFurnished(false)}
                      className="text-[#C15C3D] focus:ring-[#C15C3D]"
                    />
                    <span>Non meublé (Vide)</span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">
                  Équipements et caractéristiques :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVAILABLE_AMENITIES.map((amenity) => {
                    const isChecked = selectedAmenities.includes(amenity);
                    return (
                      <label
                        key={amenity}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D]'
                            : 'bg-white border-stone-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleAmenity(amenity)}
                          className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                        />
                        <span>{amenity}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Description détaillée du bien (sans coordonnées personnelles) :
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Décrivez l'état du bien, l'exposition, le voisinage, les transports à proximité, etc."
                  className="w-full text-sm p-4 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                />
                {descLeak.hasContactInfo && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Pour éviter le démarchage abusif, les numéros de téléphone, e-mails et liens sont interdits dans la description publique.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: PHOTOS & AI STUDIO */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div>
                  <h3 className="font-bold text-sm text-stone-900">Photos de l'annonce</h3>
                  <p className="text-xs text-stone-500">
                    Ajoutez des photos nettes du bien (sans numéro de téléphone ni filigrane de contact sur l'image).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddSampleImage}
                    className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ajouter photo démo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAiStudioOpen(true)}
                    className="px-3.5 py-2 bg-gradient-to-r from-[#1E3D34] to-[#C15C3D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Studio IA (1K/2K/4K)</span>
                  </button>
                </div>
              </div>

              {/* Photo grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-stone-200 shadow-xs group"
                  >
                    <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute top-2 left-2 bg-[#C15C3D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                        Photo principale
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: CONTACT & PRIVACY PREFERENCES */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  Vous publiez en tant que :
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdvertiserType('particulier')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      advertiserType === 'particulier'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D] ring-2 ring-[#C15C3D]/20 shadow-xs'
                        : 'bg-white border-stone-200 text-stone-700'
                    }`}
                  >
                    <div className="font-bold text-sm">Particulier</div>
                    <div className="text-xs text-stone-500">Propriétaire ou colocataire</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdvertiserType('professionnel')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      advertiserType === 'professionnel'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D] ring-2 ring-[#C15C3D]/20 shadow-xs'
                        : 'bg-white border-stone-200 text-stone-700'
                    }`}
                  >
                    <div className="font-bold text-sm">Professionnel</div>
                    <div className="text-xs text-stone-500">Agence immobilière ou gestionnaire</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Nom affiché sur l'annonce :
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Numéro de téléphone marocain :
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => {
                      setContactPhone(e.target.value);
                      setContactWhatsApp(e.target.value);
                    }}
                    placeholder="0661234567"
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              {/* Privacy switches */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#1E3D34]" />
                  <h4 className="font-bold text-xs uppercase tracking-wider text-stone-700">
                    Protection de vos coordonnées (visiteurs non connectés exclus) :
                  </h4>
                </div>
                <p className="text-[11px] text-stone-500">
                  Votre numéro n'est jamais visible pour les visiteurs non connectés. Choisissez ci-dessous ce que les membres connectés peuvent voir :
                </p>

                <label className="flex items-center gap-3 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPhone}
                    onChange={(e) => setShowPhone(e.target.checked)}
                    className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                  />
                  <span>Autoriser l'affichage de mon numéro d'appel aux membres connectés</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWhatsApp}
                    onChange={(e) => setShowWhatsApp(e.target.checked)}
                    className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                  />
                  <span>Autoriser le bouton de contact WhatsApp aux membres connectés</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showEmail}
                    onChange={(e) => setShowEmail(e.target.checked)}
                    className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                  />
                  <span>Afficher mon adresse e-mail aux membres connectés</span>
                </label>

                <label className="flex items-center gap-3 text-xs text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExactAddress}
                    onChange={(e) => setShowExactAddress(e.target.checked)}
                    className="rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                  />
                  <span>
                    Afficher l'adresse exacte (si décoché, seuls la ville et le quartier sont affichés)
                  </span>
                </label>
              </div>

              {/* Explicit Phone Consent */}
              {(showPhone || showWhatsApp) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950">
                  <label className="flex items-start gap-2.5 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={phoneConsentAccepted}
                      onChange={(e) => setPhoneConsentAccepted(e.target.checked)}
                      className="rounded text-[#C15C3D] focus:ring-[#C15C3D] mt-0.5"
                    />
                    <span>
                      J'accepte explicitement que mon numéro de téléphone soit rendu visible uniquement aux utilisateurs connectés sur Darna afin qu'ils puissent me contacter au sujet de cette annonce.
                    </span>
                  </label>
                </div>
              )}

              {/* Legal confirmation */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={legalConsentAccepted}
                    onChange={(e) => setLegalConsentAccepted(e.target.checked)}
                    className="rounded text-emerald-700 focus:ring-emerald-600 mt-0.5"
                  />
                  <span>
                    Je certifie sur l'honneur être autorisé à proposer ce bien à la location et j'accepte les Conditions Générales d'Utilisation et la politique de confidentialité de Darna.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: PREVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-stone-900">
                  Prévisualisation de votre annonce :
                </h3>
                <span className="text-xs text-[#C15C3D] font-bold">Vérifiez avant publication</span>
              </div>

              <div className="p-4 sm:p-5 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-4">
                <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-stone-100">
                  <img src={images[0]} alt="Aperçu" className="w-full h-full object-cover" />
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-[#1E3D34] font-bold text-xs px-3 py-1 rounded-full uppercase">
                    {category}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-stone-900">{title}</h2>
                    <p className="text-xs text-stone-500 mt-1">
                      📍 {district}, {city} {showExactAddress && address ? `(${address})` : ''}
                    </p>
                  </div>
                  <div className="text-xl font-extrabold text-[#C15C3D]">
                    {formatMAD(price, period)}
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-4 text-xs text-stone-600 border-y border-stone-100 py-3">
                  <span>📐 {surface} m²</span>
                  {currentCategoryConfig?.requiresBedrooms && bedrooms > 0 && (
                    <span>🛏️ {bedrooms} chambres</span>
                  )}
                  {currentCategoryConfig?.requiresBathrooms && bathrooms > 0 && (
                    <span>🚿 {bathrooms} sdb</span>
                  )}
                  {currentCategoryConfig?.canBeFurnished && (
                    <span>{furnished ? '🛋️ Meublé' : '📦 Non meublé'}</span>
                  )}
                </div>

                <p className="text-xs text-stone-700 whitespace-pre-line leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="px-6 py-4 bg-[#FAF7F2] border-t border-stone-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => ((prev - 1) as any))}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step === 5 && (
              <button
                type="button"
                onClick={() => handleSubmitFinal(true)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors"
              >
                Enregistrer brouillon
              </button>
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
              >
                <span>Étape suivante</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmitFinal(false)}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Enregistrement...'
                    : editingListing
                    ? 'Enregistrer les modifications'
                    : 'Publier mon annonce'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Embedded AI Image Studio */}
      <AiImageStudioModal
        isOpen={isAiStudioOpen}
        onClose={() => setIsAiStudioOpen(false)}
        onSelectImage={(url) => setImages((prev) => [url, ...prev])}
      />
    </div>
  );
};
