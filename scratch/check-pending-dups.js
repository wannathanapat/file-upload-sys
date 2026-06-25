/**
 * check-pending-dups.js
 *
 * วิเคราะห์ assigned_jobs ที่ซ้ำกับ submissions แล้ว
 * และให้ลบออกถ้าต้องการ
 *
 * วิธีใช้:
 *   node scratch/check-pending-dups.js            → ดูรายการซ้ำ (dry-run)
 *   node scratch/check-pending-dups.js --delete   → ลบจริง
 */

const firebaseModule = require('firebase/compat/app');
require('firebase/compat/firestore');
const firebase = firebaseModule.default || firebaseModule;

const firebaseConfig = {
  apiKey: "AIzaSyCn3Sthueb9jTqYt3xSbZUdsihuKRmSdtk",
  authDomain: "coway-upload-sys.firebaseapp.com",
  projectId: "coway-upload-sys",
  storageBucket: "coway-upload-sys.firebasestorage.app",
  messagingSenderId: "1033387119671",
  appId: "1:1033387119671:web:cad71a2ce09102e03d5bb2"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const shouldDelete = process.argv.includes('--delete');

async function main() {
  console.log("=================================================");
  console.log("  Duplicate Pending Job Checker");
  console.log(shouldDelete ? "  MODE: DELETE (จะลบจริง)" : "  MODE: DRY-RUN (แค่ดูรายการ ไม่ลบ)");
  console.log("=================================================\n");

  // 1. โหลด assigned_jobs ทั้งหมด
  const jobsSnap = await db.collection('assigned_jobs').get();
  console.log(`assigned_jobs ทั้งหมด: ${jobsSnap.size} รายการ`);

  // 2. โหลด submissions ทั้งหมด
  const subSnap = await db.collection('submissions').get();
  console.log(`submissions ทั้งหมด: ${subSnap.size} รายการ\n`);

  // สร้าง Map จาก submissions
  const submittedJobIds = new Set();
  const submittedOrderNos = new Set();
  const submittedFileTokens = new Set();

  subSnap.forEach(doc => {
    const d = doc.data();
    if (d.job_id && d.job_id !== '-' && d.job_id !== '') {
      submittedJobIds.add(d.job_id.trim().toLowerCase());
    }
    if (d.order_no && d.order_no !== '-' && d.order_no !== '') {
      submittedOrderNos.add(d.order_no.trim().toLowerCase());
    }
    // ดึง token ตัวเลขจากชื่อไฟล์ (งานเก่า Google Sheet ที่ไม่มี job_id)
    if (d.file_name) {
      const tokens = d.file_name.split(/[\s_.\-]+/);
      for (const token of tokens) {
        if (token && token.length >= 7 && /^\d+$/.test(token)) {
          submittedFileTokens.add(token.trim().toLowerCase());
        }
      }
    }
  });

  console.log(`job_id ที่ส่งแล้ว: ${submittedJobIds.size} รายการ`);
  console.log(`order_no ที่ส่งแล้ว: ${submittedOrderNos.size} รายการ`);
  console.log(`token จากชื่อไฟล์เก่า: ${submittedFileTokens.size} รายการ\n`);

  // 3. ตรวจ assigned_jobs ที่ซ้ำกับ submissions
  const toDelete = [];
  const summary = {
    byJobId: [],
    byOrderNo: [],
    byFileToken: [],
    alreadySubmitted: [],
  };

  jobsSnap.forEach(docSnap => {
    const d = docSnap.data();
    const jobId = d.job_id ? d.job_id.trim().toLowerCase() : '';
    const orderNo = d.order_no ? d.order_no.trim().toLowerCase() : '';
    const status = d.status || '';

    // A. status = submitted แล้ว (งานที่ส่งจากระบบใหม่) — ไม่ลบ แค่รายงาน
    if (status === 'submitted') {
      summary.alreadySubmitted.push({ id: docSnap.id, job_id: d.job_id, order_no: d.order_no, assigned_to: d.assigned_to });
      return;
    }

    // B. job_id ตรงกับ submission ที่มี job_id
    if (jobId && submittedJobIds.has(jobId)) {
      const reason = `job_id "${d.job_id}" ตรงกับ submission`;
      summary.byJobId.push({ id: docSnap.id, job_id: d.job_id, order_no: d.order_no, assigned_to: d.assigned_to, status, reason });
      toDelete.push({ id: docSnap.id, ref: docSnap.ref, reason });
      return;
    }

    // C. order_no ตรงกับ submission
    if (orderNo && orderNo !== '-' && submittedOrderNos.has(orderNo)) {
      const reason = `order_no "${d.order_no}" ตรงกับ submission`;
      summary.byOrderNo.push({ id: docSnap.id, job_id: d.job_id, order_no: d.order_no, assigned_to: d.assigned_to, status, reason });
      toDelete.push({ id: docSnap.id, ref: docSnap.ref, reason });
      return;
    }

    // D. order_no ตรงกับ token จากชื่อไฟล์เก่า (งานเก่า Google Sheet)
    if (orderNo && orderNo !== '-' && submittedFileTokens.has(orderNo)) {
      const reason = `order_no "${d.order_no}" ตรงกับ token ในชื่อไฟล์เก่า (Google Sheet เดิม)`;
      summary.byFileToken.push({ id: docSnap.id, job_id: d.job_id, order_no: d.order_no, assigned_to: d.assigned_to, status, reason });
      toDelete.push({ id: docSnap.id, ref: docSnap.ref, reason });
      return;
    }
  });

  // 4. แสดงผล
  console.log("--- รายการซ้ำที่ตรวจพบ ---\n");

  if (summary.alreadySubmitted.length > 0) {
    console.log(`[INFO] งานที่ status=submitted แล้ว (ไม่ต้องลบ): ${summary.alreadySubmitted.length} รายการ`);
    summary.alreadySubmitted.forEach(j => {
      console.log(`  * ${j.job_id || '(ไม่มี job_id)'} | order: ${j.order_no || '-'} | ช่าง: ${j.assigned_to}`);
    });
    console.log();
  }

  if (summary.byJobId.length > 0) {
    console.log(`[RED] ซ้ำ job_id (ควรลบ): ${summary.byJobId.length} รายการ`);
    summary.byJobId.forEach(j => {
      console.log(`  * ${j.job_id} | order: ${j.order_no || '-'} | ช่าง: ${j.assigned_to} | status: ${j.status}`);
    });
    console.log();
  }

  if (summary.byOrderNo.length > 0) {
    console.log(`[ORANGE] ซ้ำ order_no (ควรลบ): ${summary.byOrderNo.length} รายการ`);
    summary.byOrderNo.forEach(j => {
      console.log(`  * job_id: ${j.job_id || '(ว่าง)'} | order: ${j.order_no} | ช่าง: ${j.assigned_to} | status: ${j.status}`);
    });
    console.log();
  }

  if (summary.byFileToken.length > 0) {
    console.log(`[YELLOW] ซ้ำ order_no กับชื่อไฟล์เก่า (งาน Google Sheet): ${summary.byFileToken.length} รายการ`);
    summary.byFileToken.forEach(j => {
      console.log(`  * job_id: ${j.job_id || '(ว่าง)'} | order: ${j.order_no} | ช่าง: ${j.assigned_to} | status: ${j.status}`);
    });
    console.log();
  }

  console.log(`\nสรุป: พบรายการที่ควรลบทั้งหมด ${toDelete.length} รายการ\n`);

  if (toDelete.length === 0) {
    console.log("ไม่มีงานซ้ำ ข้อมูลสะอาด!");
    process.exit(0);
  }

  // 5. ลบจริงถ้า --delete
  if (shouldDelete) {
    console.log(`กำลังลบ ${toDelete.length} รายการ...`);
    const batchSize = 400;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const chunk = toDelete.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(item => batch.delete(item.ref));
      await batch.commit();
      console.log(`  ลบแล้ว ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}`);
    }
    console.log(`\nลบเรียบร้อย ${toDelete.length} รายการ!`);
  } else {
    console.log("ถ้าต้องการลบจริง ให้รันด้วย: node scratch/check-pending-dups.js --delete");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("เกิดข้อผิดพลาด:", err);
  process.exit(1);
});
