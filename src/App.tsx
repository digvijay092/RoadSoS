import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  MapPin, 
  Ambulance as AmbulanceIcon, 
  Hospital as HospitalIcon, 
  Activity, 
  Search, 
  User, 
  AlertCircle, 
  ChevronRight,
  Clock,
  Navigation,
  HeartPulse,
  Stethoscope,
  ShieldAlert,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Hospital, Ambulance, UserProfile } from './types';
import { getFirstAidInstructions, findNearbyHospitals } from './services/geminiService';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import InteractiveMap from './components/InteractiveMap';

// Mock Data centered around Bangalore, India as standard baseline coordinates (12.9716, 77.5946)
const MOCK_HOSPITALS: Hospital[] = [
  {
    id: '1',
    name: 'City General Hospital',
    distance: '1.2 km',
    address: '450 Medical Plaza, Downtown',
    icuBeds: { available: 4, total: 20 },
    generalBeds: { available: 12, total: 150 },
    specialties: ['Cardiology', 'Trauma', 'Neurology'],
    rating: 4.8,
    phone: '+1 (555) 012-3456',
    lat: 12.9754,
    lng: 77.5891
  },
  {
    id: '2',
    name: 'St. Jude Medical Center',
    distance: '2.8 km',
    address: '1200 Hope Blvd, Eastside',
    icuBeds: { available: 0, total: 15 },
    generalBeds: { available: 45, total: 200 },
    specialties: ['Pediatrics', 'Oncology', 'Emergency'],
    rating: 4.5,
    phone: '+1 (555) 012-7890',
    lat: 12.9612,
    lng: 77.6034
  },
  {
    id: '3',
    name: 'Metro Health Institute',
    distance: '4.5 km',
    address: '88 Innovation Way, West End',
    icuBeds: { available: 8, total: 25 },
    generalBeds: { available: 80, total: 300 },
    specialties: ['Orthopedics', 'Surgery', 'Diagnostics'],
    rating: 4.9,
    phone: '+1 (555) 012-4444',
    lat: 12.9815,
    lng: 77.6102
  }
];

const MOCK_AMBULANCES: Ambulance[] = [
  {
    id: 'A1',
    type: 'Advanced',
    status: 'Available',
    distance: '0.8 km',
    eta: '4 mins',
    driverName: 'John Doe',
    plateNumber: 'AMB-2024-01',
    lat: 12.9745,
    lng: 77.5982
  },
  {
    id: 'A2',
    type: 'Basic',
    status: 'Available',
    distance: '1.5 km',
    eta: '7 mins',
    driverName: 'Jane Smith',
    plateNumber: 'AMB-2024-05',
    lat: 12.9673,
    lng: 77.5885
  }
];

