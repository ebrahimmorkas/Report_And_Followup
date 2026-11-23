# Report & Follow-up

MERN app for recording activities conducted in each Jamaat (**Report**) and activities planned for the future (**Follow-up**).

- **server/** – Express 5, Mongoose (MongoDB Atlas), JWT in an HttpOnly cookie
- **client/** – React 19 + Vite + Tailwind CSS

## Roles

| Role | Can do |
|---|---|
| **Super Admin** | Manage users (JC or Super Admin), assign Jamiats; manage Activities (Report / Follow-up / both); manage Jamiat & Jamaat masters; view all Report and Follow-up entries; export to Excel |
| **JC** (default) | Add / edit / delete Report and Follow-up entries for the Jamaats of their assigned Jamiats only |

Everyone can change their own password. Changing a password logs out the account's other sessions.

Mobile numbers are stored as 10 digits: `+91`, `91`, a leading `0`, spaces and dashes are removed.

## Setup

Requirements: Node.js 20+ and a MongoDB Atlas cluster.

```bash
# 1. Server
cd server
npm install
cp .env.example .env      # then fill in MONGODB_URI, JWT_SECRET, SUPERADMIN_MOBILE, SUPERADMIN_PASSWORD
npm run seed              # imports Jamiats/Jamaats from Excel, adds default activities, creates the super admin

# 2. Client
cd ../client
npm install
```

### Seeding

`npm run seed` reads the Excel file at `MASTER_XLSX_PATH` (or `npm run seed -- "path\to\file.xlsx"`):

- every sheet is a Jamiat, except **All Missing**, **Structure Not Formed**, **Structure Formed** and **Committee Members**
- Jamaat names are read from column A, starting at row 3

It also adds the activities **World Diabetes Day** and **ITNC** (enabled for both Report and Follow-up) and creates the super admin from `.env`. It only ever adds missing records, so it is safe to run again, and it never overwrites an existing user's password.

## Running

Development (two terminals):

```bash
cd server && npm run dev     # http://localhost:5000
cd client && npm run dev     # http://localhost:5173  (proxies /api to the server)
```

Production (single process):

```bash
cd client && npm run build
cd ../server && NODE_ENV=production npm start   # serves the API and client/dist
```

In production the cookie is `Secure`, so serve the app over HTTPS.
