/**
 * Seeds master data. Safe to run more than once (it only adds what is missing).
 *
 *   npm run seed                 -> uses MASTER_XLSX_PATH from .env
 *   npm run seed -- <path.xlsx>  -> uses the given file
 *
 * - Jamiats: one per sheet, except the first 3 summary sheets and "Committee Members".
 * - Jamaats: column A of each Jamiat sheet, starting from row 3 (rows 1-2 are headers).
 * - Activities: World Diabetes Day, ITNC.
 * - Super Admin: from SUPERADMIN_NAME / SUPERADMIN_MOBILE / SUPERADMIN_PASSWORD.
 */
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { connectDB } from '../config/db.js';
import Jamiat from '../models/Jamiat.js';
import Jamaat from '../models/Jamaat.js';
import Activity from '../models/Activity.js';
import User, { ROLES } from '../models/User.js';
import { normalizeMobile } from '../utils/mobile.js';

const SKIP_SHEETS = new Set(['all missing', 'structure not formed', 'structure formed', 'committee members']);
const FIRST_DATA_ROW = 3;

const DEFAULT_ACTIVITIES = [
  { name: 'World Diabetes Day', showInReport: true, showInFollowUp: true },
  { name: 'ITNC', showInReport: true, showInFollowUp: true },
];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

async function seedMasters(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.warn(`! Excel file not found (${filePath || 'MASTER_XLSX_PATH not set'}), skipping Jamiat/Jamaat import`);
    return;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  let newJamiats = 0;
  let newJamaats = 0;
  for (const ws of wb.worksheets) {
    if (SKIP_SHEETS.has(ws.name.trim().toLowerCase())) continue;
    const jamiatName = clean(ws.name);

    const jamiatRes = await Jamiat.updateOne(
      { name: jamiatName },
      { $setOnInsert: { name: jamiatName, isActive: true } },
      { upsert: true, collation: { locale: 'en', strength: 2 } }
    );
    newJamiats += jamiatRes.upsertedCount;
    const jamiat = await Jamiat.findOne({ name: jamiatName }).collation({ locale: 'en', strength: 2 });

    const names = new Set();
    for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
      const name = clean(ws.getRow(r).getCell(1).text);
      if (name) names.add(name);
    }
    for (const name of names) {
      const res = await Jamaat.updateOne(
        { jamiat: jamiat._id, name },
        { $setOnInsert: { jamiat: jamiat._id, name, isActive: true } },
        { upsert: true, collation: { locale: 'en', strength: 2 } }
      );
      newJamaats += res.upsertedCount;
    }
    console.log(`  ${jamiatName}: ${names.size} jamaats`);
  }
  console.log(`✓ Jamiats added: ${newJamiats}, Jamaats added: ${newJamaats}`);
}

async function seedActivities() {
  let added = 0;
  for (const a of DEFAULT_ACTIVITIES) {
    const res = await Activity.updateOne(
      { name: a.name },
      { $setOnInsert: { ...a, isActive: true } },
      { upsert: true, collation: { locale: 'en', strength: 2 } }
    );
    added += res.upsertedCount;
  }
  console.log(`✓ Activities added: ${added}`);
}

async function seedSuperAdmin() {
  const { SUPERADMIN_NAME, SUPERADMIN_MOBILE, SUPERADMIN_PASSWORD } = process.env;
  if (!SUPERADMIN_MOBILE || !SUPERADMIN_PASSWORD) {
    console.warn('! SUPERADMIN_MOBILE / SUPERADMIN_PASSWORD not set, skipping super admin');
    return;
  }
  const mobile = normalizeMobile(SUPERADMIN_MOBILE);
  if (!mobile) throw new Error('SUPERADMIN_MOBILE must be a valid 10-digit number');
  if (SUPERADMIN_PASSWORD.length < 6) throw new Error('SUPERADMIN_PASSWORD must be at least 6 characters');

  const existing = await User.findOne({ mobile });
  if (existing) {
    // Never overwrite an existing password (it may have been changed in the app).
    if (existing.role !== ROLES.SUPER_ADMIN || !existing.isActive) {
      existing.role = ROLES.SUPER_ADMIN;
      existing.isActive = true;
      existing.jamiats = [];
      await existing.save();
    }
    console.log(`✓ Super admin ${mobile} already exists`);
    return;
  }
  await User.create({
    name: SUPERADMIN_NAME?.trim() || 'Super Admin',
    mobile,
    password: await bcrypt.hash(SUPERADMIN_PASSWORD, 10),
    role: ROLES.SUPER_ADMIN,
  });
  console.log(`✓ Super admin ${mobile} created`);
}

async function main() {
  await connectDB();
  await Promise.all([Jamiat.syncIndexes(), Jamaat.syncIndexes(), Activity.syncIndexes(), User.syncIndexes()]);
  await seedMasters(process.argv[2] || process.env.MASTER_XLSX_PATH);
  await seedActivities();
  await seedSuperAdmin();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
