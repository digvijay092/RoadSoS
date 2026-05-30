import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Hospital, Ambulance } from '../types';

interface InteractiveMapProps {
  userLocation: { lat: number; lng: number } | null;
  hospitals: Hospital[];
  ambulances: Ambulance[];
  onSelectHospital?: (hospital: Hospital) => void;
  onSelectAmbulance?: (ambulance: Ambulance) => void;
  selectedAmbulanceId?: string | null;
}

export default function InteractiveMap({
  userLocation,
  hospitals,
  ambulances,
  onSelectHospital,
  onSelectAmbulance,
  selectedAmbulanceId
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routePolylineRef = useRef<L.FeatureGroup | null>(null);

  // Default coordinate center if user geolocation is absent
  const centerLat = userLocation?.lat ?? 12.9716;
  const centerLng = userLocation?.lng ?? 77.5946;

  // Helper to generate elegant curved polyline path if routing lookup fails/offline
  const generateSimulatedCurve = (start: [number, number], end: [number, number]): [number, number][] => {
    const points: [number, number][] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = start[0] + (end[0] - start[0]) * t;
      const lng = start[1] + (end[1] - start[1]) * t;
      
      // Introduce an elegant street-bend contour shape using a localized sine amplitude
      const bendScale = 0.0016;
      const curveOffset = Math.sin(t * Math.PI) * bendScale;
      const multiBendOffset = Math.cos(t * Math.PI * 2) * (bendScale * 0.4);
      
      points.push([lat + curveOffset + multiBendOffset, lng - curveOffset]);
    }
    return points;
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Reset map if already exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: false, // will add custom position below
      attributionControl: false // keep it minimal and neat
    });

    mapRef.current = map;

    // Add zoom buttons to bottom-right out of the way
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Add Tile layer (using elegant dark or cartridge tiles. Standard OpenStreetMap is robust)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [centerLat, centerLng]);

  // Effect to construct or update routing visual polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Erase any preexisting route geometry
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (!selectedAmbulanceId) return;

    const ambulance = ambulances.find(a => a.id === selectedAmbulanceId);
    if (!ambulance) return;

    const startLat = ambulance.lat;
    const startLng = ambulance.lng;
    const endLat = centerLat;
    const endLng = centerLng;

    let isCancelled = false;

    // Draw routing overlay lines
    const renderRouteLines = (latLngs: [number, number][]) => {
      if (isCancelled || !mapRef.current) return;

      // Outer backing glow trace line (Translucent Bold Crimson)
      const baseTrack = L.polyline(latLngs, {
        color: '#e11d48',
        weight: 6,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      });

      // Animated overlay line (glowing white marching trail)
      const animatedOverlay = L.polyline(latLngs, {
        color: '#ffffff',
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'route-line-animated' // hooks custom CSS dash-offset shift
      });

      const routeGroup = L.featureGroup([baseTrack, animatedOverlay]).addTo(mapRef.current);
      routePolylineRef.current = routeGroup;

      // Ease the map viewport context straight onto the active route span
      mapRef.current.fitBounds(routeGroup.getBounds().pad(0.22), {
        animate: true,
        duration: 1.0
      });
    };

    // Attempt retrieval from OpenStreetMap OSRM driving engine API
    fetch(`https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`)
      .then(res => {
        if (!res.ok) throw new Error("OSRM Server not reachable");
        return res.json();
      })
      .then(data => {
        if (isCancelled) return;
        if (data && data.routes && data.routes[0]) {
          const rawCoords = data.routes[0].geometry.coordinates; // [lng, lat]
          const mappedPoints = rawCoords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          renderRouteLines(mappedPoints);
        } else {
          // Robust curve-interpolated emergency fallback line
          const fallbackPath = generateSimulatedCurve([startLat, startLng], [endLat, endLng]);
          renderRouteLines(fallbackPath);
        }
      })
      .catch(() => {
        if (isCancelled) return;
        // Graceful contour-bends path offline simulation
        const fallbackPath = generateSimulatedCurve([startLat, startLng], [endLat, endLng]);
        renderRouteLines(fallbackPath);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedAmbulanceId, ambulances, centerLat, centerLng]);

  // Handle markers rendering and updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // 1. Add User Location Marker
    const userHtml = `
      <div class="relative flex items-center justify-center">
        <div class="w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-lg relative z-20"></div>
        <div class="w-8 h-8 bg-indigo-500/30 rounded-full absolute animate-ping z-10"></div>
      </div>
    `;
    const userIcon = L.divIcon({
      html: userHtml,
      className: 'custom-div-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    
    const userMarker = L.marker([centerLat, centerLng], { icon: userIcon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #1e293b; padding: 2px;">
          <strong style="color: #4f46e5; display: block; margin-bottom: 2px;">Your Location</strong>
          <span style="color: #64748b;">Emergency responder tracking initialized.</span>
        </div>
      `);
    markersRef.current.push(userMarker);

    // 2. Add Hospital Markers
    hospitals.forEach(hospital => {
      const hospitalHtml = `
        <div class="flex flex-col items-center">
          <div class="bg-indigo-600 text-white w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center font-bold text-xs ring-4 ring-indigo-500/10 hover:scale-110 transition-transform">
            H
          </div>
          <span class="bg-slate-900/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow mt-1 whitespace-nowrap">${hospital.name.slice(0, 10)}...</span>
        </div>
      `;
      const hospitalIcon = L.divIcon({
        html: hospitalHtml,
        className: 'custom-div-icon',
        iconSize: [40, 50],
        iconAnchor: [20, 25]
      });

      const marker = L.marker([hospital.lat, hospital.lng], { icon: hospitalIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px; color: #1e293b; width: 180px;">
            <strong style="color: #4f46e5; font-size: 14px; display: block; margin-bottom: 4px;">${hospital.name}</strong>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">${hospital.address}</div>
            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
              <div style="background: ${hospital.icuBeds.available > 0 ? '#ecfdf5' : '#fef2f2'}; border: 1px solid ${hospital.icuBeds.available > 0 ? '#a7f3d0' : '#fecaca'}; border-radius: 6px; padding: 4px 8px; flex: 1; text-align: center;">
                <span style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: ${hospital.icuBeds.available > 0 ? '#047857' : '#b91c1c'}; display: block;">ICU</span>
                <strong style="font-size: 13px; color: ${hospital.icuBeds.available > 0 ? '#065f46' : '#991b1b'};">${hospital.icuBeds.available}/${hospital.icuBeds.total}</strong>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; flex: 1; text-align: center;">
                <span style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #64748b; display: block;">General</span>
                <strong style="font-size: 13px; color: #334155;">${hospital.generalBeds.available}/${hospital.generalBeds.total}</strong>
              </div>
            </div>
            <button class="select-hospital-btn" style="width: 100%; background: #4f46e5; color: white; border: none; font-size: 11px; font-weight: bold; py: 6px; padding: 6px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
              Select Hospital
            </button>
          </div>
        `);

      marker.on('popupopen', () => {
        const btn = document.querySelector('.select-hospital-btn');
        if (btn && onSelectHospital) {
          btn.addEventListener('click', () => {
            onSelectHospital(hospital);
            marker.closePopup();
          });
        }
      });

      markersRef.current.push(marker);
    });

    // 3. Add Ambulance Markers
    ambulances.forEach(ambulance => {
      const isAvailable = ambulance.status === 'Available';
      const ambulanceHtml = `
        <div class="flex flex-col items-center">
          <div class="bg-rose-500 text-white w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-[12px] ring-4 ring-rose-500/10 hover:scale-110 transition-transform ${isAvailable ? 'animate-pulse' : ''}">
            🚨
          </div>
          <span class="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow mt-1 tracking-tight uppercase whitespace-nowrap">ETA ${ambulance.eta}</span>
        </div>
      `;
      const ambulanceIcon = L.divIcon({
        html: ambulanceHtml,
        className: 'custom-div-icon',
        iconSize: [40, 50],
        iconAnchor: [20, 25]
      });

      const marker = L.marker([ambulance.lat, ambulance.lng], { icon: ambulanceIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 13px; color: #1e293b; width: 170px;">
            <strong style="color: #e11d48; font-size: 14px; display: block; margin-bottom: 2px;">${ambulance.type} Ambulance</strong>
            <span style="font-size: 10px; color: #64748b; font-weight: bold; display: block; margin-bottom: 6px;">Plate: ${ambulance.plateNumber}</span>
            <div style="background: #fff1f2; border: 1px solid #ffe4e6; border-radius: 6px; padding: 6px; text-align: center; margin-bottom: 8px;">
              <span style="font-size: 9px; font-weight: bold; color: #be123c; display: block; text-transform: uppercase;">Estimated ETA</span>
              <strong style="font-size: 15px; color: #9f1239;">${ambulance.eta} (${ambulance.distance})</strong>
            </div>
            <div style="display: flex; align-items: center; justify-between; font-size: 11px; margin-bottom: 8px;">
              <span>Driver: <strong>${ambulance.driverName}</strong></span>
              <span style="margin-left: auto; background: ${isAvailable ? '#d1fae5' : '#fee2e2'}; color: ${isAvailable ? '#065f46' : '#991b1b'}; font-weight: bold; font-size: 9px; padding: 1px 6px; border-radius: 12px;">${ambulance.status}</span>
            </div>
            <button class="select-ambulance-btn" style="width: 100%; background: #e11d48; color: white; border: none; font-size: 11px; font-weight: bold; padding: 6px; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
              Request Emergency Dispatch
            </button>
          </div>
        `);

      marker.on('popupopen', () => {
        const btn = document.querySelector('.select-ambulance-btn');
        if (btn && onSelectAmbulance) {
          btn.addEventListener('click', () => {
            onSelectAmbulance(ambulance);
            marker.closePopup();
          });
        }
      });

      markersRef.current.push(marker);
    });

    // Fit map to include user location + close markers safely if space is available
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }, [hospitals, ambulances, centerLat, centerLng]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full z-10" />
      {/* Visual Overlay Indicators */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
          <span>GPS Tracking Active</span>
        </div>
      </div>
    </div>
  );
}
