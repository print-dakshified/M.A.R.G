M.A.R.G. - Cleaned development package

IMPORTANT:
- The original archive contained backend/.env and a large Python virtual environment.
- This package intentionally excludes secrets, .venv, node_modules and dist.
- If the original .env contained real API keys, rotate those keys before using them again.

BACKEND
1. Open a terminal in MARG/backend.
2. Create and activate a virtual environment:
   py -m venv .venv
   .venv\Scripts\activate
3. Install dependencies:
   pip install -r requirements.txt
4. Copy .env.example to .env and add your own API keys.
5. Start the API:
   uvicorn main:app --reload --host 127.0.0.1 --port 8000

EXTENSION
1. Open a terminal in MARG/extension.
2. Install dependencies:
   npm install
3. Build:
   npm run build
4. In Chrome, open chrome://extensions.
5. Enable Developer mode and choose Load unpacked.
6. Select MARG/extension/dist.

The extension uses localhost/127.0.0.1:8000 for its local backend.
Some pages (Chrome internal pages, Chrome Web Store, browser PDF viewer,
and sites with restrictive policies) do not permit content-script access.

The content script extracts visible page text and field metadata only.
It intentionally does not read typed field values, passwords, OTPs or files.
