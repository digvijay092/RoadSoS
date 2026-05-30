export interface Hospital {
  id: string;
  name: string;
  distance: string;
  address: string;
  icuBeds: {
    available: number;
    total: number;
  };
  generalBeds: {
    available: number;
    total: number;
  };
  specialties: string[];
  rating: number;
  phone: string;
  lat: number;
  lng: number;
}

export interface Ambulance {
  id: string;
  type: 'Basic' | 'Advanced' | 'Cardiac';
  status: 'Available' | 'En Route' | 'Busy';
  distance: string;
  eta: string;
  driverName: string;
  plateNumber: string;
  lat: number;
  lng: number;
}

export interface UserProfile {
  name: string;
  bloodGroup: string;
  allergies: string[];
  emergencyContacts: {
    name: string;
    relation: string;
    phone: string;
  }[];
}
