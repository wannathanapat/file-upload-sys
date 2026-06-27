import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import {
  collection, getDocs, doc, getDoc, query, where,
  addDoc, updateDoc, Timestamp,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// GET /api/cron/daily-reminder
//
// Runs hourly via Vercel Cron (vercel.json: "0 * * * *").
// Does two jobs:
//   A) Every hour  — check & send scheduled broadcasts that are past due
//   B) 08:00 Thai (01:00 UTC) — send per-tech daily pending-job reminders
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Validate Vercel cron secret (set CRON_SECRET in Vercel env vars)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getDb();
  const now = new Date();
  const utcHour = now.getUTCHours();
  const results: string[] = [];
  const baseUrl = new URL(req.url).origin;

  // ── A. Send scheduled broadcasts that are past due ──────────────────────
  try {
    const settingsSnap = await getDoc(doc(db, 'app_config', 'system_settings'));
    const pushServiceAccount = settingsSnap.data()?.push_service_account as string | undefined;

    const broadcastsSnap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('sent', '==', false),
        where('type', '==', 'broadcast'),
      )
    );

    for (const snap of broadcastsSnap.docs) {
      const data = snap.data();
      if (!data.scheduled_at) continue;

      const scheduledTime: Date = data.scheduled_at.toDate
        ? data.scheduled_at.toDate()
        : new Date(data.scheduled_at);

      if (scheduledTime > now) continue; // not yet

      if (!pushServiceAccount) {
        results.push(`Scheduled broadcast "${data.title}": skipped (no service account)`);
        continue;
      }

      const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
      const fcmTokens = tokensSnap.docs
        .map(d => d.data())
        .filter(d => {
          if (data.target === 'all') return true;
          if (data.target === 'admin_auditor') return d.role === 'admin' || d.role === 'auditor';
          return d.role === 'staff';
        })
        .map(d => ({
          token: d.token as string,
          username: d.username as string,
          name: d.name as string || d.username as string || 'unknown'
        }))
        .filter(t => t.token);

      if (fcmTokens.length === 0) {
        await updateDoc(snap.ref, { sent: true, sent_count: 0 });
        results.push(`Scheduled broadcast "${data.title}": no tokens`);
        continue;
      }

      const pushRes = await fetch(`${baseUrl}/api/push-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          body: data.body,
          url: '/notifications',
          serviceAccountJson: pushServiceAccount,
          tokens: fcmTokens,
          notifId: snap.id,
        }),
      });
      const pushData = await pushRes.json();
      results.push(`Scheduled broadcast "${data.title}": sent to ${pushData.successCount ?? 0} devices`);
    }
  } catch (e: any) {
    results.push(`Scheduled broadcast error: ${e.message}`);
  }

  // ── B. Daily per-tech pending-job reminder ─────────────────────────────────
  // Check against send_hour_th from Firestore config (default 8 = 08:00 Thai = 01:00 UTC)
  try {
    const configSnap = await getDoc(doc(db, 'app_config', 'daily_reminder_settings'));
    const configData = configSnap.data() ?? {};
    const enabled = configData.enabled ?? false;
    const sendHourTh = (configData.send_hour_th as number) ?? 8;
    const customBody = (configData.custom_body as string)?.trim() ||
      'กรุณาเข้าระบบตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานให้ครบถ้วนด้วยครับ';
    // Thailand = UTC+7; convert Thai hour → UTC hour
    const targetUtcHour = ((sendHourTh - 7) + 24) % 24;

    if (utcHour !== targetUtcHour) {
      // Not time yet — nothing to do for part B
    } else if (!enabled) {
        results.push('Daily reminder: disabled');
      } else {
        const settingsSnap = await getDoc(doc(db, 'app_config', 'system_settings'));
        const pushServiceAccount = settingsSnap.data()?.push_service_account as string | undefined;

        if (!pushServiceAccount) {
          results.push('Daily reminder: no push_service_account in system settings');
        } else {
          // Fetch all pending jobs
          const jobsSnap = await getDocs(
            query(collection(db, 'assigned_jobs'), where('status', '==', 'pending'))
          );

          // Group by assigned_to
          const byTech = new Map<string, any[]>();
          jobsSnap.forEach(snap => {
            const job = snap.data();
            const techName = (job.assigned_to as string)?.trim() || '';
            if (!techName) return;
            if (!byTech.has(techName)) byTech.set(techName, []);
            byTech.get(techName)!.push(job);
          });

          if (byTech.size === 0) {
            results.push('Daily reminder: no pending jobs');
          } else {
            const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
            const allTokenDocs = tokensSnap.docs.map(d => d.data());

            const usersSnap = await getDocs(collection(db, 'users'));
            const allUsers = usersSnap.docs.map(d => d.data());

            let totalDevices = 0;

            for (const [techName, jobs] of byTech) {
              // Match token by name or username
              const user = allUsers.find(u => u.name === techName);
              const matchKeys = new Set<string>(
                [techName, user?.username].filter(Boolean) as string[]
              );

              const techTokens = allTokenDocs
                .filter(d => d.role === 'staff' && matchKeys.has(d.username))
                .map(d => ({
                  token: d.token as string,
                  username: d.username as string,
                  name: d.name as string || d.username as string || 'unknown'
                }))
                .filter(t => t.token);

              if (techTokens.length === 0) continue;

              const ins = jobs.filter(j => j.job_type === 'งานติดตั้ง (INS)').length;
              const as  = jobs.filter(j => j.job_type !== 'งานติดตั้ง (INS)').length;

              let title: string;
              let body: string;
              if (ins > 0 && as === 0) {
                title = `📋 คุณมีงานติดตั้ง (INS) ค้างส่ง ${ins} รายการ`;
                body  = customBody;
              } else if (as > 0 && ins === 0) {
                title = `📋 คุณมีงานบริการ (AS) ค้างส่ง ${as} รายการ`;
                body  = customBody;
              } else {
                title = `📋 คุณมีงานค้างส่ง ${ins + as} รายการ`;
                body  = `INS ${ins} รายการ · AS ${as} รายการ — ${customBody}`;
              }

              const notifRef = await addDoc(collection(db, 'notifications'), {
                title,
                body,
                type: 'daily_reminder',
                category: 'announce',
                category_label: 'แจ้งเตือนรายวัน',
                target: 'staff',
                technician: techName,
                created_at: Timestamp.now(),
                sent: false,
                sent_count: 0,
              });

              const pushRes = await fetch(`${baseUrl}/api/push-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title,
                  body,
                  url: '/notifications',
                  serviceAccountJson: pushServiceAccount,
                  tokens: techTokens,
                  notifId: notifRef.id,
                }),
              });
              const pushData = await pushRes.json();
              totalDevices += pushData.successCount ?? 0;
            }

            results.push(`Daily reminder: ${byTech.size} techs, ${totalDevices} devices`);
          }
        }
      }
  } catch (e: any) {
    results.push(`Daily reminder error: ${e.message}`);
  }

  return NextResponse.json({ ok: true, utcHour, results });
}