const MOCK_USER: UserProfile = {
  name: 'Digvijay Mali',
  bloodGroup: 'O+',
  allergies: ['Penicillin', 'Peanuts'],
  emergencyContacts: [
    { name: 'Sarah Mali', relation: 'Sister', phone: '+1 (555) 999-8888' }
  ]
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'hospitals' | 'ambulances' | 'profile'>('home');
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [firstAidQuery, setFirstAidQuery] = useState('');
  const [firstAidResponse, setFirstAidResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleTriggerSOS = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 1. Double pulse-alert haptic feedback (highly perceptible vibration pattern)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } catch (err) {
        console.warn("Haptic vibration blocked or not supported on this container:", err);
      }
    }

    // 2. High-quality web audio acoustic backup chime (urgency double-beep)
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        
        const playBeep = (delay: number, duration: number, freq: number) => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          
          gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime + delay);
          // exponential decay for smooth acoustic finish
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration - 0.02);
          
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + duration);
        };

        // Emit two fast urgent tones
        playBeep(0, 0.12, 1100);
        playBeep(0.14, 0.22, 1320);
      }
    } catch (_) {
      // Audio autoplay restrictions or sandbox container blockages handled silently
    }

    // 3. Coordinate-based ripple shockwave
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rippleId = Date.now();
    setRipples((prev) => [...prev, { id: rippleId, x, y }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 1200);

    // 4. Delay transition slightly so the user experiences the beautiful expanding shockwave rings
    setTimeout(() => {
      setIsEmergencyMode(true);
    }, 450);
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Location access denied", err)
      );
    }
  }, []);

  const handleFirstAidSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstAidQuery.trim()) return;
    setIsLoading(true);
    try {
      const res = await getFirstAidInstructions(firstAidQuery);
      setFirstAidResponse(res || "No instructions found.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Floating Toast Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-11/12 max-w-sm"
          >
            <div className={cn(
              "px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border backdrop-blur-md",
              notification.type === 'success' 
                ? "bg-slate-900/95 border-slate-800 text-white" 
                : "bg-slate-900/95 border-slate-800 text-white"
            )}>
              <div className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
                ℹ
              </div>
              <p className="text-xs font-bold flex-1">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="text-white/60 hover:text-white transition-colors cursor-pointer border-none outline-none">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <HeartPulse size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">VitalPulse</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Emergency Network</p>
          </div>
        </div>
        <button 
          onClick={() => setActiveTab('profile')}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <User size={20} />
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {activeTab === 'home' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* SOS Section */}
            <section className="relative overflow-hidden bg-red-600 rounded-3xl p-6 text-white shadow-2xl shadow-red-200">
              <div className="relative z-10">
                <h2 className="text-2xl font-bold mb-2">Emergency?</h2>
                <p className="text-red-100 text-sm mb-6 max-w-[200px]">Press the button below to call the nearest ambulance immediately.</p>
                <motion.button 
                  onClick={handleTriggerSOS}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative overflow-hidden w-full bg-white text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-2xl hover:bg-red-50 transition-colors cursor-pointer select-none border-none outline-none"
                  style={{ touchAction: 'manipulation' }}
                >
                  {/* Expanding Ripple Circles */}
                  <AnimatePresence>
                    {ripples.map(ripple => (
                      <motion.span
                        key={ripple.id}
                        initial={{ scale: 0, opacity: 0.8 }}
                        animate={{ scale: 6, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute rounded-full bg-red-600/30 pointer-events-none block"
                        style={{
                          width: '100px',
                          height: '100px',
                          left: ripple.x - 50,
                          top: ripple.y - 50,
                        }}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Concentric ambient glowing feedback rings */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
                    <span className="w-11/12 h-5/6 rounded-xl border border-red-200/20 absolute animate-ping opacity-50" />
                  </div>

                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Phone className="w-5 h-5 animate-pulse" />
                    <span>CALL AMBULANCE</span>
                  </span>
                </motion.button>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10 rotate-12">
                <AmbulanceIcon size={180} />
              </div>
            </section>

            {/* AI First Aid Assistant */}
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Stethoscope size={18} />
                </div>
                <h3 className="font-bold">AI First Aid Guide</h3>
              </div>
              <form onSubmit={handleFirstAidSearch} className="relative">
                <input 
                  type="text" 
                  placeholder="Ask for first aid (e.g. Choking, Burn)"
                  className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={firstAidQuery}
                  onChange={(e) => setFirstAidQuery(e.target.value)}
                />
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2 top-2 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center disabled:opacity-50"
                >
                  {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search size={18} />}
                </button>
              </form>

              <AnimatePresence>
                {firstAidResponse && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 p-4 bg-indigo-50 rounded-2xl overflow-hidden"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Instructions</span>
                      <button onClick={() => setFirstAidResponse(null)} className="text-indigo-400 hover:text-indigo-600">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="prose prose-sm prose-indigo max-w-none text-slate-700">
                      <Markdown>{firstAidResponse}</Markdown>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <Activity size={14} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">ICU Beds</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-indigo-600">12</span>
                  <span className="text-xs text-slate-400">Available</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 text-slate-500 mb-1">
                  <AmbulanceIcon size={14} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">Ambulances</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-emerald-600">8</span>
                  <span className="text-xs text-slate-400">Nearby</span>
                </div>
              </div>
            </div>

            {/* Nearby Hospitals Preview */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Nearby Hospitals</h3>
                <button 
                  onClick={() => setActiveTab('hospitals')}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {MOCK_HOSPITALS.slice(0, 2).map((hospital) => (
                  <HospitalCard key={hospital.id} hospital={hospital} />
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'hospitals' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Hospital Availability</h2>
              <div className="flex gap-2">
                <button className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600">
                  <Search size={18} />
                </button>
              </div>
            </div>
            {MOCK_HOSPITALS.map((hospital) => (
              <HospitalCard key={hospital.id} hospital={hospital} detailed />
            ))}
          </motion.div>
        )}

        {activeTab === 'ambulances' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl font-bold">Nearby Ambulances</h2>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 animate-pulse tracking-wide uppercase">
                Interactive GPS
              </span>
            </div>
            
            <div className="h-64 rounded-3xl overflow-hidden mb-6 relative shadow-sm border border-slate-200">
              <InteractiveMap 
                userLocation={location}
                hospitals={MOCK_HOSPITALS}
                ambulances={MOCK_AMBULANCES}
                selectedAmbulanceId={selectedAmbulanceId}
                onSelectHospital={(hospital) => {
                  setNotification({
                    message: `Selected ${hospital.name}. Live capacity: ${hospital.icuBeds.available} ICU beds and ${hospital.generalBeds.available} general beds available currently.`,
                    type: 'success'
                  });
                }}
                onSelectAmbulance={(ambulance) => {
                  setSelectedAmbulanceId(ambulance.id);
                  setNotification({
                    message: `Booking dispatch on vehicle ${ambulance.plateNumber} (ETA: ${ambulance.eta}). Connecting to driver ${ambulance.driverName}...`,
                    type: 'success'
                  });
                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    try {
                      navigator.vibrate([120, 60, 120]);
                    } catch (_) {}
                  }
                  setTimeout(() => {
                    setIsEmergencyMode(true);
                  }, 1200);
                }}
              />
            </div>
            
            {MOCK_AMBULANCES.map((amb) => (
              <AmbulanceCard 
                key={amb.id} 
                ambulance={amb} 
                isSelected={selectedAmbulanceId === amb.id}
                onSelect={() => {
                  if (selectedAmbulanceId === amb.id) {
                    setSelectedAmbulanceId(null);
                  } else {
                    setSelectedAmbulanceId(amb.id);
                    setNotification({
                      message: `Aesthetic dynamic routing initialized from ${amb.type} Unit (${amb.plateNumber}) directly to your current coordinates.`,
                      type: 'info'
                    });
                  }
                }}
              />
            ))}
          </motion.div>
        )}

        {activeTab === 'profile' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="text-center py-4">
              <div className="w-24 h-24 bg-indigo-100 rounded-full mx-auto mb-4 flex items-center justify-center text-indigo-600">
                <User size={48} />
              </div>
              <h2 className="text-2xl font-bold">{MOCK_USER.name}</h2>
              <p className="text-slate-500">Emergency Health Profile</p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest block mb-1">Blood Group</span>
                  <span className="text-2xl font-bold text-red-700">{MOCK_USER.bloodGroup}</span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Age</span>
                  <span className="text-2xl font-bold text-slate-800">28</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Allergies</span>
                <div className="flex flex-wrap gap-2">
                  {MOCK_USER.allergies.map(a => (
                    <span key={a} className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-100">{a}</span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Emergency Contacts</span>
                {MOCK_USER.emergencyContacts.map(c => (
                  <div key={c.phone} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="font-bold text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.relation}</p>
                    </div>
                    <button className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-indigo-600">
                      <Phone size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg">
              Edit Medical ID
            </button>
          </motion.div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-200 px-6 py-4 flex items-center justify-between z-50">
        <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Activity size={24} />} label="Home" />
        <NavButton active={activeTab === 'hospitals'} onClick={() => setActiveTab('hospitals')} icon={<HospitalIcon size={24} />} label="Beds" />
        <NavButton active={activeTab === 'ambulances'} onClick={() => setActiveTab('ambulances')} icon={<AmbulanceIcon size={24} />} label="Rescue" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<User size={24} />} label="Profile" />
      </nav>

      {/* Emergency Modal */}
      <AnimatePresence>
        {isEmergencyMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-red-600 flex flex-col items-center justify-center p-8 text-white text-center"
          >
            <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center mb-8 emergency-pulse">
              <Phone size={64} />
            </div>
            <h2 className="text-4xl font-black mb-4">Connecting...</h2>
            <p className="text-red-100 text-lg mb-12">We are locating the nearest ambulance and sharing your medical ID.</p>
            
            <div className="w-full max-w-xs space-y-4">
              <div className="bg-white/10 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-red-600">
                  <Navigation size={24} />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase opacity-60">Your Location</p>
                  <p className="font-bold text-sm truncate">Current Location Detected</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEmergencyMode(false)}
                className="w-full py-4 bg-white text-red-600 font-bold rounded-2xl shadow-xl"
              >
                CANCEL CALL
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HospitalCard({ hospital, detailed = false }: { hospital: Hospital, detailed?: boolean }) {
  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 hover:border-indigo-200 transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{hospital.name}</h4>
          <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
            <MapPin size={12} />
            <span>{hospital.distance} • {hospital.address}</span>
          </div>
        </div>
        <div className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-[10px] font-bold">
          {hospital.rating} ★
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn(
          "p-3 rounded-2xl border relative overflow-hidden",
          hospital.icuBeds.available > 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
        )}>
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-widest",
              hospital.icuBeds.available > 0 ? "text-emerald-600" : "text-red-600"
            )}>ICU Beds</span>
            <div className="flex items-center gap-1">
              <div className={cn(
                "w-1 h-1 rounded-full animate-pulse",
                hospital.icuBeds.available > 0 ? "bg-emerald-500" : "bg-red-500"
              )} />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Live</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-lg font-bold",
              hospital.icuBeds.available > 0 ? "text-emerald-700" : "text-red-700"
            )}>{hospital.icuBeds.available}</span>
            <span className="text-[10px] text-slate-400">/ {hospital.icuBeds.total}</span>
          </div>
        </div>
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">General</span>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-slate-400 rounded-full animate-pulse" />
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Live</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-slate-700">{hospital.generalBeds.available}</span>
            <span className="text-[10px] text-slate-400">/ {hospital.generalBeds.total}</span>
          </div>
        </div>
      </div>

      {detailed && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex gap-1">
            {hospital.specialties.slice(0, 2).map(s => (
              <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">{s}</span>
            ))}
          </div>
          <button className="text-indigo-600 p-2 bg-indigo-50 rounded-xl">
            <Phone size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function AmbulanceCard({ 
  ambulance, 
  isSelected = false, 
  onSelect 
}: { 
  ambulance: Ambulance; 
  isSelected?: boolean; 
  onSelect?: () => void; 
}) {
  return (
    <div 
      onClick={onSelect}
      className={cn(
        "p-5 rounded-3xl shadow-sm border flex items-center gap-4 transition-all duration-300 cursor-pointer select-none",
        isSelected 
          ? "bg-rose-50/30 border-rose-500 ring-2 ring-rose-500/10 shadow-md scale-[1.01]" 
          : "bg-white border-slate-100 hover:border-slate-200"
      )}
    >
      <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
        <AmbulanceIcon size={28} />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-bold text-slate-800">{ambulance.type} Unit</h4>
            <p className="text-[10px] text-slate-400 font-medium">{ambulance.plateNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-indigo-600 leading-none">{ambulance.eta}</p>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">ETA</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
            <Navigation size={10} />
            <span>{ambulance.distance} away</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>{ambulance.status}</span>
          </div>
        </div>
      </div>
      <button className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-indigo-600 scale-110" : "text-slate-400"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}
