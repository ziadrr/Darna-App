import React, { useState, useEffect, useRef } from 'react';
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
  AlertTriangle,
  Camera,
  Loader2,
  Tag,
  RefreshCw
} from 'lucide-react';
import {
  Listing,
  PropertyCategory,
  AdvertiserType,
  RentPeriod,
  TransactionType,
  User
} from '../types';
import { MOROCCAN_CITIES, CATEGORIES_CONFIG, AVAILABLE_AMENITIES } from '../data/moroccoLocations';
import {
  validateListingForm,
  formatMAD,
  ValidationError,
  detectContactInPublicText,
  isDemoImageUrl,
  handleListingImageError,
  FALLBACK_LISTING_IMAGE_URL,
  formatPhotoUploadErrorMessage,
  POST_LISTING_WIZARD_STEPS,
  WizardStepNumber,
  getWizardProgressPercentage,
  validateWizardStep,
  resetWizardStepScrollAndFocus,
  scrollToFirstInvalidField,
  lockBackgroundPageScroll
} from '../utils/rentalLogic';
import { AiImageStudioModal } from './AiImageStudioModal';
import { SingleLocationMap } from './MoroccoMap';

export {
  formatPhotoUploadErrorMessage,
  POST_LISTING_WIZARD_STEPS,
  validateWizardStep,
  resetWizardStepScrollAndFocus,
  scrollToFirstInvalidField,
  lockBackgroundPageScroll
};

export interface PhotoUploadItem {
  id: string;
  file: File;
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  url?: string;
  errorCode?: string;
  errorMessage?: string;
}

