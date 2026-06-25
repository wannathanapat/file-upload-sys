'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, MapPin, ChevronDown } from 'lucide-react';
import { THAILAND_PROVINCES } from './data/thailand-districts';

export type AttendanceStatus = 'absent' | 'personal_leave' | 'sick_leave' | 'onsite';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string; emoji: string }[] = [
  { value: 'absent', label: 'ขาดงาน', color: 'text-rose-600 bg-rose-50 border-rose-200', emoji: '🚫' },
  { value: 'personal_leave', label: 'ลากิจ', color: 'text-amber-600 bg-amber-50 border-amber-200', emoji: '📋' },
  { value: 'sick_leave', label: 'ลาป่วย', color: 'text-orange-600 bg-orange-50 border-orange-200', emoji: '🏥' },
  { value: 'onsite', label: 'ลงพื้นที่ต่างจังหวัด', color: 'text-sky-600 bg-sky-50 border-sky-200', emoji: '🗺️' },
];

interface AttendanceOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (status: AttendanceStatus, province?: string, district?: string, note?: string) => Promise<void>;
  employeeName: string;
  date: string;
  currentStatus?: string;
}

export default function AttendanceOverrideModal({
  isOpen, onClose, onSave, employeeName, date, currentStatus,
}: AttendanceOverrideModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus | ''>('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const provinces = THAILAND_PROVINCES;
  const districts = provinces.find(p => p.id === selectedProvince)?.districts ?? [];

  const handleProvinceChange = (id: string) => {
    setSelectedProvince(id);
    setSelectedDistrict('');
  };

  const handleSave = async () => {
    if (!selectedStatus) return;
    if (selectedStatus === 'onsite' && (!selectedProvince || !selectedDistrict)) return;
    setSaving(true);
    try {
      const provinceName = provinces.find(p => p.id === selectedProvince)?.name;
      await onSave(selectedStatus, provinceName, selectedDistrict, note);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSelectedStatus('');
    setSelectedProvince('');
    setSelectedDistrict('');
    setNote('');
  };

  const handleClose = () => { reset(); onClose(); };

  const canSave = selectedStatus &&
    (selectedStatus !== 'onsite' || (selectedProvince && selectedDistrict));

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 Prompt">แก้ไขสถานะ</h3>
              <p className="text-xs text-slate-500 Prompt mt-0.5">
                <span className="font-semibold text-blue-600">{employeeName}</span>
                {' '}วันที่ {new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button onClick={handleClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-6 space-y-3">
            {/* Status options */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide Prompt">เลือกสถานะ</label>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedStatus(opt.value);
                    if (opt.value !== 'onsite') { setSelectedProvince(''); setSelectedDistrict(''); }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition text-left ${
                    selectedStatus === opt.value
                      ? opt.color + ' border-opacity-100'
                      : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-sm font-semibold Prompt">{opt.label}</span>
                  {selectedStatus === opt.value && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">✓</span>
                  )}
                </button>
              ))}
            </div>

            {/* Cascading Dropdown for Onsite */}
            <AnimatePresence>
              {selectedStatus === 'onsite' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <div className="flex items-center gap-1.5 py-1">
                    <MapPin className="w-3 h-3 text-sky-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide Prompt">ระบุพื้นที่ปฏิบัติงาน</span>
                  </div>

                  {/* Province */}
                  <div className="relative">
                    <select
                      value={selectedProvince}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className="w-full appearance-none px-4 py-3 bg-sky-50 border border-sky-200 rounded-2xl text-sm text-slate-700 font-semibold Prompt pr-10 focus:outline-none focus:border-sky-400 transition"
                    >
                      <option value="">เลือกจังหวัด</option>
                      {provinces.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400 pointer-events-none" />
                  </div>

                  {/* District */}
                  <AnimatePresence>
                    {selectedProvince && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="relative"
                      >
                        <select
                          value={selectedDistrict}
                          onChange={(e) => setSelectedDistrict(e.target.value)}
                          className="w-full appearance-none px-4 py-3 bg-sky-50 border border-sky-200 rounded-2xl text-sm text-slate-700 font-semibold Prompt pr-10 focus:outline-none focus:border-sky-400 transition"
                        >
                          <option value="">เลือกอำเภอ</option>
                          {districts.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400 pointer-events-none" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Note */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide Prompt">หมายเหตุ (ไม่บังคับ)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="ระบุเหตุผลหรือหมายเหตุเพิ่มเติม..."
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-2xl resize-none focus:outline-none focus:border-blue-400 focus:bg-white transition Prompt placeholder:text-slate-300"
              />
            </div>

            {/* Actions */}
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-2xl text-sm transition active:scale-95 Prompt shadow-lg shadow-blue-500/30 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />บันทึก...</>
              ) : (
                <><Save className="w-4 h-4" />บันทึกสถานะ</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
