'use client';

import React from 'react';
import Sidebar from '@/components/sidebar';
import { useApp } from '@/app/providers';
import TechnicianView from './TechnicianView';
import AdminView from './AdminView';

export default function AttendancePage() {
  const { currentUser } = useApp();

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'auditor';

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 font-sans">
      <Sidebar />
      <main className="flex-grow pt-16 lg:pt-0 overflow-y-auto">
        {isAdmin ? <AdminView /> : <TechnicianView />}
      </main>
    </div>
  );
}
