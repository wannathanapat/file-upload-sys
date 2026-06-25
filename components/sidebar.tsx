'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { 
  LayoutDashboard, 
  UploadCloud, 
  Settings, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  User,
  LayoutGrid,
  Package,
  History,
  ScanLine,
  Clock,
  ChevronRight,
  Bell,
  Megaphone,
  ClipboardCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function SidebarInner() {
  const { currentUser, logout, systemSettings } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const lastScrollY = useRef(0);

  // Build full current path+query for active matching
  const currentFullPath = `${pathname}${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  // Scroll-hide detection – listens on window for the main content area
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current + 6) {
        // Scrolling down: hide
        setShowBottomNav(false);
      } else if (currentY < lastScrollY.current - 4 || currentY < 40) {
        // Scrolling up or near top: show
        setShowBottomNav(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close sidebar drawer automatically on page/tab navigation changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname, searchParams]);

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'auditor';

  const navItems = isAdmin ? [
    { name: 'ภาพรวมระบบและสถิติ', path: '/dashboard?view=overview', icon: LayoutDashboard },
    { name: 'ประวัติส่งงานช่าง', path: '/dashboard?view=history', icon: History },
    { name: 'รายการงานค้างส่ง', path: '/dashboard?view=queue', icon: Clock },
    { name: 'ส่งงานแทนช่าง', path: '/submit?tab=dashboard', icon: ScanLine },
    { name: 'ประวัติการแจ้งเตือน', path: '/notifications', icon: Bell },
    { name: 'บรอดคาสต์ประชาสัมพันธ์', path: '/broadcast', icon: Megaphone },
    { name: systemSettings.menu_import || 'นำเข้าและจัดสรรงาน', path: '/import-jobs', icon: UploadCloud },
    { name: systemSettings.menu_settings || 'ตั้งค่าระบบหลัก', path: '/settings', icon: Settings },
    { name: 'ระบบลงเวลาช่าง', path: '/attendance', icon: ClipboardCheck },
  ] : [
    { name: 'แผงควบคุมผลงาน', path: '/submit?tab=dashboard', icon: LayoutDashboard },
    { name: 'รายการงานค้างส่ง', path: '/submit?tab=queue', icon: ScanLine },
    { name: 'ประวัติการส่งงาน', path: '/submit?tab=history', icon: History },
    { name: 'ประวัติการแจ้งเตือน', path: '/notifications', icon: Bell },
    { name: 'ลงเวลาเข้างาน', path: '/attendance', icon: ClipboardCheck },
  ];

  const toggleSidebar = () => setIsOpen(!isOpen);

  const getInitials = (name: string) => {
    return name ? name.trim().charAt(0).toUpperCase() : '?';
  };

  // Navigate to dashboard with a specific tab selected
  const goToDashboardTab = (tab: 'submissions' | 'queue') => {
    router.push(`/dashboard?tab=${tab}`);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full sidebar-bg sidebar-text transition-all duration-300">
      {/* Branding Header */}
      <div className="flex flex-col items-center p-6 border-b border-current/10">
        <div className="relative w-14 h-14 rounded-2xl bg-current/5 flex items-center justify-center p-2 mb-3 border border-current/10">
          {systemSettings.app_logo ? (
            <img 
              src={systemSettings.app_logo} 
              alt="Logo" 
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/coway-logo-new.png';
              }}
            />
          ) : (
            <span className="text-lg font-black text-indigo-400">CW</span>
          )}
        </div>
        <h2 className="text-sm font-bold sidebar-active-text tracking-wide text-center Prompt leading-tight">
          {systemSettings.app_name}
        </h2>
        <p className="text-[9px] opacity-60 font-semibold tracking-wider uppercase mt-1 text-center Prompt">
          {systemSettings.app_subtitle}
        </p>
      </div>
 
      {/* User Info Profile Panel */}
      <div className="p-3 mx-4 mt-5 bg-current/5 rounded-2xl border border-current/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-current/10 text-current font-bold flex items-center justify-center text-sm border border-current/15">
          {getInitials(currentUser.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-current opacity-90 truncate Prompt leading-none">{currentUser.name}</p>
          <p className="text-[9px] text-current opacity-70 font-extrabold uppercase mt-1 Prompt">
            {currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : 
             currentUser.role === 'auditor' ? 'ผู้ตรวจสอบ' : 'ช่างเทคนิค'}
          </p>
        </div>
      </div>
 
      {/* Navigation Items */}
      <nav className="flex-grow mt-6 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          let isActive = false;
          if (item.path.includes('?')) {
            const [itemPath, itemQuery] = item.path.split('?');
            const searchParamName = itemQuery.split('=')[0];
            const searchParamValue = itemQuery.split('=')[1];
            const currentParamValue = searchParams.get(searchParamName);
            
            if (pathname === '/submit' && itemPath === '/submit') {
              const activeTab = currentParamValue || 'dashboard';
              isActive = activeTab === searchParamValue;
            } else if (pathname === '/dashboard' && itemPath === '/dashboard') {
              const activeView = currentParamValue || 'overview';
              isActive = activeView === searchParamValue;
            } else {
              isActive = (pathname === itemPath) && (currentParamValue === searchParamValue);
            }
          } else {
            isActive = pathname === item.path;
          }
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition duration-150 Prompt sidebar-link-item ${
                isActive
                  ? 'sidebar-active-bg sidebar-active-text shadow-sm shadow-indigo-900/10 font-bold'
                  : 'sidebar-text sidebar-hover-bg'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
 
      {/* Logout Action */}
      <div className="p-4 border-t border-current/10">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-400/90 sidebar-hover-bg hover:text-rose-200 transition duration-150 Prompt w-full text-left"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </div>
  );

  const MobileMenuContent = () => {
    const subLabels: { [key: string]: string } = {
      '/dashboard?view=overview': 'ภาพรวมและสถิติระบบ',
      '/dashboard?view=history': 'ประวัติการส่งงานช่าง',
      '/dashboard?view=queue': 'คิวใบงานค้างส่งระบบ',
      '/import-jobs': 'นำเข้าและจัดสรรงาน',
      '/settings': 'ตั้งค่าระบบหลัก',
      '/notifications': 'ประวัติ Push Notification',
      '/broadcast': 'ส่งประกาศและข่าวสาร',
      '/submit?tab=dashboard': 'ผลงานและสถิติสะสม',
      '/submit?tab=queue': 'ใบงานที่ต้องจัดส่ง',
      '/submit?tab=history': 'ประวัติส่งงานของฉัน',
      '/attendance': 'เช็คอิน / รายงานการลงเวลา',
    };

    const iconColors: { [key: string]: { bg: string, shadow: string } } = {
      '/dashboard?view=overview': { bg: 'bg-red-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(239,68,68,0.35)]' },
      '/dashboard?view=history': { bg: 'bg-violet-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(139,92,246,0.35)]' },
      '/dashboard?view=queue': { bg: 'bg-indigo-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(79,70,229,0.35)]' },
      '/submit?tab=dashboard': { bg: 'bg-red-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(239,68,68,0.35)]' },
      '/submit?tab=queue': { bg: 'bg-blue-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(59,130,246,0.35)]' },
      '/submit?tab=history': { bg: 'bg-purple-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(168,85,247,0.35)]' },
      '/notifications': { bg: 'bg-amber-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(245,158,11,0.35)]' },
      '/broadcast': { bg: 'bg-rose-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(244,63,94,0.35)]' },
      '/import-jobs': { bg: 'bg-blue-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(59,130,246,0.35)]' },
      '/settings': { bg: 'bg-slate-700 text-white', shadow: 'shadow-[0_8px_20px_rgba(51,65,85,0.35)]' },
      '/attendance': { bg: 'bg-teal-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(20,184,166,0.35)]' },
    };


    return (
      <div
        className="fixed inset-0 w-full h-full bg-[#f8fafc]/90 backdrop-blur-xl z-50 flex flex-col overflow-y-auto overflow-x-hidden px-6 py-6 font-sans relative"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* Soft glowing background blobs for glassmorphic depth */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] rounded-full bg-indigo-300/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[10%] right-[-10%] w-[65%] h-[45%] rounded-full bg-rose-300/15 blur-3xl pointer-events-none" />

        {/* Header Row */}
        <div className="flex justify-between items-center mb-6 relative z-10">
          <div>
            <h1 className="text-xl font-bold text-indigo-600 Prompt leading-tight">{systemSettings.app_name}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 Prompt">{systemSettings.app_subtitle}</p>
          </div>
          <button 
            onClick={toggleSidebar}
            className="w-10 h-10 bg-white/80 backdrop-blur-md border border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.03)] rounded-full flex items-center justify-center text-slate-400 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card (Glassmorphic) */}
        <div className="bg-white/70 backdrop-blur-md border border-white/50 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.03)] p-4 flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-white/95 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex items-center justify-center font-bold text-slate-600 text-base border border-slate-200/50">
              {getInitials(currentUser.name)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 Prompt leading-none">{currentUser.name}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="px-2 py-0.5 bg-blue-50/70 border border-blue-100/50 text-blue-600 font-extrabold rounded-lg text-[9px] uppercase tracking-wider Prompt">
                  {currentUser.role === 'admin' ? 'ADMIN' : 
                   currentUser.role === 'auditor' ? 'AUDITOR' : 'STAFF'}
                </span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse" />
              </div>
            </div>
          </div>
          
          <button 
            onClick={logout}
            className="w-10 h-10 bg-rose-50/80 hover:bg-rose-100/90 text-rose-500 border border-rose-100/50 shadow-sm rounded-2xl flex items-center justify-center transition active:scale-95"
            title="ออกจากระบบ"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Section Header */}
        <div className="flex items-center gap-2 mb-4 relative z-10">
          <span className="w-1 h-4 bg-indigo-500 rounded-full inline-block shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wide Prompt">Main Menu</h2>
        </div>

        {/* Menu Items Container - pb-28 to clear the bottom navigation bar */}
        <div className="flex-grow space-y-3 pb-28 relative z-10">
          {navItems.map((item) => {
            const colors = iconColors[item.path] || { bg: 'bg-indigo-500 text-white', shadow: 'shadow-[0_8px_20px_rgba(99,102,241,0.35)]' };
            const subLabel = subLabels[item.path] || 'Section';
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={toggleSidebar}
                className="bg-white/70 backdrop-blur-md border border-white/50 rounded-3xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.02)] flex items-center justify-between hover:shadow-[0_12px_35px_rgba(0,0,0,0.04)] active:scale-[0.99] transition duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 ${colors.bg} ${colors.shadow} rounded-2xl flex items-center justify-center flex-shrink-0 text-base`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 Prompt">{item.name}</p>
                    <p className="text-[9px] text-slate-400 font-semibold Sarabun mt-0.5">{subLabel}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </Link>
            );
          })}
        </div>
      </div>
    );
  };
 
  return (
    <>
      {/* Mobile Top Header bar (minimal - just logo + avatar) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 flex items-center justify-between z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <img 
            src={systemSettings.app_logo || '/coway-logo-new.png'} 
            alt="Logo" 
            className="w-7 h-7 object-contain" 
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/coway-logo-new.png';
            }}
          />
          <span className="text-slate-800 text-sm font-bold Prompt">{systemSettings.app_name}</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
          <span className="text-slate-600 font-bold text-xs">{getInitials(currentUser.name)}</span>
        </div>
      </div>

      {/* ─── Floating Pill Bottom Navigation (Mobile only) ─── */}
      <motion.div
        className="lg:hidden fixed bottom-5 left-1/2 z-[60]"
        style={{ x: '-50%' }}
        animate={{ y: showBottomNav ? 0 : 100, opacity: showBottomNav ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-xl shadow-slate-900/10 rounded-full px-3 py-2.5">
          {isAdmin ? (
            <>
              {/* 1: Dashboard - Overview */}
              <button
                onClick={() => router.push('/dashboard?view=overview')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/dashboard' && (searchParams.get('view') === 'overview' || !searchParams.get('view')) ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Dashboard"
              >
                <LayoutDashboard className="w-[22px] h-[22px]" strokeWidth={pathname === '/dashboard' && (searchParams.get('view') === 'overview' || !searchParams.get('view')) ? 2.2 : 1.8} />
              </button>

              {/* 2: Dashboard - Queue */}
              <button
                onClick={() => router.push('/dashboard?view=queue')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/dashboard' && searchParams.get('view') === 'queue' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="คิวงานค้าง"
              >
                <Clock className="w-[22px] h-[22px]" strokeWidth={pathname === '/dashboard' && searchParams.get('view') === 'queue' ? 2.2 : 1.8} />
              </button>

              {/* 3: Dashboard - History */}
              <button
                onClick={() => router.push('/dashboard?view=history')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/dashboard' && searchParams.get('view') === 'history' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ประวัติส่งงาน"
              >
                <History className="w-[22px] h-[22px]" strokeWidth={pathname === '/dashboard' && searchParams.get('view') === 'history' ? 2.2 : 1.8} />
              </button>

              {/* 4: Import Jobs */}
              <button
                onClick={() => router.push('/import-jobs')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/import-jobs' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="นำเข้างาน"
              >
                <UploadCloud className="w-[22px] h-[22px]" strokeWidth={pathname === '/import-jobs' ? 2.2 : 1.8} />
              </button>

              {/* 5: Attendance */}
              <button
                onClick={() => router.push('/attendance')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/attendance' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ลงเวลา"
              >
                <ClipboardCheck className="w-[22px] h-[22px]" strokeWidth={pathname === '/attendance' ? 2.2 : 1.8} />
              </button>

              {/* 6: Menu / Drawer toggle */}
              <button
                onClick={toggleSidebar}
                className="flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer text-slate-400 hover:text-slate-700"
                title="เมนู"
              >
                <Menu className="w-[22px] h-[22px]" strokeWidth={1.8} />
              </button>
            </>
          ) : (
            <>
              {/* Staff: Dashboard */}
              <button
                onClick={() => router.push('/submit?tab=dashboard')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' && (searchParams.get('tab') === 'dashboard' || !searchParams.get('tab')) ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Dashboard ช่าง"
              >
                <LayoutDashboard className="w-[22px] h-[22px]" strokeWidth={pathname === '/submit' && (searchParams.get('tab') === 'dashboard' || !searchParams.get('tab')) ? 2.2 : 1.8} />
              </button>

              {/* Staff: งานค้างส่ง */}
              <button
                onClick={() => router.push('/submit?tab=queue')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' && searchParams.get('tab') === 'queue' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="งานค้างส่ง"
              >
                <ScanLine className="w-[22px] h-[22px]" strokeWidth={pathname === '/submit' && searchParams.get('tab') === 'queue' ? 2.2 : 1.8} />
              </button>

              {/* Staff: ประวัติส่งงาน */}
              <button
                onClick={() => router.push('/submit?tab=history')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' && searchParams.get('tab') === 'history' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ประวัติส่งงาน"
              >
                <History className="w-[22px] h-[22px]" strokeWidth={pathname === '/submit' && searchParams.get('tab') === 'history' ? 2.2 : 1.8} />
              </button>

              {/* Staff: ลงเวลา */}
              <button
                onClick={() => router.push('/attendance')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/attendance' ? 'mobile-nav-active shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ลงเวลา"
              >
                <ClipboardCheck className="w-[22px] h-[22px]" strokeWidth={pathname === '/attendance' ? 2.2 : 1.8} />
              </button>

              {/* Staff: Drawer / profile */}
              <button
                onClick={toggleSidebar}
                className="flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer text-slate-400 hover:text-slate-700"
                title="เมนู"
              >
                <Menu className="w-[22px] h-[22px]" strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Mobile Drawer Navigation (Fullscreen slide-up) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="lg:hidden fixed inset-0 z-50 flex flex-col"
          >
            <MobileMenuContent />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:block w-72 h-screen sticky top-0 flex-shrink-0 shadow-xl border-r border-slate-200">
        <SidebarContent />
      </aside>
    </>
  );
}

export default function Sidebar() {
  return (
    <React.Suspense fallback={null}>
      <SidebarInner />
    </React.Suspense>
  );
}
