'use client';

import React, { useState } from 'react';
import { useApp } from './providers';
import { getDb } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, limit } from 'firebase/firestore';
import { KeyRound, User as UserIcon, Lock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

// Native SHA-256 helper matching CryptoJS output
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function LoginPage() {
  const { currentUser, setCurrentUser, systemSettings, showToast } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password reset states
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetUsername, setResetUsername] = useState('');
  const [resetIdCard, setResetIdCard] = useState('');
  const [resetBirthDate, setResetBirthDate] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showToast("กรุณากรอกรหัสพนักงานและรหัสผ่านให้ครบถ้วนนะคร้าบ ⚠️", "error");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const db = getDb();
      
      // Hash incoming password
      const hashedInputPass = await sha256(password);

      // System administrator hardcoded/pre-setup bypass
      if (username === 'admin' && password === 'admin') {
        const adminSession = {
          username: 'admin',
          name: 'System Admin (Bypass)',
          role: 'admin',
          status: 'active',
        };
        setCurrentUser(adminSession);
        showToast("ยินดีต้อนรับเข้าสู่ระบบจัดการงานครับ แอดมิน! 🔑", "success");
        setSubmitting(false);
        return;
      }

      // Check user seed - if Firestore has no users, create default admin
      const usersCol = collection(db, 'users');
      const sampleSnap = await getDocs(query(usersCol, limit(1)));
      
      if (sampleSnap.empty && username === 'admin' && password === 'admin') {
        const defaultAdmin = {
          username: 'admin',
          password: hashedInputPass,
          name: 'System Admin (Default)',
          role: 'admin',
          status: 'active',
        };
        await setDoc(doc(db, 'users', 'admin'), defaultAdmin);
        setCurrentUser(defaultAdmin);
        showToast("สร้างบัญชีผู้ดูแลระบบเริ่มต้นและเข้าสู่ระบบสำเร็จครับ 🚀", "success");
        setSubmitting(false);
        return;
      }

      // Query database
      const q = query(usersCol, where('username', '==', username.trim()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        
        if (userData.status !== 'active') {
          setErrorMsg("บัญชีผู้ใช้ของคุณถูกระงับการใช้งานชั่วคราว");
          showToast("เข้าสู่ระบบไม่สำเร็จ: บัญชีโดนระงับ ❌", "error");
          setSubmitting(false);
          return;
        }

        // Validate password
        if (userData.password === password || userData.password === hashedInputPass) {
          // Auto-upgrade simple text passwords to hashed in database
          if (userData.password === password) {
            await setDoc(doc(db, 'users', userData.username), { password: hashedInputPass }, { merge: true });
            userData.password = hashedInputPass;
          }
          
          setCurrentUser({ ...userData as any, _docId: userDoc.id });
          
          showToast(`สวัสดีครับคุณ ${userData.name.split(' ')[0]} ยินดีต้อนรับกลับเข้าสู่ระบบครับ! ✨`, "success");
        } else {
          setErrorMsg("รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง");
          showToast("เข้าสู่ระบบไม่สำเร็จ: รหัสผ่านผิด ❌", "error");
        }
      } else {
        setErrorMsg("ไม่พบชื่อผู้ใช้งานนี้ในระบบคิวงาน");
        showToast("เข้าสู่ระบบไม่สำเร็จ: ไม่พบชื่อผู้ใช้งาน ❌", "error");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("ระบบฐานข้อมูลขัดข้อง: " + err.message);
      showToast("ระบบขัดข้องกรุณาติดต่อผู้ดูแลระบบ 🛠️", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsername || !resetIdCard || !resetBirthDate) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน ⚠️", "error");
      return;
    }
    setResetLoading(true);
    try {
      const db = getDb();
      const q = query(collection(db, 'users'), where('username', '==', resetUsername.trim()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showToast("ไม่พบชื่อผู้ใช้งานนี้ ❌", "error");
        setResetLoading(false);
        return;
      }
      
      const userData = snap.docs[0].data();
      if (userData.idCard === resetIdCard.trim() && userData.birthDate === resetBirthDate) {
        setResetStep(2);
      } else {
        showToast("ข้อมูลยืนยันตัวตนไม่ถูกต้อง ❌", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetNewPassword) {
      showToast("กรุณากรอกรหัสผ่านใหม่ ⚠️", "error");
      return;
    }
    setResetLoading(true);
    try {
      const db = getDb();
      const hashedPass = await sha256(resetNewPassword);
      await setDoc(doc(db, 'users', resetUsername.trim()), { password: hashedPass }, { merge: true });
      showToast("รีเซ็ตรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ ✅", "success");
      setResetModalOpen(false);
      setResetStep(1);
      setResetUsername('');
      setResetIdCard('');
      setResetBirthDate('');
      setResetNewPassword('');
    } catch (err: any) {
      console.error(err);
      showToast("เกิดข้อผิดพลาด: " + err.message, "error");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#eef2f6] font-sans">
      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-[420px] bg-white rounded-[2rem] p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] z-10 relative flex flex-col items-center"
      >
        <div className="w-24 h-24 rounded-full bg-[#00a6e6] shadow-[0_10px_30px_rgba(0,166,230,0.4)] flex items-center justify-center mb-6 overflow-hidden">
          <img 
            src={systemSettings.app_logo || '/coway-logo-new.png'} 
            alt="Logo" 
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/coway-logo-new.png';
            }}
          />
        </div>
        
        <h1 className="text-2xl font-bold bg-gradient-to-r from-[#2d7df6] to-[#a855f7] bg-clip-text text-transparent mb-2 Prompt tracking-wide">
          Welcome Back
        </h1>
        <p className="text-[13px] text-slate-500 font-medium mb-8 Prompt text-center">
          {systemSettings.app_name || "CLB CRI Stock Management System"}
        </p>

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full mb-6 p-4 bg-rose-50 border border-rose-100/80 rounded-2xl flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-medium Sarabun leading-relaxed">{errorMsg}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="relative">
            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#f3f7fb] text-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition placeholder-slate-400 Prompt"
              placeholder="Username"
              disabled={submitting}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#f3f7fb] text-slate-700 rounded-xl pl-12 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition placeholder-slate-400 Prompt tracking-widest"
              placeholder="••••••••"
              disabled={submitting}
            />
          </div>

          <div className="flex items-center justify-between pt-2 pb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2d7df6] focus:ring-[#2d7df6]/30" />
              <span className="text-[12px] text-slate-500 font-medium Prompt">Remember me</span>
            </label>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); setResetModalOpen(true); }}
              className="text-[12px] text-[#2d7df6] font-medium hover:underline Prompt"
            >
              Forgot your password?
            </a>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-[#2d7df6] hover:bg-blue-600 disabled:bg-blue-400 text-white font-bold rounded-xl transition duration-200 shadow-[0_8px_20px_rgba(45,125,246,0.3)] flex items-center justify-center gap-2 Prompt tracking-wide"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>
      </motion.div>

      {/* Footer text outside the card */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full text-center">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest Prompt">
          © COWAY UP FILES BY WANNA THANAPATCHOKSAKUL
        </p>
      </div>

      {/* Forgot Password Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl"
          >
            <h2 className="text-xl font-bold text-slate-800 mb-2 Prompt">รีเซ็ตรหัสผ่าน</h2>
            <p className="text-sm text-slate-500 mb-6 Prompt">
              {resetStep === 1 
                ? "กรุณากรอกข้อมูลเพื่อยืนยันตัวตน" 
                : "ยืนยันตัวตนสำเร็จ กรุณาตั้งรหัสผ่านใหม่"}
            </p>

            {resetStep === 1 ? (
              <form onSubmit={handleVerifyReset} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 Prompt">ชื่อผู้ใช้ (Username)</label>
                  <input
                    type="text"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition Prompt"
                    placeholder="กรอกชื่อผู้ใช้ของคุณ"
                    disabled={resetLoading}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 Prompt">เลขบัตรประชาชน 13 หลัก</label>
                  <input
                    type="text"
                    maxLength={13}
                    value={resetIdCard}
                    onChange={(e) => setResetIdCard(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition Prompt"
                    placeholder="กรอกเลขบัตร 13 หลัก"
                    disabled={resetLoading}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 Prompt">วัน/เดือน/ปีเกิด</label>
                  <input
                    type="date"
                    value={resetBirthDate}
                    onChange={(e) => setResetBirthDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition Prompt"
                    disabled={resetLoading}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setResetModalOpen(false); setResetStep(1); }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition Prompt"
                    disabled={resetLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#2d7df6] hover:bg-blue-600 text-white font-bold rounded-xl transition Prompt flex justify-center items-center gap-2"
                    disabled={resetLoading}
                  >
                    {resetLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                    ยืนยันตัวตน
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 Prompt">รหัสผ่านใหม่</label>
                  <input
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d7df6]/20 transition Prompt"
                    placeholder="ตั้งรหัสผ่านใหม่"
                    disabled={resetLoading}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setResetModalOpen(false); setResetStep(1); }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition Prompt"
                    disabled={resetLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition Prompt flex justify-center items-center gap-2"
                    disabled={resetLoading}
                  >
                    {resetLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                    เปลี่ยนรหัสผ่าน
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
