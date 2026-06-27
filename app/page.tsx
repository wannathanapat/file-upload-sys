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

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-slate-50 font-sans">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(at_0%_0%,rgba(99,102,241,0.08)_0px,transparent_50%),radial-gradient(at_100%_100%,rgba(139,92,246,0.08)_0px,transparent_50%)] pointer-events-none z-0" />
      
      {/* Login Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white border border-slate-100/90 rounded-[2rem] p-8 shadow-[0_20px_50px_-15px_rgba(148,163,184,0.12)] z-10 relative overflow-hidden"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50/50 flex items-center justify-center p-2.5 mb-4 border border-indigo-100/40 shadow-xs">
            <img 
              src={systemSettings.app_logo || '/coway-logo-new.png'} 
              alt="Logo" 
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/coway-logo-new.png';
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-wide text-center Prompt leading-tight">
            {systemSettings.app_name}
          </h1>
          <p className="text-[10px] text-indigo-500 font-extrabold tracking-wider uppercase mt-1.5 text-center Prompt">
            {systemSettings.app_subtitle}
          </p>
        </div>

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100/80 rounded-2xl flex items-start gap-3"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700 font-medium Sarabun leading-relaxed">{errorMsg}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2 Prompt">
              รหัสพนักงาน (Username)
            </label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition placeholder-slate-400 Prompt"
                placeholder="กรอกรหัสพนักงานของคุณ"
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2 Prompt">
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition placeholder-slate-400 Prompt"
                placeholder="กรอกรหัสผ่าน"
                disabled={submitting}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-bold rounded-2xl transition duration-150 Prompt shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังเข้าสู่ระบบ...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>เข้าสู่ระบบจัดการงาน</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-[10px] text-slate-400 Sarabun leading-relaxed">
            เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบ<br />
            หากเปิดผ่านเบราว์เซอร์ปกติกรุณากรอกรหัสพนักงานเพื่อระบุสิทธิ์
          </p>
        </div>
      </motion.div>
    </div>
  );
}
