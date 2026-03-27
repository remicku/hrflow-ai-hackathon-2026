### Run backend :

cd backend
uv run --package backend uvicorn backend.main:app --reload --port 8000

### Run frontend :

cd frontend
npm install
npm run dev