# DSC Chiangrai — COWAY AS & Installation System

## Project Overview
ระบบส่งงาน AS & Installation สำหรับช่างของ COWAY DSC Chiangrai
Deploy: Vercel → https://file-upload-sys.vercel.app

## Stack
- Next.js 16.x (App Router) — ⚠️ อ่าน AGENTS.md ก่อนเขียนโค้ดทุกครั้ง
- Firebase (Firestore + Auth + Storage)
- LINE LIFF 2.x — auth หลักของระบบ
- Tailwind CSS v4
- Google Drive API (lib/gdrive.ts)
- Telegram Bot (lib/telegram.ts)
- Excel import: xlsx library
- TypeScript

## โครงสร้างสำคัญ
```
app/          → pages (App Router)
components/   → UI components
lib/          → Firebase config, gdrive, telegram, utilities
public/       → static assets
dist/         → build output (อย่าแตะ)
backup-old-vanilla/ → ของเก่า (อย่าแตะ)
scratch/      → ทดลอง (อย่าแตะ)
```

## Firebase Rules
- ใช้ Firebase SDK modular API เท่านั้น — ห้ามใช้ compat
- Auth: LINE LIFF → getProfile() → map UID กับ Firestore
- Collections หลัก: jobs, technicians, settings
- ห้ามสร้าง collection ใหม่โดยไม่ออกแบบ schema ก่อน
- LIFF_ID และ Firebase config อยู่ใน .env.local เท่านั้น — ห้าม hardcode

## Error Messages
- ภาษาไทยเท่านั้น
- Format: "[สิ่งที่เกิดขึ้น] — [วิธีแก้]"
- ห้ามแสดง error code ดิบให้ผู้ใช้เห็น เช่น storage/unauthorized

## Token Efficiency (สำคัญ)
- อ่านเฉพาะไฟล์ที่เกี่ยวกับงานที่ถามเท่านั้น
- ถ้าไม่แน่ใจว่าต้องอ่านไฟล์ไหน → ถามก่อน อย่า scan เอง
- ทำทีละ feature อย่าแตะไฟล์ที่ไม่เกี่ยว
- ใช้ /compact เมื่อ context ยาว

## ห้ามทำ
- ห้ามใช้ Firebase compat API
- ห้าม hardcode LIFF_ID หรือ Firebase config
- ห้ามแตะ backup-old-vanilla/, scratch/, dist/
- ห้ามสร้าง Firestore collection ใหม่โดยไม่ได้ถามก่อน
- ห้ามแก้ไข package.json โดยไม่ได้รับอนุญาต
