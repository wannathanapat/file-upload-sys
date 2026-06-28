import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase';
import { getEnglishNameSuffix } from '@/lib/utils';
import {
  collection, getDocs, doc, getDoc, query, where,
  addDoc, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// GET /api/cron/daily-reminder
//
// Runs daily via Vercel Cron (vercel.json: "0 1 * * *" = 08:00 Thai / 01:00 UTC).
// Does two jobs:
//   A) Check & send scheduled broadcasts that are past due
//   B) Send per-tech daily pending-job reminders (if enabled in daily_reminder_settings)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
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

  // ── A. Send scheduled broadcasts that are past due ────────────────────────
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

      if (scheduledTime > now) continue;

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
        .map(d => d.token as string)
        .filter(Boolean);

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

  // ── B. Daily per-tech pending-job reminder ────────────────────────────────
  // Fires every time this cron runs (once daily at 08:00 Thai / 01:00 UTC).
  // On/off controlled by daily_reminder_settings.enabled in Firestore.
  try {
    const configSnap = await getDoc(doc(db, 'app_config', 'daily_reminder_settings'));
    const configData = configSnap.data() ?? {};
    const enabled = configData.enabled ?? false;
    const customBody = (configData.custom_body as string)?.trim() ||
      'กรุณาเข้าระบบตรวจสอบคิวงานและอัปโหลดไฟล์ใบงานให้ครบถ้วนด้วยครับ';

    if (!enabled) {
      results.push('Daily reminder: disabled');
    } else {
      const settingsSnap = await getDoc(doc(db, 'app_config', 'system_settings'));
      const pushServiceAccount = settingsSnap.data()?.push_service_account as string | undefined;

      if (!pushServiceAccount) {
        results.push('Daily reminder: no push_service_account in system settings');
      } else {
        const jobsSnap = await getDocs(
          query(collection(db, 'assigned_jobs'), where('status', '==', 'pending'))
        );

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
          let skippedNoToken = 0;

          for (const [techName, jobs] of byTech) {
            const user = allUsers.find(u => 
              u.name === techName || 
              (getEnglishNameSuffix(u.name) && getEnglishNameSuffix(u.name) === getEnglishNameSuffix(techName))
            );
            const matchKeys = new Set<string>(
              [techName, user?.username].filter(Boolean) as string[]
            );

            const techTokens = allTokenDocs
              .filter(d => d.role === 'staff' && matchKeys.has(d.username))
              .map(d => d.token as string)
              .filter(Boolean);

            if (techTokens.length === 0) {
              skippedNoToken++;
              continue;
            }

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
              user_id: user?.username || techName,
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

            if (Array.isArray(pushData.staleTokens) && pushData.staleTokens.length > 0) {
              await Promise.allSettled(
                pushData.staleTokens.map((t: string) => deleteDoc(doc(db, 'notification_tokens', t)))
              );
            }
          }

          results.push(`Daily reminder: ${byTech.size} techs, ${totalDevices} devices sent, ${skippedNoToken} skipped (no token)`);
        }
      }
    }
  } catch (e: any) {
    results.push(`Daily reminder error: ${e.message}`);
  }

  return NextResponse.json({ ok: true, utcHour, results });
}
