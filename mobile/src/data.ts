// ─── Types ───────────────────────────────────────────────────────────────────

export type Gender = 'Male' | 'Female' | 'Other';
export type PreferredGender = 'Male' | 'Female' | 'Any';
export type AppMode = 'seeker' | 'host';

export interface User {
  id: string;
  name: string;
  gender: Gender;
  imageUrls: string[];
  bio: string | null;
}

export type RoomType = 'Studio' | 'Private Room' | 'Shared Room' | '1BR' | '2BR';

export interface Property {
  id: string;
  hostId: string;
  apartmentName: string;
  address: string;
  originalRentPrice: number;
  subletPrice: number;
  avgUtilityFee: number;
  availableStartDate: string;
  availableEndDate: string;
  preferredGender: PreferredGender;
  description: string;
  imageUrls: string[];
  coordinates: {
    latitude: number;
    longitude: number;
  };
  roomType: RoomType;
  furnished: boolean;
  rules: string[];
  /** From feed: landlord copy about utilities (e.g. "W/S/T included"). */
  utilitiesDescription?: string | null;
  /** From feed: rent includes utilities. */
  utilitiesIncluded?: boolean;
}

export interface SeekerProfile {
  id: string;
  userId: string;
  targetPriceMin: number;
  targetPriceMax: number;
  desiredStartDate: string;
  desiredEndDate: string;
  preferredGender: PreferredGender;
  aboutMe: string;
  lifestyle: string[];
}

export interface SeekerCard {
  user: User;
  profile: SeekerProfile;
}

// ─── Mock Properties ─────────────────────────────────────────────────────────

export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'p1',
    hostId: 'u10',
    apartmentName: 'The Hub on Campus',
    address: '312 E Campus Mall, Madison, WI',
    originalRentPrice: 1850,
    subletPrice: 1350,
    avgUtilityFee: 80,
    availableStartDate: '2025-05-15',
    availableEndDate: '2025-08-15',
    preferredGender: 'Female',
    description: 'Modern studio with floor-to-ceiling windows overlooking Lake Mendota.',
    imageUrls: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
    ],
    coordinates: { latitude: 43.0734, longitude: -89.3965 },
    roomType: 'Studio',
    furnished: true,
    rules: ['No smoking', 'No pets', 'Quiet hours after 10pm'],
  },
  {
    id: 'p2',
    hostId: 'u11',
    apartmentName: 'The James Madison',
    address: '316 W Gorham St, Madison, WI',
    originalRentPrice: 2200,
    subletPrice: 1750,
    avgUtilityFee: 100,
    availableStartDate: '2025-06-01',
    availableEndDate: '2025-08-31',
    preferredGender: 'Any',
    description: 'Spacious 1BR apartment with rooftop access and gym. Steps from State Street.',
    imageUrls: [
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
    ],
    coordinates: { latitude: 43.0748, longitude: -89.3905 },
    roomType: '1BR',
    furnished: true,
    rules: ['No smoking', 'Small pets OK', 'Keep common areas clean'],
  },
  {
    id: 'p3',
    hostId: 'u12',
    apartmentName: 'State Street Apartments',
    address: '524 State St, Madison, WI',
    originalRentPrice: 1600,
    subletPrice: 1200,
    avgUtilityFee: 60,
    availableStartDate: '2025-05-01',
    availableEndDate: '2025-07-31',
    preferredGender: 'Male',
    description: 'Cozy studio above State Street shops. Perfect location for summer internship.',
    imageUrls: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80',
    ],
    coordinates: { latitude: 43.0747, longitude: -89.3942 },
    roomType: 'Studio',
    furnished: false,
    rules: ['No smoking', 'No parties', 'Lease transfer required'],
  },
  {
    id: 'p4',
    hostId: 'u13',
    apartmentName: 'Langdon Street Lofts',
    address: '202 N Langdon St, Madison, WI',
    originalRentPrice: 2500,
    subletPrice: 1900,
    avgUtilityFee: 120,
    availableStartDate: '2025-06-15',
    availableEndDate: '2025-09-15',
    preferredGender: 'Any',
    description: 'Luxury loft with exposed brick and lake views. Furnished and ready to move in.',
    imageUrls: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
      'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=800&q=80',
      'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800&q=80',
    ],
    coordinates: { latitude: 43.0766, longitude: -89.3934 },
    roomType: 'Private Room',
    furnished: true,
    rules: ['No smoking', 'No overnight guests without notice', 'Shared kitchen cleanup'],
  },
  {
    id: 'p5',
    hostId: 'u14',
    apartmentName: 'University Ave Suites',
    address: '1820 University Ave, Madison, WI',
    originalRentPrice: 1400,
    subletPrice: 1050,
    avgUtilityFee: 50,
    availableStartDate: '2025-05-20',
    availableEndDate: '2025-08-20',
    preferredGender: 'Female',
    description: 'Clean, bright studio across from Camp Randall. Bike to class in minutes.',
    imageUrls: [
      'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    ],
    coordinates: { latitude: 43.0708, longitude: -89.4121 },
    roomType: 'Shared Room',
    furnished: false,
    rules: ['No smoking', 'No pets', 'Shared bathroom schedule'],
  },
];

