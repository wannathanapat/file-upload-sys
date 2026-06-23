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
  ScanLine
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

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'auditor';

  const navItems = isAdmin ? [
    { name: systemSettings.menu_dashboard || 'ภาพรวมระบบ Dashboard', path: '/dashboard?view=overview', icon: LayoutDashboard },
    { name: systemSettings.menu_history || 'ประวัติส่งงาน', path: '/dashboard?view=history', icon: History },
    { name: systemSettings.menu_import || 'นำเข้างาน', path: '/import-jobs', icon: UploadCloud },
    { name: systemSettings.menu_settings || 'ตั้งค่าระบบ', path: '/settings', icon: Settings },
  ] : [
    { name: systemSettings.menu_submit || 'งานค้างส่งของฉัน', path: '/submit?tab=queue', icon: ScanLine },
    { name: 'ประวัติส่งงาน', path: '/submit?tab=history', icon: History },
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
          const isDashboardHistory = pathname === '/dashboard' && currentFullPath.includes('view=history');
          const isDashboardOverview = pathname === '/dashboard' && !currentFullPath.includes('view=history');
          
          let isActive = false;
          if (item.path.includes('/dashboard?view=history')) {
            isActive = isDashboardHistory;
          } else if (item.path.includes('/dashboard?view=overview')) {
            isActive = isDashboardOverview;
          } else {
            isActive = currentFullPath.startsWith(item.path.split('?')[0]);
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
        className="lg:hidden fixed bottom-5 left-1/2 z-50"
        style={{ x: '-50%' }}
        animate={{ y: showBottomNav ? 0 : 100, opacity: showBottomNav ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-xl shadow-slate-900/10 rounded-full px-3 py-2.5">
          {isAdmin ? (
            <>
              {/* 1: Dashboard - Queue tab */}
              <button
                onClick={() => goToDashboardTab('queue')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/dashboard' ? 'sidebar-active-bg sidebar-active-text shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="คิวงานวันนี้"
              >
                <LayoutGrid className="w-[22px] h-[22px]" strokeWidth={pathname === '/dashboard' ? 2.2 : 1.8} />
              </button>

              {/* 2: Import Jobs */}
              <button
                onClick={() => router.push('/import-jobs')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/import-jobs' ? 'sidebar-active-bg sidebar-active-text shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="นำเข้างาน"
              >
                <Package className="w-[22px] h-[22px]" strokeWidth={pathname === '/import-jobs' ? 2.2 : 1.8} />
              </button>

              {/* 3: Submit page (scan-like) */}
              <button
                onClick={() => router.push('/submit')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' ? 'sidebar-active-bg sidebar-active-text shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ส่งงาน"
              >
                <ScanLine className="w-[22px] h-[22px]" strokeWidth={1.8} />
              </button>

              {/* 4: Dashboard - Submissions history tab */}
              <button
                onClick={() => goToDashboardTab('submissions')}
                className="flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer text-slate-400 hover:text-slate-600"
                title="ประวัติส่งงาน"
              >
                <History className="w-[22px] h-[22px]" strokeWidth={1.8} />
              </button>

              {/* 5: Menu / Drawer toggle */}
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
              {/* Staff: งานค้างส่ง */}
              <button
                onClick={() => router.push('/submit?tab=queue')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' && currentFullPath.includes('queue') ? 'sidebar-active-bg sidebar-active-text shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="งานค้างส่ง"
              >
                <ScanLine className="w-[22px] h-[22px]" strokeWidth={pathname === '/submit' ? 2.2 : 1.8} />
              </button>

              {/* Staff: ประวัติส่งงาน */}
              <button
                onClick={() => router.push('/submit?tab=history')}
                className={`flex flex-col items-center justify-center w-12 h-10 rounded-full transition-all duration-200 cursor-pointer ${
                  pathname === '/submit' && currentFullPath.includes('history') ? 'sidebar-active-bg sidebar-active-text shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ประวัติส่งงาน"
              >
                <History className="w-[22px] h-[22px]" strokeWidth={1.8} />
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

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {isOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop filter */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={toggleSidebar}
            />

            {/* Sidebar drawer card */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10 flex flex-col"
            >
              <button
                onClick={toggleSidebar}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white z-20"
              >
                <X className="w-6 h-6" />
              </button>
              <SidebarContent />
            </motion.div>
          </div>
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
