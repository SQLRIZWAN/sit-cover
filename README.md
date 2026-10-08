# sit-cover — Customer Website

Shop website of **Fahad Asi Manea Al-Zaferi Co** (Kuwait). Live on GitHub Pages.

## What it has

- Animated logo loading screen (fast, no blocking)
- Banner with shop name (English + Arabic), phone, location
- Top bar: 3-line menu drawer + language translate (100+ languages) + cart
- Category tabs (Home, TV Remote, Sit Cover, Machine + any added from admin) — 100% live from database, nothing hardcoded
- Product grid with photos/videos, live stock badges
- Product detail page: photo/video gallery, price, details, **Order Now / New Order / Home**
- Checkout flow: basket (tick select) → name/phone + Google Maps location (auto distance + auto delivery fee) → payment (Cash on Delivery / WAMD with auto app redirect + screenshot upload) → order saved live to admin panel + WhatsApp message
- Draggable AI assistant: full-screen drag, text chat, **photo search** (send a photo → finds the product), Buy Now cards. Uses Gemini `gemini-3.5-flash-lite` with auto-fallback `gemini-2.5-flash`
- Footer: owner number, email, Privacy Policy, Translate, About, Instagram, ©sql.ssl 2026
- Lazy images, realtime sync with admin panel, offline-safe UI

## Delivery fee (automatic)

Distance is measured from the shop (Jleeb Al-Shuyoukh) with a map pin / GPS:

| Distance | Fee |
|---|---|
| up to 5 km | 1 KD |
| up to 10 km | 1.5 KD |
| up to 20 km | 2 KD |
| up to 30 km | 3 KD |
| rest of Kuwait | 5 KD |

## Deploy

Every push to `main` auto-deploys to GitHub Pages. The workflow `.github/workflows/deploy.yml` injects secrets into `js/config.js` at build time — **no secret is ever committed**.

### Required repo secrets

| Secret | Value |
|---|---|
| `FIREBASE_CONFIG` | whole firebaseConfig JSON object |
| `GEMINI_API_KEY` | Google AI Studio key |
| `CLOUDINARY_CLOUD_NAME` | your Cloudinary cloud name (optional, enables uploads) |
| `CLOUDINARY_UPLOAD_PRESET` | your **unsigned** upload preset (optional) |

## Local development

`js/config.js` in the repo is an empty placeholder (CI overwrites it). For local testing paste your real firebaseConfig into `js/config.js`.

## One-time Google Cloud step

For the map picker, enable **Maps JavaScript API** and **Geocoding API** on the same API key (Google Cloud Console → APIs & Services → Enable). Until then the checkout still works via GPS "Use my location".
