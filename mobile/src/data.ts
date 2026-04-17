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
    address: '437 N Frances St, Madison, WI 53703',
    originalRentPrice: 1895,
    subletPrice: 1495,
    avgUtilityFee: 95,
    availableStartDate: '2026-05-15',
    availableEndDate: '2026-08-15',
    preferredGender: 'Any',
    description: 'Upscale furnished student housing with a rooftop pool, study lounges, and a quick walk to Campus Mall and Memorial Library. Modern interiors, in-unit washer/dryer, and 24/7 concierge.',
    imageUrls: [
      'https://www.hubmadison.com/wp-content/uploads/2026/04/amenities-new2_0001_04_437_N_Frances_St_Madison_WI_53703-Kitchen-MW5A5706-Noelle-Tarpey.webp',
      'https://www.hubmadison.com/wp-content/uploads/2026/04/amenities-new2_0002_02_437_N_Frances_St_Madison_WI_53703-Living_room-MW5A5698-Noelle-Tarpey.webp',
      'https://www.hubmadison.com/wp-content/uploads/2026/04/amenities-new2_0000_07_437_N_Frances_St_Madison_WI_53703-Bedroom-MW5A5637-Noelle-Tarpey.webp',
      'https://www.hubmadison.com/wp-content/uploads/2025/09/hub-madison-amenities-rooftop-1.webp',
      'https://www.hubmadison.com/wp-content/uploads/2025/09/hub-madison-amenities-fitness-1.webp',
    ],
    coordinates: { latitude: 43.0745, longitude: -89.3922 },
    roomType: 'Studio',
    furnished: true,
    rules: ['No smoking inside the unit', 'Lease transfer approval is required', 'Respect quiet hours after 10 PM'],
  },
  {
    id: 'p2',
    hostId: 'u11',
    apartmentName: 'The James',
    address: '432 W Gorham St, Madison, WI 53703',
    originalRentPrice: 2145,
    subletPrice: 1640,
    avgUtilityFee: 90,
    availableStartDate: '2026-06-01',
    availableEndDate: '2026-08-31',
    preferredGender: 'Any',
    description: 'Downtown student housing with concrete loft-style interiors, furnished bedrooms, a rooftop pool, and a full fitness center just off State Street.',
    imageUrls: [
      'https://www.americancampus.com/getmedia/8b3a79f8-0272-4683-b55b-6b526d6d3b9d/235_01_Gallery_730x547.jpg',
      'https://www.americancampus.com/getmedia/1f1a634a-1b58-45be-bbed-16cc99df2069/235_02_Gallery_730x547.jpg',
      'https://www.americancampus.com/getmedia/90a6d579-dc72-4f19-9ae6-2bb90bbd58d1/235_10_Gallery_730x547.jpg',
      'https://www.americancampus.com/getmedia/10741ab3-2062-461a-b7fa-33b57ba7ac3a/235_11_Gallery_730x547.jpg',
      'https://www.americancampus.com/getmedia/116cca69-0b60-4e67-ad34-b2a3b4509d93/235_12_Gallery_730x547.jpg',
    ],
    coordinates: { latitude: 43.0753, longitude: -89.3912 },
    roomType: '1BR',
    furnished: true,
    rules: ['No smoking inside apartments', 'Building access is key-fob controlled', 'Community quiet hours are enforced overnight'],
  },
  {
    id: 'p3',
    hostId: 'u12',
    apartmentName: 'State Street Studio',
    address: '515 State St, Madison, WI 53703',
    originalRentPrice: 1695,
    subletPrice: 1280,
    avgUtilityFee: 70,
    availableStartDate: '2026-05-10',
    availableEndDate: '2026-08-20',
    preferredGender: 'Any',
    description: 'A remodeled downtown unit right on State Street with balcony access and walkable access to campus, dining, and the Capitol corridor.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/65592_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/65593_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/65594_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/65595_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/65596_l.jpg',
    ],
    coordinates: { latitude: 43.0748, longitude: -89.3933 },
    roomType: 'Studio',
    furnished: false,
    rules: ['No smoking inside the building', 'Tenant completes lease-transfer paperwork', 'Keep shared hallways and balcony areas clean'],
  },
  {
    id: 'p4',
    hostId: 'u13',
    apartmentName: 'Langdon Street Lofts',
    address: '10 Langdon St, Madison, WI 53703',
    originalRentPrice: 2100,
    subletPrice: 1550,
    avgUtilityFee: 85,
    availableStartDate: '2026-06-15',
    availableEndDate: '2026-09-15',
    preferredGender: 'Any',
    description: 'A Langdon Street apartment with heat included, large windows, and an easy walk to Memorial Union, Library Mall, and the lakeshore.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/100354_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/100385_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/100401_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/100421_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/100443_l.jpg',
    ],
    coordinates: { latitude: 43.0763, longitude: -89.3934 },
    roomType: '1BR',
    furnished: false,
    rules: ['No smoking inside the apartment', 'Decorative fireplaces stay non-wood-burning', 'Please keep late-night noise low on Langdon'],
  },
  {
    id: 'p5',
    hostId: 'u14',
    apartmentName: 'University Ave Suites',
    address: '2308 University Ave, Madison, WI 53726',
    originalRentPrice: 1625,
    subletPrice: 1185,
    avgUtilityFee: 65,
    availableStartDate: '2026-05-20',
    availableEndDate: '2026-08-20',
    preferredGender: 'Any',
    description: 'A west-campus apartment on University Avenue with loft-style layouts, breakfast-bar kitchens, and fast access to Camp Randall and engineering buildings.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/58365_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/58366_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/58367_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/58368_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/58369_l.jpg',
    ],
    coordinates: { latitude: 43.0708, longitude: -89.4118 },
    roomType: '1BR',
    furnished: false,
    rules: ['No smoking inside the unit', 'Move-in dates must be confirmed with management', 'Respect shared laundry and common areas'],
  },
  {
    id: 'p6',
    hostId: 'u15',
    apartmentName: 'Breese Terrace Shared Room',
    address: '225 Breese Terrace, Madison, WI 53705',
    originalRentPrice: 1050,
    subletPrice: 780,
    avgUtilityFee: 45,
    availableStartDate: '2026-05-18',
    availableEndDate: '2026-08-10',
    preferredGender: 'Male',
    description: 'Affordable shared room in a 4-bed house a short bike ride from Camp Randall. Great for summer researchers or interns on a tight budget.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/64831_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/64832_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/64833_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/64834_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/64835_l.jpg',
    ],
    coordinates: { latitude: 43.0683, longitude: -89.4201 },
    roomType: 'Shared Room',
    furnished: true,
    rules: ['No smoking anywhere on property', 'Keep shared kitchen clean daily', 'Quiet hours 11 PM – 8 AM'],
  },
  {
    id: 'p7',
    hostId: 'u16',
    apartmentName: 'Johnson Street 2BR',
    address: '818 E Johnson St, Madison, WI 53703',
    originalRentPrice: 2400,
    subletPrice: 1820,
    avgUtilityFee: 110,
    availableStartDate: '2026-06-01',
    availableEndDate: '2026-09-01',
    preferredGender: 'Any',
    description: 'Spacious 2-bed near Willy Street co-op and State Street. Hardwood floors, updated kitchen, in-unit washer/dryer, and private backyard patio.',
    imageUrls: [
      'https://resource.rentcafe.com/image/upload/q_auto%2Cf_auto%2Cc_limit%2Cw_1200/s3/3/547546/178%20kitchen.jpg',
      'https://resource.rentcafe.com/image/upload/q_auto%2Cf_auto%2Cc_limit%2Cw_1200/s3/3/547546/178-living%20room.jpg',
      'https://resource.rentcafe.com/image/upload/q_auto%2Cf_auto%2Cc_limit%2Cw_1200/s3/3/547546/178%20bedroom.jpg',
      'https://resource.rentcafe.com/image/upload/q_auto%2Cf_auto%2Cc_limit%2Cw_1200/s3/3/547546/178-%20back%20bedroom.jpg',
    ],
    coordinates: { latitude: 43.0762, longitude: -89.3795 },
    roomType: '2BR',
    furnished: false,
    rules: ['No smoking inside', 'Backyard access shared with downstairs tenant', 'Lease transfer requires landlord sign-off'],
  },
  {
    id: 'p8',
    hostId: 'u17',
    apartmentName: 'Mifflin Street Private Room',
    address: '648 W Mifflin St, Madison, WI 53703',
    originalRentPrice: 1350,
    subletPrice: 990,
    avgUtilityFee: 55,
    availableStartDate: '2026-05-12',
    availableEndDate: '2026-08-12',
    preferredGender: 'Female',
    description: 'Private room in a fully furnished 3-bed apartment. Two female roommates staying for summer — looking for one more. One block from the Kohl Center.',
    imageUrls: [
      'https://photos.zillowstatic.com/fp/10fd7f3855e29a6573d5a974491ec955-cc_ft_960.jpg',
      'https://photos.zillowstatic.com/fp/8dd59f436890da4d163dc13eb5cae158-cc_ft_576.jpg',
      'https://photos.zillowstatic.com/fp/a0f9c22c2628407f6ef0a15f357b694b-cc_ft_576.jpg',
      'https://photos.zillowstatic.com/fp/5ba8a6e933d1a32948a7d182b110d09a-cc_ft_576.jpg',
      'https://photos.zillowstatic.com/fp/d3bdfe2798e989e798aa154fcf0622ca-cc_ft_576.jpg',
    ],
    coordinates: { latitude: 43.0731, longitude: -89.3995 },
    roomType: 'Private Room',
    furnished: true,
    rules: ['No smoking or vaping', 'Guests limited to weekends only', 'Keep communal spaces tidy'],
  },
  {
    id: 'p9',
    hostId: 'u18',
    apartmentName: 'Observatory Hill Studio',
    address: '1505 Observatory Dr, Madison, WI 53706',
    originalRentPrice: 1420,
    subletPrice: 1050,
    avgUtilityFee: 60,
    availableStartDate: '2026-06-10',
    availableEndDate: '2026-09-10',
    preferredGender: 'Any',
    description: 'Sunlit studio right by Muir Knoll and the Lakeshore Path. Perfect for grad students or researchers. Heat and internet included.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/96014_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/96015_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/96016_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/96017_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/96018_l.jpg',
    ],
    coordinates: { latitude: 43.0779, longitude: -89.4072 },
    roomType: 'Studio',
    furnished: true,
    rules: ['No pets', 'Utilities (heat + internet) included in price', 'Respect neighboring grad researcher quiet hours'],
  },
  {
    id: 'p10',
    hostId: 'u19',
    apartmentName: 'Camp Randall 2BR Flat',
    address: '1722 Monroe St, Madison, WI 53711',
    originalRentPrice: 2650,
    subletPrice: 1980,
    avgUtilityFee: 120,
    availableStartDate: '2026-05-25',
    availableEndDate: '2026-08-25',
    preferredGender: 'Any',
    description: 'Bright 2-bed flat on Monroe Street one block from Camp Randall, with updated appliances, a dedicated parking spot, and a quiet tree-lined block.',
    imageUrls: [
      'https://images.squarespace-cdn.com/content/v1/624374f14937a62a7d428e9f/fa10d8e5-5ac5-4fda-89e3-27692ee26d76/MONROEC_100_01.jpg?format=2500w',
      'https://images.squarespace-cdn.com/content/v1/624374f14937a62a7d428e9f/46c7aa9f-6b79-4a8f-84dc-97b0b12d5d40/MONROEC_100_02.jpg?format=2500w',
      'https://images.squarespace-cdn.com/content/v1/624374f14937a62a7d428e9f/7b4082db-0975-4c75-8a2b-2fd27b69d452/MONROEC_100_06.jpg?format=2500w',
      'https://images.squarespace-cdn.com/content/v1/624374f14937a62a7d428e9f/d830b266-925a-43f9-b299-a119bfa41bb2/MONROEC_100_010.jpg?format=2500w',
      'https://uli.com/sites/default/files/styles/header_image/public/2024-11/1722-Monroe-Apartment-202-10212019_160407.jpg?itok=n5F8-F6F',
    ],
    coordinates: { latitude: 43.0682, longitude: -89.4132 },
    roomType: '2BR',
    furnished: false,
    rules: ['No smoking on premises', 'One parking spot included', 'Lease sub-let requires owner approval'],
  },
  {
    id: 'p11',
    hostId: 'u20',
    apartmentName: 'Willy Street Cottage',
    address: '904 Jenifer St, Madison, WI 53703',
    originalRentPrice: 1750,
    subletPrice: 1340,
    avgUtilityFee: 75,
    availableStartDate: '2026-05-15',
    availableEndDate: '2026-08-15',
    preferredGender: 'Any',
    description: 'Charming cottage-style 1BR near Willy Street and Lake Monona. Updated bathroom, hardwood floors, and a private backyard great for summer evenings.',
    imageUrls: [
      'https://static.wixstatic.com/media/838ed3_0c7d9ca83a094965a93af161a9ccbe13~mv2.png/v1/fit/w_980,h_645,q_90,enc_avif,quality_auto/838ed3_0c7d9ca83a094965a93af161a9ccbe13~mv2.png',
      'https://static.wixstatic.com/media/838ed3_8f178fff71e74a1a951be4cd4c4618fc~mv2.png/v1/fit/w_980,h_608,q_90,enc_avif,quality_auto/838ed3_8f178fff71e74a1a951be4cd4c4618fc~mv2.png',
      'https://images.rentable.co/102/13416605/large.jpg',
      'https://images.rentable.co/102/6407471/large.jpg',
      'https://images.rentable.co/102/6407472/large.jpg',
    ],
    coordinates: { latitude: 43.0727, longitude: -89.3740 },
    roomType: '1BR',
    furnished: false,
    rules: ['No smoking allowed indoors or in backyard', 'Yard maintenance shared', 'Cats allowed with deposit'],
  },
  {
    id: 'p12',
    hostId: 'u21',
    apartmentName: 'Bascom Hill Studio',
    address: '720 W Johnson St, Madison, WI 53706',
    originalRentPrice: 1550,
    subletPrice: 1150,
    avgUtilityFee: 55,
    availableStartDate: '2026-06-05',
    availableEndDate: '2026-09-05',
    preferredGender: 'Any',
    description: 'Compact studio minutes from Bascom Hill, the Education Building, and Library Mall. Modern finishes, high ceilings, and plenty of natural light.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/46234_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/46235_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/57886_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/57887_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/57888_l.jpg',
    ],
    coordinates: { latitude: 43.0738, longitude: -89.4012 },
    roomType: 'Studio',
    furnished: true,
    rules: ['No smoking anywhere on premise', 'Internet included', 'Subletter must sign addendum with management office'],
  },
  {
    id: 'p13',
    hostId: 'u22',
    apartmentName: 'Regent Street Private Room',
    address: '1845 Regent St, Madison, WI 53726',
    originalRentPrice: 1300,
    subletPrice: 950,
    avgUtilityFee: 50,
    availableStartDate: '2026-05-01',
    availableEndDate: '2026-08-01',
    preferredGender: 'Female',
    description: 'Private room in a cozy 3-bed house on Regent Street near the UW Athletic Campus. Quiet block, one bus stop to campus, and a great spot for summer.',
    imageUrls: [
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/37621_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/37627_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/37628_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/37816_l.jpg',
      'https://cdn2.madisoncampusanddowntownapartments.com/images/serialized/57381_l.jpg',
    ],
    coordinates: { latitude: 43.0673, longitude: -89.4185 },
    roomType: 'Private Room',
    furnished: true,
    rules: ['Female tenants only', 'No overnight guests on weekdays', 'Shared kitchen — keep it clean'],
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
      desiredStartDate: '2026-05-15',
      desiredEndDate: '2026-08-15',
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
      desiredStartDate: '2026-06-01',
      desiredEndDate: '2026-08-31',
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
      desiredStartDate: '2026-05-01',
      desiredEndDate: '2026-07-31',
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
      desiredStartDate: '2026-06-15',
      desiredEndDate: '2026-09-15',
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
      desiredStartDate: '2026-05-20',
      desiredEndDate: '2026-08-20',
      preferredGender: 'Any',
      aboutMe: 'Law student who studies late into the night. Looking for my own space where I can focus.',
      lifestyle: ['Night owl', 'Non-smoker', 'Independent', 'Quiet'],
    },
  },
];
