# PerigeeWatch 🛰️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/)
[![React Version](https://img.shields.io/badge/react-18%2B-blue)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-1.100%2B-orange)](https://cesium.com/)

**PerigeeWatch** is a modern, high-performance Space Situational Awareness (SSA) platform. It provides real-time satellite tracking, orbital monitoring, conjunction assessment (collision avoidance), and ground station visibility analysis in a stunning 3D visualization.


---

## 🚀 Features

- **🌍 Real-Time 3D Tracking**: Visualize thousands of active satellites and debris in real-time using CesiumJS.
- **⚠️ Conjunction Assessment**: Automatically detect potential collisions between space objects and issue risk alerts.
- **📡 Ground Station Analysis**: Calculate visibility windows (AOS/LOS) and link budgets for ground stations.
- **🔄 Automated Ingestion**: Background workers constantly fetch and update TLE (Two-Line Element) data from CelesTrak.
- **⚡ High Performance**: Built with FastAPI and Rust-based tooling, utilizing Redis for caching and PostgreSQL for robust data storage.
- **📱 Responsive Design**: Modern UI built with React, TailwindCSS, and Shadcn UI.

---

## 🔮 Roadmap

- [x] Real-time TLE Propagation
- [x] Basic Conjunction Screening
- [x] Ground Station Visibility
- [ ] **Starlink Constellation Management**: Specialized tools for mega-constellation monitoring.
- [ ] **Launch Trajectory Visualization**: Integration with launch providers for ascent phase tracking.
- [ ] **Re-entry Prediction**: Heatmaps and risk corridors for decaying objects.
- [ ] **Custom Alerts**: Email/SMS notifications for close approaches.

---

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15+ (SQLAlchemy ORM, Alembic Migrations)
- **Task Queue**: Celery + Redis
- **Astrodynamics**: SGP4, Skyfield
- **Server**: Uvicorn / Gunicorn

### Frontend
- **Framework**: React 18 (Vite)
- **Visualization**: CesiumJS
- **Styling**: TailwindCSS, Lucide Icons, Shadcn UI
- **State**: React Query, Zustand

---

## 📂 Project Structure

```bash
perigeewatch/
├── backend/                # Python FastAPI Backend
│   ├── app/
│   │   ├── api/            # API Routes (Endpoints)
│   │   ├── core/           # Config & Security
│   │   ├── db/             # Database Models & Session
│   │   ├── models/         # SQLAlchemy Models
│   │   ├── services/       # Business Logic (Propagation, Ingestion)
│   │   └── main.py         # App Entrypoint
│   ├── scripts/            # Utility Scripts (Ingestion triggers)
│   ├── worker.py           # Standalone Background Worker
│   └── requirements.txt    # Python Dependencies
├── frontend/               # React Vite Frontend
│   ├── public/             # Static Assets
│   ├── src/
│   │   ├── components/     # Reusable UI Components
│   │   ├── pages/          # Route Pages
│   │   └── services/       # API Clients
│   ├── vercel.json         # Deployment Config
│   └── package.json        # Node Dependencies
└── docker-compose.yml      # (Optional) Local Development Stack
```

---

## 🏃 Getting Started

### Prerequisites
- **Python 3.9+**
- **Node.js 18+**
- **PostgreSQL** (Active database server)
- **Redis** (For caching/background tasks)

### 1. Clone the Repository
```bash
git clone https://github.com/yusufcalisir/perigeewatch.git
cd perigeewatch
```

### 2. Backend Setup
```bash
cd backend

# Create Virtual Environment
python -m venv venv
# Activate: 
# Windows: .\venv\Scripts\activate
# Linux/Mac: source venv/bin/activate

# Install Dependencies
pip install -r requirements.txt

# Environment Setup
# Copy .env.example (if exists) or create .env
# Set DATABASE_URL=postgresql://user:pass@localhost:5432/perigee_watch
```

### 3. Frontend Setup
```bash
cd ../frontend

# Install Dependencies
npm install

# Environment Setup
# Create .env.local
# VITE_API_BASE_URL=http://localhost:8000/api/v1
# VITE_CESIUM_ION_TOKEN=your_token_here
```

### 4. Running the App

**Start Backend:**
```bash
cd backend
python -m uvicorn app.main:app --reload
```
*API will run at http://localhost:8000*

**Start Frontend:**
```bash
cd frontend
npm run dev
```
*App will run at http://localhost:5173*

---

## ☁️ Deployment

### Render (Backend)
1. Creates a **Web Service** for the API.
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -k uvicorn.workers.UvicornWorker app.main:app` or `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
2. Create a **Background Worker** for tasks.
   - **Start Command**: `python worker.py`

### Vercel (Frontend)
1. Import the repository.
2. Set Framework Preset to **Vite**.
3. Add Environment Variables (`VITE_API_BASE_URL`).
4. Deploy!

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'psycopg'` | Ensure `psycopg[binary]` is in your `requirements.txt` and installed. |
| **CORS Errors** | Check `backend/app/main.py` and ensure your frontend domain is in `allow_origins`. |
| **Database Connection Fail** | Verify `DATABASE_URL` format. For Neon/Render, replace `postgres://` with `postgresql://`. |

---

## 🤝 Contributing

Contributions are welcome!
1. Fork the repo.
2. Create a feature branch.
3. Commit your changes.
4. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.