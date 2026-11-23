import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { ROLES } from './models/User.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import activityRoutes from './routes/activities.js';
import masterRoutes from './routes/masters.js';
import reportRoutes from './routes/reports.js';
import followUpRoutes from './routes/followups.js';
import Report from './models/Report.js';
import FollowUp from './models/FollowUp.js';
import AuditLog from './models/AuditLog.js';
import auditRoutes from './routes/audit.js';
import { backfillEntries } from './models/entryActivity.js';

/**
 * Brings indexes in line with the current schema (only index definitions change, never data),
 * then prepares entries saved by older versions.
 */
async function prepareEntries() {
  for (const Model of [Report, FollowUp]) {
    try {
      await Model.syncIndexes();
      await backfillEntries(Model);
    } catch (err) {
      console.warn(`! Could not prepare ${Model.modelName}:`, err.message);
    }
  }
  await AuditLog.init().catch((err) => console.warn('! Audit log indexes:', err.message));
}

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set in .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
if (process.env.CLIENT_ORIGIN) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN.split(','), credentials: true }));
}
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, requireRole(ROLES.SUPER_ADMIN), userRoutes);
app.use('/api/activities', requireAuth, activityRoutes);
app.use('/api/masters', requireAuth, masterRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/followups', requireAuth, followUpRoutes);
app.use('/api/audit', requireAuth, requireRole(ROLES.SUPER_ADMIN), auditRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// In production, serve the built React app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Something went wrong' });
});

const port = Number(process.env.PORT) || 5000;
connectDB()
  .then(prepareEntries)
  .then(() => app.listen(port, () => console.log(`Server running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
