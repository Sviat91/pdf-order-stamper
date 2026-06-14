# PDF Order Stamper

Internal tool for stamping order numbers onto PDF files. Upload a PDF, drag a text label to the correct position, click Save — the text is burned into the PDF and stored in an archive of the last 10 files.

## Stack

- **Frontend:** React + Vite + Tailwind CSS, served by Nginx
- **Backend:** Node.js + Express

---

## Running with Docker (recommended)

### 1. Create the backend `.env` file

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD="your-password"
JWT_SECRET=some-random-secret-string
```

> **Important:** If your password contains `#`, wrap the value in quotes — dotenv treats `#` as a comment character.

### 2. Build and start

```bash
docker compose up --build
```

Open **http://localhost:8080** in your browser.

On first start, a super-admin account is created automatically from `.env` credentials.

### Stop

```bash
docker compose down
```

Uploaded PDFs are stored in a Docker named volume (`uploads`) and persist across restarts. User accounts are recreated from `.env` on each container start (the super-admin is always available).

---

## Running locally (development)

### Prerequisites

- Node.js 20+

### Backend

```bash
cd backend
cp .env.example .env   # fill in credentials
npm install
node server.js
```

Runs on **http://localhost:3001**.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens **http://localhost:5173**.

---

## Auth

- Login page on first visit
- Only the super-admin (from `.env`) can access the app initially
- Super-admin can add/remove other users via the 👥 icon in the top-right corner
- No self-registration

## Features

- Drag & drop PDF upload or click to browse
- Canvas preview with page navigation
- Draggable text label with configurable font size, color, and background
- Settings persist in localStorage
- "Save & Upload" burns the text into the PDF at exact coordinates
- Archive of last 10 files with Download, Open in tab, and native drag to Finder/desktop
- Manual file deletion
- Auto-cleanup: oldest file deleted when archive exceeds 10
