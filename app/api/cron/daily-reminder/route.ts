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

      if (data.has_placeholders) {
        // Fetch jobs, users, and tokens
        const jobsSnap = await getDocs(
          query(collection(db, 'assigned_jobs'), where('status', '==', 'pending'))
        );
        const jobsByTech = new Map<string, any[]>();
        jobsSnap.forEach(jsnap => {
          const job = jsnap.data();
          const techName = (job.assigned_to as string)?.trim() || '';
          if (!techName) return;
          if (!jobsByTech.has(techName)) jobsByTech.set(techName, []);
          jobsByTech.get(techName)!.push(job);
        });

        const usersSnap = await getDocs(collection(db, 'users'));
        const allUsers = usersSnap.docs.map((d: any) => d.data());

        const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
        const fcmTokensWithInfo = tokensSnap.docs
          .map((d: any) => d.data())
          .filter((d: any) => {
            if (data.target === 'all') return true;
            if (data.target === 'admin_auditor') return d.role === 'admin' || d.role === 'auditor';
            if (data.target === 'staff') {
              if (Array.isArray(data.selected_staff) && data.selected_staff.length > 0) {
                return d.role === 'staff' && data.selected_staff.includes(d.username);
              }
              return d.role === 'staff';
            }
            return true;
          })
          .map((d: any) => ({
            token: d.token as string,
            username: d.username as string,
            name: d.name as string || d.username as string || 'unknown'
          }))
          .filter((t: any) => t.token);

        // Group by username
        const tokensByUser = new Map<string, typeof fcmTokensWithInfo>();
        fcmTokensWithInfo.forEach((t: any) => {
          if (!tokensByUser.has(t.username)) {
            tokensByUser.set(t.username, []);
          }
          tokensByUser.get(t.username)!.push(t);
        });

        let totalSuccessCount = 0;
        const sentToNames: string[] = [];

        for (const [username, userTokens] of tokensByUser.entries()) {
          if (userTokens.length === 0) continue;

          const user = allUsers.find(u => u.username === username);
          const techName = user?.name || userTokens[0].name || username;

          // Resolve pending jobs for this technician
          const userSuffix = getEnglishNameSuffix(techName);
          const jobs: any[] = [];
          jobsByTech.forEach((jobList, techKey) => {
            if (techKey === techName || techKey === username) {
              jobs.push(...jobList);
              return;
            }
            const techSuffix = getEnglishNameSuffix(techKey);
            if (userSuffix && techSuffix && userSuffix === techSuffix) {
              jobs.push(...jobList);
            }
          });

          const totalJobs = jobs.length;

          // Skip sending if the message has task placeholders and this tech has 0 tasks
          const hasTaskPlaceholders =
            data.title.includes('{งานค้าง}') || data.title.includes('{tasks}') ||
            data.title.includes('{งานติดตั้ง}') || data.title.includes('{ins_tasks}') ||
            data.title.includes('{งานบริการ}') || data.title.includes('{as_tasks}') ||
            data.body.includes('{งานค้าง}') || data.body.includes('{tasks}') ||
            data.body.includes('{งานติดตั้ง}') || data.body.includes('{ins_tasks}') ||
            data.body.includes('{งานบริการ}') || data.body.includes('{as_tasks}');

          if (hasTaskPlaceholders && totalJobs === 0) {
            continue;
          }

          const insJobs = jobs.filter(j => j.job_type?.includes('INS') || j.job_type === 'งานติดตั้ง (INS)').length;
          const asJobs = jobs.filter(j => !(j.job_type?.includes('INS') || j.job_type === 'งานติดตั้ง (INS)')).length;

          const resolvedTitle = data.title
            .replaceAll('{ช่าง}', techName)
            .replaceAll('{name}', techName)
            .replaceAll('{งานค้าง}', String(totalJobs))
            .replaceAll('{tasks}', String(totalJobs))
            .replaceAll('{งานติดตั้ง}', String(insJobs))
            .replaceAll('{ins_tasks}', String(insJobs))
            .replaceAll('{งานบริการ}', String(asJobs))
            .replaceAll('{as_tasks}', String(asJobs));

          const resolvedBody = data.body
            .replaceAll('{ช่าง}', techName)
            .replaceAll('{name}', techName)
            .replaceAll('{งานค้าง}', String(totalJobs))
            .replaceAll('{tasks}', String(totalJobs))
            .replaceAll('{งานติดตั้ง}', String(insJobs))
            .replaceAll('{ins_tasks}', String(insJobs))
            .replaceAll('{งานบริการ}', String(asJobs))
            .replaceAll('{as_tasks}', String(asJobs));

          // Save individual personal notification doc in Firestore
          const personalNotifRef = await addDoc(collection(db, 'notifications'), {
            title: resolvedTitle,
            body: resolvedBody,
            type: 'broadcast',
            category: data.category,
            category_label: data.category_label,
            target: data.target,
            user_id: username,
            created_by: data.created_by || 'admin',
            created_at: Timestamp.now(),
            sent: false,
            sent_count: 0,
          });

          const pushRes = await fetch(`${baseUrl}/api/push-notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: resolvedTitle,
              body: resolvedBody,
              url: '/notifications',
              serviceAccountJson: pushServiceAccount,
              tokens: userTokens,
              notifId: personalNotifRef.id,
            }),
          });
          const pushData = await pushRes.json();
          totalSuccessCount += pushData.successCount ?? 0;
          if (pushData.successCount > 0) {
            sentToNames.push(techName);
          }
        }

        // Update master record to mark sent
        await updateDoc(snap.ref, {
          sent: true,
          sent_count: totalSuccessCount,
          sent_to: sentToNames,
        });

        results.push(`Scheduled personalized broadcast "${data.title}": sent to ${totalSuccessCount} devices`);

      } else {
        const tokensSnap = await getDocs(collection(db, 'notification_tokens'));
        const fcmTokens = tokensSnap.docs
          .map(d => d.data())
          .filter(d => {
            if (data.target === 'all') return true;
            if (data.target === 'admin_auditor') return d.role === 'admin' || d.role === 'auditor';
            if (data.target === 'staff') {
              if (Array.isArray(data.selected_staff) && data.selected_staff.length > 0) {
                return d.role === 'staff' && data.selected_staff.includes(d.username);
              }
              return d.role === 'staff';
            }
            return true;
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