function getUploadProgressWidthClass(item: PhotoUploadItem): string {
  if (item.status === 'error' || item.status === 'success') return 'w-full';
  const pct = Math.max(5, Math.min(100, item.progress));
  if (pct >= 90) return 'w-11/12';
  if (pct >= 75) return 'w-3/4';
  if (pct >= 60) return 'w-2/3';
  if (pct >= 40) return 'w-1/2';
  if (pct >= 20) return 'w-1/4';
  return 'w-1/12';
}

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
  const [step, setStep] = useState<WizardStepNumber>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isAiStudioOpen, setIsAiStudioOpen] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stepTitleRef = useRef<HTMLHeadingElement | null>(null);

  // Form State
  const [transactionType, setTransactionType] = useState<TransactionType>('location');
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
  // Never pre-fill a demo/Unsplash photo on new listings so demo photos are never presented as real
  const [images, setImages] = useState<string[]>([]);
  const [availableFrom, setAvailableFrom] = useState('Immédiate');

  // Contact & Privacy State (explicit opt-in required: phone and WhatsApp are never visible by default)
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>('particulier');
  const [contactName, setContactName] = useState(currentUser?.name || '');
  const [contactPhone, setContactPhone] = useState(currentUser?.phone || '');
  const [contactEmail, setContactEmail] = useState(currentUser?.email || '');
  const [contactWhatsApp, setContactWhatsApp] = useState(currentUser?.phone || '');
  const [showPhone, setShowPhone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showExactAddress, setShowExactAddress] = useState(false);
  const [phoneConsentAccepted, setPhoneConsentAccepted] = useState(false);
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(true);

  // Requirement 3: Lock background page scroll while modal is open and restore without jump on close
  useEffect(() => {
    if (!isOpen) return;
    const unlockScroll = lockBackgroundPageScroll(document, window);
    return () => {
      unlockScroll();
    };
  }, [isOpen]);

  // Requirement 2: On every step change, reset scroll container to top and focus step title without opening mobile keyboard
  useEffect(() => {
    if (!isOpen) return;
    resetWizardStepScrollAndFocus(scrollContainerRef.current, stepTitleRef.current);
  }, [step, isOpen]);

  useEffect(() => {
    if (editingListing) {
      setStep(1);
      setTransactionType(editingListing.transactionType === 'vente' ? 'vente' : 'location');
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
      setPeriod(
        editingListing.transactionType === 'vente' ? 'unique' : editingListing.period || 'mois'
      );
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
      const hasConsent = editingListing.contact?.phoneConsentAccepted === true;
      setShowPhone(Boolean(editingListing.contact?.showPhone === true && hasConsent));
      setShowEmail(Boolean(editingListing.contact?.showEmail === true));
      setShowWhatsApp(Boolean(editingListing.contact?.showWhatsApp === true && hasConsent));
      setShowExactAddress(Boolean(editingListing.contact?.showExactAddress === true));
      setPhoneConsentAccepted(hasConsent);
      setLegalConsentAccepted(true);
      setUploadStatusMsg(null);
      setPhotoUploads([]);
      setValidationErrors([]);
    } else if (currentUser) {
      setStep(1);
      setTransactionType('location');
      setImages([]);
      setUploadStatusMsg(null);
      setPhotoUploads([]);
      setValidationErrors([]);
      setContactName(currentUser.name || '');
      setContactPhone(currentUser.phone || '');
      setContactWhatsApp(currentUser.phone || '');
      setContactEmail(currentUser.email || '');
      setAdvertiserType(currentUser.advertiserType || 'particulier');
      setShowPhone(false);
      setShowEmail(false);
      setShowWhatsApp(false);
      setShowExactAddress(false);
      setPhoneConsentAccepted(false);
    }
  }, [editingListing, currentUser, isOpen]);

  if (!isOpen) return null;

  const currentCategoryConfig = CATEGORIES_CONFIG.find((c) => c.id === category);
  const currentCityData = MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === city.toLowerCase());
  const currentStepConfig =
    POST_LISTING_WIZARD_STEPS.find((s) => s.num === step) || POST_LISTING_WIZARD_STEPS[0];
  const progressPercentage = getWizardProgressPercentage(step);

  const titleLeak = detectContactInPublicText(title);
  const descLeak = detectContactInPublicText(description);

  // Requirement 1: Option selection handlers only update state and NEVER scroll or change step
  const handleTransactionTypeChange = (nextType: TransactionType) => {
    setTransactionType(nextType);
    if (nextType === 'vente') {
      setPeriod('unique');
      if (price === 6500) {
        setPrice(1450000);
      }
      setDeposit(0);
    } else {
      setPeriod('mois');
      if (price === 1450000) {
        setPrice(6500);
        setDeposit(13000);
      }
    }
  };

  const handleCategoryChange = (nextCategory: PropertyCategory) => {
    setCategory(nextCategory);
  };

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

  const readFileAsDataUri = (
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          const pct = Math.min(40, Math.round((evt.loaded / evt.total) * 40));
          onProgress(pct);
        }
      };
      reader.onload = () => {
        if (onProgress) onProgress(45);
        resolve(String(reader.result || ''));
      };
      reader.onerror = () => reject(new Error(`Impossible de lire le fichier ${file.name}`));
      reader.readAsDataURL(file);
    });

  const uploadSinglePhotoItem = async (item: PhotoUploadItem): Promise<string | null> => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxBytes = 5 * 1024 * 1024;
    const file = item.file;

    const updateItem = (patch: Partial<PhotoUploadItem>) => {
      setPhotoUploads((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, ...patch } : u))
      );
    };

    if (!allowedMimes.includes(file.type)) {
      const msg = formatPhotoUploadErrorMessage(
        400,
        'INVALID_IMAGE_TYPE',
        `« ${file.name} » : Format non autorisé. Utilisez uniquement JPEG, PNG, WebP ou GIF.`,
        file.name
      );
      updateItem({
        status: 'error',
        progress: 0,
        errorCode: 'INVALID_IMAGE_TYPE',
        errorMessage: msg,
      });
      return null;
    }

    if (file.size > maxBytes) {
      const msg = formatPhotoUploadErrorMessage(400, 'IMAGE_TOO_LARGE', undefined, file.name);
      updateItem({
        status: 'error',
        progress: 0,
        errorCode: 'IMAGE_TOO_LARGE',
        errorMessage: msg,
      });
      return null;
    }

    try {
      updateItem({ status: 'uploading', progress: 10, errorMessage: undefined, errorCode: undefined });
      const rawDataUri = await readFileAsDataUri(file, (pct) => {
        updateItem({ progress: pct });
      });

      updateItem({ progress: 65 });
      const token = localStorage.getItem('darna_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dataUri: rawDataUri,
          filename: file.name,
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.success || typeof data?.url !== 'string' || !data.url) {
        const errMsg = formatPhotoUploadErrorMessage(
          res.status,
          data?.code,
          data?.message,
          file.name
        );
        updateItem({
          status: 'error',
          progress: 0,
          errorCode: data?.code || `HTTP_${res.status}`,
          errorMessage: errMsg,
        });
        return null;
      }

      // Store and display ONLY the server URL (e.g. /api/uploads/images/img-xxx), never the base64 dataUri
      const serverImageUrl: string = data.url;
      updateItem({
        status: 'success',
        progress: 100,
        url: serverImageUrl,
        errorCode: undefined,
        errorMessage: undefined,
      });
      setImages((prev) => (prev.includes(serverImageUrl) ? prev : [...prev, serverImageUrl]));
      return serverImageUrl;
    } catch {
      const errMsg = formatPhotoUploadErrorMessage(
        0,
        'DATABASE_SYNC_FAILED',
        undefined,
        file.name
      );
      updateItem({
        status: 'error',
        progress: 0,
        errorCode: 'NETWORK_OR_SERVER_UNAVAILABLE',
        errorMessage: errMsg,
      });
      return null;
    }
  };

  const handlePersonalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const selectedFiles: File[] = Array.from(fileList);
    e.target.value = '';
    setValidationErrors([]);
    setUploadStatusMsg(null);
    setIsUploadingPhotos(true);

    const newItems: PhotoUploadItem[] = selectedFiles.map((file, idx) => ({
      id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      fileName: file.name,
      progress: 5,
      status: 'uploading',
    }));

    setPhotoUploads((prev) => [...prev, ...newItems]);

    try {
      let successCount = 0;
      for (const item of newItems) {
        const uploadedUrl = await uploadSinglePhotoItem(item);
        if (uploadedUrl) {
          successCount += 1;
        }
      }
      if (successCount > 0) {
        setUploadStatusMsg(
          `${successCount} photo(s) personnelle(s) téléversée(s) sur le stockage sécurisé (/api/uploads/images/...).`
        );
      }
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleRetryPhotoUpload = async (uploadId: string) => {
    const target = photoUploads.find((u) => u.id === uploadId);
    if (!target) return;
    setValidationErrors([]);
    setIsUploadingPhotos(true);
    try {
      const uploadedUrl = await uploadSinglePhotoItem(target);
      if (uploadedUrl) {
        setUploadStatusMsg(
          `La photo « ${target.fileName} » a été téléversée avec succès.`
        );
      }
    } finally {
      setIsUploadingPhotos(false);
    }
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
    const usesDemoImages = images.some((img) => isDemoImageUrl(img));

    return {
      title,
      description,
      category,
      transactionType,
      price: Number(price),
      period: transactionType === 'vente' ? 'unique' : period,
      deposit: transactionType === 'vente' ? undefined : Number(deposit) || undefined,
      surface: Number(surface),
      bedrooms: currentCategoryConfig?.requiresBedrooms ? Number(bedrooms) : undefined,
      bathrooms: currentCategoryConfig?.requiresBathrooms ? Number(bathrooms) : undefined,
      floor: Number(floor) || 0,
      furnished: currentCategoryConfig?.canBeFurnished ? furnished : undefined,
      amenities: selectedAmenities,
      images,
      isDemo: usesDemoImages,
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

  const getStepValidationInput = () => ({
    transactionType,
    category,
    city,
    district,
    title,
    price,
    surface,
    description,
    images,
    showPhone,
    showWhatsApp,
    contactPhone,
    phoneConsentAccepted,
    legalConsentAccepted,
  });

  // Requirement 2: Unified step transition that resets scroll container to top and focuses step heading
  const goToStep = (targetStep: WizardStepNumber) => {
    setValidationErrors([]);
    setStep(targetStep);
    resetWizardStepScrollAndFocus(scrollContainerRef.current, stepTitleRef.current);
  };

  const handlePrevStep = () => {
    if (step > 1) {
      goToStep((step - 1) as WizardStepNumber);
    }
  };

  const handleStepPillClick = (targetStep: WizardStepNumber) => {
    if (targetStep <= step) {
      goToStep(targetStep);
      return;
    }
    const validationInput = getStepValidationInput();
    for (let s = step; s < targetStep; s += 1) {
      const currentCheckStep = s as WizardStepNumber;
      const stepErrors = validateWizardStep(currentCheckStep, validationInput);
      if (stepErrors.length > 0) {
        if (currentCheckStep !== step) {
          setStep(currentCheckStep);
        }
        setValidationErrors(stepErrors);
        scrollToFirstInvalidField(scrollContainerRef.current, stepErrors);
        return;
      }
    }
    goToStep(targetStep);
  };

  // Requirement 1 & 5: Only "Étape suivante" advances forward; if invalid, smoothly scroll to the first invalid field
  const handleNextStep = () => {
    const stepErrors = validateWizardStep(step, getStepValidationInput());
    if (stepErrors.length > 0) {
      setValidationErrors(stepErrors);
      scrollToFirstInvalidField(scrollContainerRef.current, stepErrors);
      return;
    }

    if (step < 6) {
      goToStep((step + 1) as WizardStepNumber);
    }
  };

  const handleSubmitFinal = async (asDraft: boolean = false) => {
    const payload = constructPayload();
    const errors = validateListingForm(payload);

    if (errors.length > 0 && !asDraft) {
      setValidationErrors(errors);
      scrollToFirstInvalidField(scrollContainerRef.current, errors);
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
              Mise en relation directe et sécurisée au Maroc • Étape {step} sur {POST_LISTING_WIZARD_STEPS.length} ({progressPercentage}%)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le formulaire"
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Indicator (6 steps + progress bar) */}
        <div
          className="px-6 py-3 bg-white border-b border-stone-100 space-y-2.5"
          data-testid="wizard-stepper"
        >
          <div className="flex items-center justify-between gap-1 overflow-x-auto text-xs">
            {POST_LISTING_WIZARD_STEPS.map((s) => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => handleStepPillClick(s.num)}
                  data-testid={`wizard-step-pill-${s.num}`}
                  aria-current={isActive ? 'step' : undefined}
                  className="flex items-center gap-1.5 py-1 px-1.5 rounded-xl hover:bg-stone-100 transition-colors shrink-0 text-left"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isActive
                          ? 'bg-[#C15C3D] text-white shadow-xs'
                          : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </span>
                  <span
                    className={`hidden md:inline font-medium ${
                      isActive ? 'text-[#C15C3D] font-bold' : 'text-stone-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="wizard-progress-bar"
          >
            <div
              className={`h-full bg-[#C15C3D] transition-all duration-300 ${currentStepConfig.progressWidthClass}`}
            />
          </div>
        </div>

        {/* Validation Errors banner */}
        {validationErrors.length > 0 && (
          <div
            className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-800 text-xs flex items-center gap-2"
            role="alert"
            data-testid="wizard-validation-errors"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <div>
              {validationErrors.map((e, idx) => (
                <div key={idx}>{e.message}</div>
              ))}
            </div>
          </div>
        )}

        {/* Step Content — Requirement 3: overscroll-behavior: contain & overflow-anchor: none */}
        <div
          ref={scrollContainerRef}
          data-testid="wizard-scroll-container"
          className="flex-1 overflow-y-auto overscroll-contain [overscroll-behavior:contain] [overflow-anchor:none] p-6 space-y-5"
        >
          {/* Step Heading — Requirement 2: receives focus({ preventScroll: true }) on every step change without opening mobile keyboard */}
          <div className="pb-2 border-b border-stone-100">
            <h3
              ref={stepTitleRef}
              tabIndex={-1}
              data-testid="wizard-step-heading"
              className="font-bold text-base text-stone-900 outline-none focus:outline-none"
            >
              {currentStepConfig.heading}
            </h3>
          </div>

          {/* STEP 1: OFFRE ET TYPE DE BIEN */}
          {step === 1 && (
            <div className="space-y-5" data-testid="wizard-step-1-offer-and-type">
              {/* Transaction Type Selector: À louer / À vendre */}
              <div data-field="transactionType">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  1. Type d’offre (Location ou Vente) :
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTransactionTypeChange('location')}
                    data-testid="option-transaction-location"
                    className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                      transactionType === 'location'
                        ? 'bg-[#1E3D34] border-[#1E3D34] text-white shadow-sm ring-2 ring-[#1E3D34]/20'
                        : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-300" />
                        <span>À louer</span>
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${
                          transactionType === 'location' ? 'text-stone-200' : 'text-stone-500'
                        }`}
                      >
                        Location mensuelle, courte durée ou annuelle
                      </div>
                    </div>
                    {transactionType === 'location' && (
                      <Check className="w-4 h-4 text-amber-300 shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTransactionTypeChange('vente')}
                    data-testid="option-transaction-vente"
                    className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                      transactionType === 'vente'
                        ? 'bg-[#C15C3D] border-[#C15C3D] text-white shadow-sm ring-2 ring-[#C15C3D]/20'
                        : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-amber-200" />
                        <span>À vendre</span>
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${
                          transactionType === 'vente' ? 'text-amber-100' : 'text-stone-500'
                        }`}
                      >
                        Vente immobilière (prix global en MAD)
                      </div>
                    </div>
                    {transactionType === 'vente' && (
                      <Check className="w-4 h-4 text-white shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              <div data-field="category">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  2. Quel type de bien proposez-vous ?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES_CONFIG.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id)}
                        data-testid={`option-category-${cat.id}`}
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
            </div>
          )}

          {/* STEP 2: LOCALISATION ET TITRE */}
          {step === 2 && (
            <div className="space-y-5" data-testid="wizard-step-2-location-and-title">
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                data-field="location"
              >
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

              <div data-field="title">
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Titre de votre annonce ({transactionType === 'vente' ? 'À vendre' : 'À louer'}) :
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    transactionType === 'vente'
                      ? 'Ex: Appartement 3 chambres avec terrasse à vendre à Maârif'
                      : 'Ex: Bel appartement 2 chambres meublé avec terrasse à Maârif'
                  }
                  className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                />
                {titleLeak.hasContactInfo && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Attention : Ne mettez pas de numéro de téléphone ou d'e-mail dans le titre public.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: SPECS, PRICING & AMENITIES */}
          {step === 3 && (
            <div className="space-y-5" data-testid="wizard-step-3-specs-and-price">
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                data-field="specs"
              >
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    {transactionType === 'vente'
                      ? 'Prix de vente en Dirhams (MAD) :'
                      : 'Loyer en Dirhams (MAD) :'}
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>

                {transactionType === 'location' ? (
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
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Type de transaction :
                    </label>
                    <div className="w-full text-sm px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 font-semibold text-[#C15C3D]">
                      À vendre (Prix global MAD)
                    </div>
                  </div>
                )}

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

              <div data-field="description">
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

          {/* STEP 4: PERSONAL PHOTO UPLOAD & AI STUDIO */}
          {step === 4 && (
            <div className="space-y-5" data-testid="wizard-step-4-photos" data-field="images">
              {/* Hidden native file input for phone camera/gallery and computer files */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handlePersonalFileSelect}
                className="hidden"
                data-testid="personal-photo-file-input"
              />

              {/* Primary Personal Photo Upload Box */}
              <div className="bg-[#FAF7F2] p-5 rounded-3xl border-2 border-dashed border-[#1E3D34]/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Stockage sécurisé • Nettoyage EXIF automatique</span>
                    </div>
                    <h4 className="font-bold text-base text-stone-900">
                      Téléversez vos photos personnelles du bien
                    </h4>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Sélectionnez vos vraies photos depuis votre téléphone (galerie ou appareil photo) ou votre ordinateur. Formats acceptés : JPEG, PNG, WebP, GIF (max 5 Mo par photo).
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isUploadingPhotos}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-3.5 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all shrink-0 active:scale-95 disabled:opacity-60"
                  >
                    {isUploadingPhotos ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Téléversement sécurisé...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 text-amber-300" />
                        <span>Sélectionner & téléverser mes photos</span>
                      </>
                    )}
                  </button>
                </div>

                {uploadStatusMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{uploadStatusMsg}</span>
                  </div>
                )}

                {/* Per-Photo Upload Progress & Specific Error / Retry List */}
                {photoUploads.length > 0 && (
                  <div
                    className="space-y-2.5 pt-2"
                    data-testid="photo-upload-progress-list"
                  >
                    {photoUploads.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border text-xs transition-all ${
                          item.status === 'error'
                            ? 'bg-red-50 border-red-200 text-red-900'
                            : item.status === 'success'
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-white border-stone-200 text-stone-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {item.status === 'uploading' && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E3D34] shrink-0" />
                            )}
                            {item.status === 'success' && (
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            {item.status === 'error' && (
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            )}
                            <span className="font-bold truncate">{item.fileName}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-semibold">
                              {item.status === 'uploading'
                                ? `${item.progress}%`
                                : item.status === 'success'
                                  ? '100% • Prête'
                                  : 'Échec'}
                            </span>
                            {item.status === 'error' && (
                              <button
                                type="button"
                                onClick={() => handleRetryPhotoUpload(item.id)}
                                disabled={isUploadingPhotos}
                                className="px-2.5 py-1 rounded-xl bg-[#C15C3D] hover:bg-[#a94f33] text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Réessayer</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress bar per photo */}
                        <div className="w-full h-1.5 rounded-full bg-stone-200/80 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${getUploadProgressWidthClass(item)} ${
                              item.status === 'error'
                                ? 'bg-red-500'
                                : item.status === 'success'
                                  ? 'bg-emerald-600'
                                  : 'bg-[#1E3D34]'
                            }`}
                          />
                        </div>

                        {item.status === 'error' && item.errorMessage && (
                          <p className="mt-1.5 text-[11px] text-red-700 font-medium leading-snug">
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200/80 text-xs">
                  <span className="text-stone-500">
                    Les photos de démonstration sont signalées comme non contractuelles et ne remplacent pas les photos réelles.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddSampleImage}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Illustration Démo (Test)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAiStudioOpen(true)}
                      className="px-3 py-1.5 bg-gradient-to-r from-[#1E3D34] to-[#C15C3D] text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 shadow-2xs hover:opacity-95 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Studio IA (1K/2K/4K)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Photo grid */}
              {images.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100/80 text-center cursor-pointer transition-colors space-y-2"
                >
                  <Camera className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="text-xs font-bold text-stone-700">
                    Aucune photo sélectionnée pour le moment
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Cliquez ici ou sur « Sélectionner & téléverser mes photos » pour ajouter les photos réelles de votre bien.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {images.map((img, idx) => {
                    const isStockDemo = isDemoImageUrl(img);
                    return (
                      <div
                        key={idx}
                        className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-stone-200 shadow-xs group"
                      >
                        <img
                          src={img || FALLBACK_LISTING_IMAGE_URL}
                          alt={`Photo ${idx + 1}`}
                          onError={handleListingImageError}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 flex flex-col gap-1 pr-8">
                          {idx === 0 && (
                            <span className="bg-[#C15C3D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs w-fit">
                              Photo principale
                            </span>
                          )}
                          {isStockDemo ? (
                            <span className="bg-amber-100/95 text-amber-950 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs w-fit">
                              Illustration Démo
                            </span>
                          ) : (
                            <span className="bg-emerald-700/95 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs w-fit">
                              Photo personnelle
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: CONTACT & PRIVACY PREFERENCES */}
          {step === 5 && (
            <div className="space-y-5" data-testid="wizard-step-5-contact">
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

              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                data-field="contactPhone"
              >
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
                <div
                  className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950"
                  data-field="phoneConsent"
                >
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
              <div
                className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-2"
                data-field="legal"
              >
                <label className="flex items-start gap-2.5 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={legalConsentAccepted}
                    onChange={(e) => setLegalConsentAccepted(e.target.checked)}
                    className="rounded text-emerald-700 focus:ring-emerald-600 mt-0.5"
                  />
                  <span>
                    Je certifie sur l'honneur être autorisé à proposer ce bien ({transactionType === 'vente' ? 'à la vente' : 'à la location'}) et j'accepte les Conditions Générales d'Utilisation et la politique de confidentialité de Darna.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 6: PREVIEW */}
          {step === 6 && (
            <div className="space-y-4" data-testid="wizard-step-6-preview">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-stone-900">
                  Prévisualisation de votre annonce :
                </span>
                <span className="text-xs text-[#C15C3D] font-bold">Vérifiez avant publication</span>
              </div>

              <div className="p-4 sm:p-5 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-4">
                <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-stone-100">
                  <img
                    src={images[0] || FALLBACK_LISTING_IMAGE_URL}
                    alt="Aperçu"
                    onError={handleListingImageError}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`font-bold text-xs px-3 py-1 rounded-full shadow-xs ${
                        transactionType === 'vente'
                          ? 'bg-[#C15C3D] text-white'
                          : 'bg-[#1E3D34] text-white'
                      }`}
                    >
                      {transactionType === 'vente' ? 'À vendre' : 'À louer'}
                    </span>
                    <span className="bg-white/90 backdrop-blur-md text-[#1E3D34] font-bold text-xs px-3 py-1 rounded-full uppercase">
                      {category}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-stone-900">{title}</h2>
                    <p className="text-xs text-stone-500 mt-1">
                      📍 {district}, {city} {showExactAddress && address ? `(${address})` : ''}
                    </p>
                  </div>
                  <div className="text-xl font-extrabold text-[#C15C3D]">
                    {formatMAD(price, period, transactionType)}
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
              onClick={handlePrevStep}
              data-testid="wizard-prev-step-btn"
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step === 6 && (
              <button
                type="button"
                onClick={() => handleSubmitFinal(true)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors"
              >
                Enregistrer brouillon
              </button>
            )}

            {step < 6 ? (
              <button
                type="button"
                onClick={handleNextStep}
                data-testid="wizard-next-step-btn"
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
                data-testid="wizard-publish-btn"
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
