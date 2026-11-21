# Sarafi Project

React/Vite frontend and Django REST backend with a Windows launcher.

## Setup

Use a Python version compatible with the pinned Django release and Node.js compatible with Vite.

```powershell
cd MyFullStackApp
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py createsuperuser
.\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

After setup, the Windows launcher is available in `?????/Start.cmd`.
Local databases, financial records, backups, logs and installed dependencies are deliberately excluded. Migrations create a fresh database. Use a private backup process to transfer existing data.
Set DJANGO_SECRET_KEY in the environment for deployments; review Django production settings before hosting.
