'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Save, Target, Crosshair } from 'lucide-react';

interface GeofenceMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lat: number, lng: number, radius: number, name: string) => void;
  initialLat?: number;
  initialLng?: number;
  initialRadius?: number;
  initialName?: string;
}

// Leaflet is loaded via dynamic script injection (no npm install needed)
declare global {
  interface Window {
    L: any;
  }
}

export default function GeofenceMapModal({
  isOpen, onClose, onSave,
  initialLat = 19.9071, initialLng = 99.8314, initialRadius = 100, initialName = '',
}: GeofenceMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);
  const [radius, setRadius] = useState(initialRadius);
  const [name, setName] = useState(initialName);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [useGPS, setUseGPS] = useState(false);

  // Sync name when modal re-opens for a different location
  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  // Load Leaflet CSS + JS dynamically
  useEffect(() => {
    if (!isOpen) return;
    if (window.L) { setLeafletLoaded(true); return; }

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, [isOpen]);

  // Init map
  useEffect(() => {
    if (!isOpen || !leafletLoaded || !mapRef.current) return;
    if (leafletMapRef.current) return;

    const L = window.L;
    const map = L.map(mapRef.current).setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Custom blue pin icon
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;background:#2563eb;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(37,99,235,0.5)"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
    const circle = L.circle([lat, lng], {
      radius,
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(map);

    markerRef.current = marker;
    circleRef.current = circle;
    leafletMapRef.current = map;

    marker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      setLat(parseFloat(pos.lat.toFixed(6)));
      setLng(parseFloat(pos.lng.toFixed(6)));
      circle.setLatLng([pos.lat, pos.lng]);
    });

    map.on('click', (e: any) => {
      const pos = e.latlng;
      setLat(parseFloat(pos.lat.toFixed(6)));
      setLng(parseFloat(pos.lng.toFixed(6)));
      marker.setLatLng([pos.lat, pos.lng]);
      circle.setLatLng([pos.lat, pos.lng]);
    });

    return () => {
      map.remove();
      leafletMapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [isOpen, leafletLoaded]);

  // Update circle radius live
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  const handleUseCurrentLocation = () => {
    setUseGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLat = parseFloat(pos.coords.latitude.toFixed(6));
        const newLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(newLat);
        setLng(newLng);
        if (markerRef.current && circleRef.current && leafletMapRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
          circleRef.current.setLatLng([newLat, newLng]);
          leafletMapRef.current.setView([newLat, newLng], 17);
        }
        setUseGPS(false);
      },
      () => setUseGPS(false)
    );
  };

  const handleSave = () => {
    onSave(lat, lng, radius, name.trim() || 'ออฟฟิศ');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 Prompt">ตั้งค่าพิกัดออฟฟิศ</h3>
                <p className="text-[10px] text-slate-500 Prompt">แตะแผนที่หรือลากหมุดเพื่อเลือกตำแหน่ง</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Map */}
          <div className="mx-5 rounded-2xl overflow-hidden border border-blue-100 flex-shrink-0" style={{ height: 280 }}>
            {!leafletLoaded ? (
              <div className="w-full h-full flex items-center justify-center bg-blue-50">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-blue-600 Prompt">กำลังโหลดแผนที่...</p>
                </div>
              </div>
            ) : (
              <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            )}
          </div>

          {/* Controls */}
          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide Prompt">ชื่อพื้นที่</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ออฟฟิศหลัก, สาขาเชียงใหม่"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition"
              />
            </div>
            <button
              onClick={handleUseCurrentLocation}
              disabled={useGPS}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-xs rounded-xl border border-sky-200 transition active:scale-95 disabled:opacity-60 Prompt"
            >
              <Crosshair className={`w-3.5 h-3.5 ${useGPS ? 'animate-spin' : ''}`} />
              {useGPS ? 'กำลังระบุตำแหน่ง...' : 'ใช้ตำแหน่งปัจจุบัน'}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide Prompt">Latitude</label>
                <input
                  type="number"
                  value={isNaN(lat) ? '' : lat}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setLat(isNaN(v) ? lat : v);
                    if (isNaN(v)) return;
                    if (markerRef.current) markerRef.current.setLatLng([v, lng]);
                    if (circleRef.current) circleRef.current.setLatLng([v, lng]);
                    if (leafletMapRef.current) leafletMapRef.current.setView([v, lng]);
                  }}
                  step="0.000001"
                  placeholder="เช่น 19.907100"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide Prompt">Longitude</label>
                <input
                  type="number"
                  value={isNaN(lng) ? '' : lng}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setLng(isNaN(v) ? lng : v);
                    if (isNaN(v)) return;
                    if (markerRef.current) markerRef.current.setLatLng([lat, v]);
                    if (circleRef.current) circleRef.current.setLatLng([lat, v]);
                    if (leafletMapRef.current) leafletMapRef.current.setView([lat, v]);
                  }}
                  step="0.000001"
                  placeholder="เช่น 99.831400"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide Prompt flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  รัศมีที่อนุญาต
                </label>
                <span className="text-xs font-bold text-blue-600">{radius} เมตร</span>
              </div>
              <input
                type="range"
                min={3}
                max={500}
                step={1}
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>30 ม.</span><span>500 ม.</span>
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition active:scale-95 Prompt shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              บันทึกพิกัดออฟฟิศ
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
