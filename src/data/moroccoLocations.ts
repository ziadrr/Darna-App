import { CityData, PropertyCategory } from '../types';

export const MOROCCAN_CITIES: CityData[] = [
  {
    id: 'casablanca',
    name: 'Casablanca',
    nameAr: 'الدار البيضاء',
    region: 'Casablanca-Settat',
    lat: 33.5731,
    lng: -7.5898,
    popularDistricts: [
      'Gauthier',
      'Maârif',
      'Racine',
      'Bourgogne',
      'Anfa',
      'Aïn Diab',
      'Palmier',
      'Belvédère',
      'Sidi Maârouf',
      'CFC (Casablanca Finance City)',
      'Oasis',
      'Californie',
      'Bouskoura'
    ]
  },
  {
    id: 'rabat',
    name: 'Rabat',
    nameAr: 'الرباط',
    region: 'Rabat-Salé-Kénitra',
    lat: 34.0209,
    lng: -6.8416,
    popularDistricts: [
      'Agdal',
      'Hay Riad',
      'Souissi',
      'Hassan',
      'Les Orangers',
      'Aviation',
      'Océan',
      'Diour Jamaa'
    ]
  },
  {
    id: 'marrakech',
    name: 'Marrakech',
    nameAr: 'مراكش',
    region: 'Marrakech-Safi',
    lat: 31.6295,
    lng: -7.9811,
    popularDistricts: [
      'Guéliz',
      'Hivernage',
      'Palmeraie',
      'Amelkis',
      'Targa',
      'Mhamid',
      'Daoudiate',
      'Médina',
      'Route de Fès'
    ]
  },
  {
    id: 'tanger',
    name: 'Tanger',
    nameAr: 'طنجة',
    region: 'Tanger-Tétouan-Al Hoceïma',
    lat: 35.7595,
    lng: -5.8340,
    popularDistricts: [
      'Malabata',
      'Centre-Ville (Boulevard)',
      'Marshan',
      'Iberia',
      'Playa',
      'Val Fleuri',
      'Mnar',
      'Tanja Balia'
    ]
  },
  {
    id: 'agadir',
    name: 'Agadir',
    nameAr: 'أكادير',
    region: 'Souss-Massa',
    lat: 30.4278,
    lng: -9.5981,
    popularDistricts: [
      'Sonaba / Founty',
      'Baie des Palmiers',
      'Haut Founty',
      'Charaf',
      'Dakhla',
      'Talborjt',
      'Taghazout Bay'
    ]
  },
  {
    id: 'fes',
    name: 'Fès',
    nameAr: 'فاس',
    region: 'Fès-Meknès',
    lat: 34.0181,
    lng: -5.0078,
    popularDistricts: [
      'Ville Nouvelle',
      'Champs de Course',
      'Route d\'Imouzzer',
      'Narjiss',
      'Atlas',
      'Médina Fès El Bali'
    ]
  },
  {
    id: 'meknes',
    name: 'Meknès',
    nameAr: 'مكناس',
    region: 'Fès-Meknès',
    lat: 33.8938,
    lng: -5.5516,
    popularDistricts: ['Hamria', 'Mansour', 'Marjane', 'Bassatine', 'Belle Vue']
  },
  {
    id: 'oujda',
    name: 'Oujda',
    nameAr: 'وجدة',
    region: 'L\'Oriental',
    lat: 34.6814,
    lng: -1.9086,
    popularDistricts: ['Centre-Ville', 'Lazaret', 'Al Qods', 'Golf', 'Hay Andalous']
  },
  {
    id: 'tetouan',
    name: 'Tétouan / Martil',
    nameAr: 'تطوان',
    region: 'Tanger-Tétouan-Al Hoceïma',
    lat: 35.5889,
    lng: -5.3626,
    popularDistricts: ['Wilaya', 'Ensanche', 'Cabo Negro', 'Martil Plage', 'M\'diq']
  },
  {
    id: 'kenitra',
    name: 'Kénitra',
    nameAr: 'القنيطرة',
    region: 'Rabat-Salé-Kénitra',
    lat: 34.2610,
    lng: -6.5802,
    popularDistricts: ['Mehdia Plage', 'Maamora', 'Bir Rami', 'Val Fleuri', 'Centre']
  }
];

