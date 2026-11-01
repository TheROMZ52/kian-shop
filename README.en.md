<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:050505,35:171717,70:303030,100:050505&height=190&section=header&text=Kian%20Accessory&fontSize=54&fontColor=ffffff&fontAlignY=38&desc=PERSIAN%20RTL%20ONLINE%20STORE&descAlignY=62&descSize=13" width="100%" />

<br/>

<img src="https://img.shields.io/badge/NODE.JS-111111?style=for-the-badge&logo=nodedotjs&logoColor=white" /> <img src="https://img.shields.io/badge/SQLITE-111111?style=for-the-badge&logo=sqlite&logoColor=white" /> <img src="https://img.shields.io/badge/PWA-111111?style=for-the-badge&logo=pwa&logoColor=white" /> <img src="https://img.shields.io/github/stars/TheROMZ52/kian-shop?style=for-the-badge&color=111111&labelColor=050505&logo=github" /> <img src="https://img.shields.io/github/last-commit/TheROMZ52/kian-shop?style=for-the-badge&color=111111&labelColor=050505" />

<br/>

## Kian Accessory — Online Store

[فارسی](README.md) · [English](README.en.md)

### A Persian-first accessories shop with a real checkout and a SQLite backbone — fewer lost DMs, more trackable orders.

<img src="https://skillicons.dev/icons?i=nodejs,js,sqlite,supabase,vercel,githubactions,html,css&theme=dark" />

</div>

---

A Persian, right-to-left e-commerce store for belts, stickers, and accessories. Built with Node.js and SQLite, with no paid third-party services or external CDN dependencies; fonts and icons are bundled with the project.

---

## 01 / FEATURES

### Customer experience
- Sign up and sign in with a phone number and password; optional Google sign-in
- Product search, categories, and sorting
- Multi-product shopping cart
- Order creation with price calculation performed on the server
- Order history and tracking by tracking code
- Track an order without signing in using the tracking code and phone number
- Cancel orders while they are awaiting review
- Installable Progressive Web App (PWA)

### Administration
- Admin dashboard
- Search and filter orders; update order status with a note for the customer
- Manage products, prices, discounts, stock, multiple images, and visibility
- Manage categories and users
- Promote users to administrators or block accounts (owner only)
- Configure store contact details, shipping, payment instructions, and notifications
- Backup and restore tools (owner only)

### Order notifications
While the admin panel is open, new orders trigger a message and sound. The panel checks for new orders every 25 seconds.

---

<details>
<summary><b>02 / RUN LOCALLY</b></summary>
<br/>

```bash
npm install
cp .env.example .env
# Fill in the required environment variables.
npm start
# Open http://localhost:3000
npm test
```

Requirements: Node.js 20 or newer.

On first startup, the application creates the owner account using `OWNER_PHONE`. If `OWNER_PASSWORD` is not configured, a random password is printed to the server log **once**. Change it after signing in through **My Account**. Then open the admin panel at `/#/admin`.

</details>

---

<details>
<summary><b>03 / SEO</b></summary>
<br/>

The project includes:
- Real product and category URLs instead of hash-only routes
- Unique page titles and meta descriptions
- Canonical URLs and controlled `noindex` behavior for search/sort result pages
- Structured data: `Store`, `LocalBusiness`, `WebSite` with `SearchAction`, `Product` with `Offer`, and `BreadcrumbList`
- Dynamic `robots.txt`, `sitemap.xml`, and `llms.txt`
- Breadcrumb navigation, internal links, one main `h1` per page, and image alt text
- A custom 404 page with a real 404 status code
- Bundled favicon assets and performance optimizations

### Production domain

After connecting a custom domain, set:

```env
SITE_URL=https://your-domain.example
```

This value is used for canonical URLs and the sitemap. Then submit `https://your-domain.example/sitemap.xml` in Google Search Console.

</details>

---

<details>
<summary><b>04 / SECURITY NOTES</b></summary>
<br/>

- Keep `.env` private and never commit production credentials.
- Owner-only actions protect user administration, backups, and restore operations.
- Order totals are calculated on the server, not trusted from the browser.

</details>

---

<details>
<summary><b>05 / DEPLOYING ON VERCEL + SUPABASE</b></summary>
<br/>

The app has two database drivers and the same code runs on both: **SQLite** (default, for Pafarland/local) and **Supabase Postgres** (used automatically when `DB_GATEWAY_URL` is set). Vercel's filesystem is read-only and ephemeral, so SQLite cannot be used there.

The Vercel function talks to a small Supabase Edge Function (`kian-db`) with a secret key. The function runs parameterised SQL in one atomic transaction under a restricted role (`kian_app`, access to the `kian` schema only), so the database password never reaches Vercel and other tables in the same Supabase project stay untouched. Product images live in Supabase Storage (bucket `kian-products`).

Environment variables: `DB_GATEWAY_URL`, `DB_GATEWAY_KEY` (secret), `STORAGE_PUBLIC_URL`, `OWNER_PHONE`, `OWNER_PASSWORD` (secret). Files: `vercel.json`, `api/index.js`, `db/postgres.sql`. Run `npm run test:pg` to test against a real Postgres (PGlite) without Supabase. In Supabase mode, backups are done from the Supabase dashboard.

</details>

---

<div align="center">

<a href="https://github.com/TheROMZ52?tab=repositories"><img src="https://img.shields.io/badge/MORE%20PROJECTS-111111?style=for-the-badge&logo=github&logoColor=white" /></a>

<br/><br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:050505,50:202020,100:050505&height=110&section=footer" width="100%" />

<sub>© TheROMZ52 • Built with code, curiosity, and a suspicious number of tabs.</sub>

</div>