// ─── Mock Users + Seeker Profiles ────────────────────────────────────────────

export const MOCK_SEEKER_CARDS: SeekerCard[] = [
  {
    user: {
      id: 'u1',
      name: 'Emma Johnson',
      gender: 'Female',
      imageUrls: [
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&q=80',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80',
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&q=80',
      ],
      bio: 'CS Junior @ UW-Madison · Coffee addict ☕ · Looking for summer sublet',
    },
    profile: {
      id: 'sp1',
      userId: 'u1',
      targetPriceMin: 1000,
      targetPriceMax: 1400,
      desiredStartDate: '2025-05-15',
      desiredEndDate: '2025-08-15',
      preferredGender: 'Female',
      aboutMe: 'I love coding and coffee. Looking for a clean, quiet place near campus for my summer internship.',
      lifestyle: ['Non-smoker', 'Early riser', 'Clean & organized', 'Quiet lifestyle'],
    },
  },
  {
    user: {
      id: 'u2',
      name: 'Liam Park',
      gender: 'Male',
      imageUrls: [
        'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=600&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
      ],
      bio: 'Finance Senior · Internship @ American Family · Clean & quiet roommate',
    },
    profile: {
      id: 'sp2',
      userId: 'u2',
      targetPriceMin: 1200,
      targetPriceMax: 1700,
      desiredStartDate: '2025-06-01',
      desiredEndDate: '2025-08-31',
      preferredGender: 'Any',
      aboutMe: 'Finance senior with a summer internship lined up. Looking for a furnished place close to downtown.',
      lifestyle: ['Non-smoker', 'Gym-goer', 'Social but respectful', 'Clean'],
    },
  },
  {
    user: {
      id: 'u3',
      name: 'Sofia Martinez',
      gender: 'Female',
      imageUrls: [
        'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=600&q=80',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80',
      ],
      bio: 'Grad student (Econ) · Loves yoga & farmers markets · Flexible on dates',
    },
    profile: {
      id: 'sp3',
      userId: 'u3',
      targetPriceMin: 900,
      targetPriceMax: 1300,
      desiredStartDate: '2025-05-01',
      desiredEndDate: '2025-07-31',
      preferredGender: 'Female',
      aboutMe: 'Econ grad student who loves yoga, cooking, and visiting the farmers market on Saturdays.',
      lifestyle: ['Non-smoker', 'Vegetarian', 'Yoga practitioner', 'Quiet evenings'],
    },
  },
  {
    user: {
      id: 'u4',
      name: 'Marcus Chen',
      gender: 'Male',
      imageUrls: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&q=80',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80',
      ],
      bio: 'Biomedical Engineering · Research at WARF · Early bird 🐦',
    },
    profile: {
      id: 'sp4',
      userId: 'u4',
      targetPriceMin: 1300,
      targetPriceMax: 1800,
      desiredStartDate: '2025-06-15',
      desiredEndDate: '2025-09-15',
      preferredGender: 'Male',
      aboutMe: 'BME researcher spending summer at WARF. Need a quiet place to focus on my thesis.',
      lifestyle: ['Early bird', 'Non-smoker', 'Studious', 'Neat and tidy'],
    },
  },
  {
    user: {
      id: 'u5',
      name: 'Aisha Williams',
      gender: 'Female',
      imageUrls: [
        'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&q=80',
        'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=600&q=80',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=80',
      ],
      bio: 'Law School 1L · Night owl 🌙 · Looking for quiet solo place',
    },
    profile: {
      id: 'sp5',
      userId: 'u5',
      targetPriceMin: 1100,
      targetPriceMax: 1600,
      desiredStartDate: '2025-05-20',
      desiredEndDate: '2025-08-20',
      preferredGender: 'Any',
      aboutMe: 'Law student who studies late into the night. Looking for my own space where I can focus.',
      lifestyle: ['Night owl', 'Non-smoker', 'Independent', 'Quiet'],
    },
  },
];
