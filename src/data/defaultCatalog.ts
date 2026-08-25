import { CatalogItem } from '../types';

export const DEFAULT_CATALOG: CatalogItem[] = [
  // Acupuncture & Individual Treatments
  {
    id: 'tr-scalp',
    name: 'Scalp Acupuncture',
    category: 'treatment',
    defaultPrice: 1000,
    defaultDiscountPercent: 0,
    description: 'Neurological scalp acupuncture therapy',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-tongue',
    name: 'Tongue Acupuncture',
    category: 'treatment',
    defaultPrice: 1000,
    defaultDiscountPercent: 0,
    description: 'Specialized tongue acupuncture session',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-ear',
    name: 'Ear Acupuncture',
    category: 'treatment',
    defaultPrice: 1000,
    defaultDiscountPercent: 0,
    description: 'Auricular acupuncture therapy',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-1',
    name: 'Traditional Body Acupuncture',
    category: 'treatment',
    defaultPrice: 1200,
    defaultDiscountPercent: 0,
    description: 'Acupuncture session with sterile needles',
    outdoorSessions: 10,
    indoorSessions: 20
  },
  {
    id: 'tr-2',
    name: 'Electro-Acupuncture Therapy',
    category: 'treatment',
    defaultPrice: 1500,
    defaultDiscountPercent: 0,
    description: 'Targeted nerve stimulation with micro-current',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-3',
    name: 'Cupping / Hijama Therapy',
    category: 'treatment',
    defaultPrice: 1000,
    defaultDiscountPercent: 0,
    description: 'Dry/Wet cupping for blood circulation and detoxification',
    outdoorSessions: 3,
    indoorSessions: 5
  },
  {
    id: 'tr-4',
    name: 'Moxibustion Heat Therapy',
    category: 'treatment',
    defaultPrice: 800,
    defaultDiscountPercent: 0,
    description: 'Heat therapy using moxa wool',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-5',
    name: 'Physiotherapy & Rehabilitation',
    category: 'treatment',
    defaultPrice: 1000,
    defaultDiscountPercent: 0,
    description: 'Manual rehabilitation and joint mobilization',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-6',
    name: 'Laser Acupuncture Therapy',
    category: 'treatment',
    defaultPrice: 1800,
    defaultDiscountPercent: 0,
    description: 'Non-invasive laser stimulation',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-7',
    name: 'Infrared & TENS Pain Therapy',
    category: 'treatment',
    defaultPrice: 700,
    defaultDiscountPercent: 0,
    description: 'Pain management thermal and nerve therapy',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-8',
    name: 'Spinal Decompression & Traction Therapy',
    category: 'treatment',
    defaultPrice: 1500,
    defaultDiscountPercent: 0,
    description: 'Cervical / Lumbar spine decompression and mechanical traction',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-9',
    name: 'Therapeutic Ultrasound & Deep Heat Therapy',
    category: 'treatment',
    defaultPrice: 800,
    defaultDiscountPercent: 0,
    description: 'Deep tissue phonophoresis and ultrasonic healing therapy',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-10',
    name: 'Acupressure & Chinese Tuina Manipulation',
    category: 'treatment',
    defaultPrice: 1200,
    defaultDiscountPercent: 0,
    description: 'Traditional meridian acupressure and therapeutic Tuina',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-11',
    name: 'TDP Mineral Lamp Heat Therapy',
    category: 'treatment',
    defaultPrice: 600,
    defaultDiscountPercent: 0,
    description: 'Electromagnetic mineral plate deep bio-spectrum heat therapy',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-12',
    name: 'Dry Needling & Trigger Point Therapy',
    category: 'treatment',
    defaultPrice: 1200,
    defaultDiscountPercent: 0,
    description: 'Myofascial trigger point release and intramuscular stimulation',
    outdoorSessions: 10,
    indoorSessions: 15
  },
  {
    id: 'tr-13',
    name: 'Weight Loss & Metabolism Acupuncture',
    category: 'treatment',
    defaultPrice: 1500,
    defaultDiscountPercent: 0,
    description: 'Targeted abdominal acupuncture for weight and metabolic management',
    outdoorSessions: 10,
    indoorSessions: 15
  },

  // Outdoor Packages
  {
    id: 'pkg-30',
    name: '30-Day Comprehensive Outdoor Package',
    category: 'outdoor_package',
    defaultPrice: 36000,
    defaultDiscountPercent: 20,
    description: 'Comprehensive 30 days daily acupuncture & rehab sessions'
  },
  {
    id: 'pkg-15',
    name: '15-Day Intensive Outdoor Package',
    category: 'outdoor_package',
    defaultPrice: 18000,
    defaultDiscountPercent: 15,
    description: 'Intensive 15 days acupuncture regimen'
  },
  {
    id: 'pkg-1',
    name: 'Daily Special Combination Package',
    category: 'outdoor_package',
    defaultPrice: 2500,
    defaultDiscountPercent: 10,
    description: 'Combined multi-therapy day package'
  },

  // Indoor Accommodation Services
  {
    id: 'room-single',
    name: 'Single Premium AC Cabin',
    category: 'indoor_room',
    defaultPrice: 3500,
    description: 'Attached bath, LED TV, attendant couch, AC'
  },
  {
    id: 'room-sharing',
    name: 'Sharing Deluxe AC Cabin',
    category: 'indoor_room',
    defaultPrice: 2000,
    description: 'Two patient bed sharing cabin'
  },
  {
    id: 'room-ac-ward',
    name: 'General AC Ward Bed',
    category: 'indoor_room',
    defaultPrice: 1200,
    description: 'Air conditioned general ward bed'
  },
  {
    id: 'room-non-ac',
    name: 'General Non-AC Ward Bed',
    category: 'indoor_room',
    defaultPrice: 800,
    description: 'General ward bed with fan'
  },

  // Consultation
  {
    id: 'doc-consult',
    name: 'Doctor Counseling & Assessment Fee',
    category: 'consultation',
    defaultPrice: 1000,
    description: 'Senior acupuncture doctor consultation'
  },

  // Additional Treatments
  {
    id: 'add-ozon',
    name: 'Ozon Therapy',
    category: 'additional_treatment',
    defaultPrice: 1500,
    defaultDiscountPercent: 0,
    description: 'Medical ozone oxygen therapy session',
    isIndoorFree: true,
    isRatioBased: true,
    sessionsPer10Days: 3
  },
  {
    id: 'add-ed',
    name: 'Erectile Dysfunction (ED) Therapy',
    category: 'additional_treatment',
    defaultPrice: 2000,
    defaultDiscountPercent: 0,
    fixedDiscountAmount: 5000,
    description: 'Specialized shockwave & ED therapy session',
    isIndoorFree: true,
    isRatioBased: true,
    sessionsPer10Days: 3
  }
];