export const CATEGORIES_CONFIG: {
  id: PropertyCategory;
  label: string;
  labelAr: string;
  iconName: string;
  description: string;
  requiresBedrooms: boolean;
  requiresBathrooms: boolean;
  canBeFurnished: boolean;
}[] = [
  {
    id: 'appartement',
    label: 'Appartement',
    labelAr: 'شقة',
    iconName: 'Building2',
    description: 'Appartements et duplex en copropriété',
    requiresBedrooms: true,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'studio',
    label: 'Studio',
    labelAr: 'استوديو',
    iconName: 'Building2',
    description: 'Studios modernes ou fonctionnels d’une pièce',
    requiresBedrooms: true,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'maison',
    label: 'Maison & Riad',
    labelAr: 'منزل و رياض',
    iconName: 'Home',
    description: 'Maisons individuelles et riads traditionnels',
    requiresBedrooms: true,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'villa',
    label: 'Villa',
    labelAr: 'فيلا',
    iconName: 'Home',
    description: 'Villas avec jardin, terrasse ou piscine privée',
    requiresBedrooms: true,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'chambre',
    label: 'Chambre',
    labelAr: 'غرفة للإيجار',
    iconName: 'BedDouble',
    description: 'Chambres privées, colocation ou hébergement',
    requiresBedrooms: true,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'garage',
    label: 'Garage',
    labelAr: 'مرآب مغلق',
    iconName: 'Car',
    description: 'Box fermé individuel ou garage privatif',
    requiresBedrooms: false,
    requiresBathrooms: false,
    canBeFurnished: false,
  },
  {
    id: 'parking',
    label: 'Place de Parking',
    labelAr: 'موقف سيارة',
    iconName: 'Car',
    description: 'Emplacement de stationnement en sous-sol ou extérieur',
    requiresBedrooms: false,
    requiresBathrooms: false,
    canBeFurnished: false,
  },
  {
    id: 'commerce',
    label: 'Local Commercial',
    labelAr: 'محل تجاري',
    iconName: 'Store',
    description: 'Boutiques, magasins, showrooms et pas-de-porte',
    requiresBedrooms: false,
    requiresBathrooms: false,
    canBeFurnished: false,
  },
  {
    id: 'bureau',
    label: 'Bureau',
    labelAr: 'مكتب و مساحة عمل',
    iconName: 'Briefcase',
    description: 'Plateaux de bureaux, cabinets médicaux ou espaces pro',
    requiresBedrooms: false,
    requiresBathrooms: true,
    canBeFurnished: true,
  },
  {
    id: 'terrain',
    label: 'Terrain',
    labelAr: 'أرض',
    iconName: 'Trees',
    description: 'Terrains agricoles, logistiques ou événementiels',
    requiresBedrooms: false,
    requiresBathrooms: false,
    canBeFurnished: false,
  },
  {
    id: 'autre',
    label: 'Autre',
    labelAr: 'أنواع أخرى',
    iconName: 'KeyRound',
    description: 'Entrepôts, dépôts, toits-terrasses et autres biens',
    requiresBedrooms: false,
    requiresBathrooms: false,
    canBeFurnished: false,
  }
];

export const AVAILABLE_AMENITIES = [
  'Ascenseur',
  'Climatisation',
  'Balcon / Terrasse',
  'Piscine',
  'Parking sécurisé',
  'Sécurité 24/7 / Concierge',
  'Cuisine équipée',
  'Fibre optique / WiFi',
  'Chauffage central',
  'Vue dégagée / Vue mer',
  'Accès PMR',
  'Jardin privé',
  'Animaux acceptés',
  'Cheminée'
];
