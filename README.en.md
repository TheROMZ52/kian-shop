# Kian Accessory — Online Store

A Persian-first accessories shop with a real checkout and a SQLite backbone — fewer lost DMs, more trackable orders.

[فارسی](README.md) · [English](README.en.md)

A Persian, right-to-left e-commerce store for belts, bags, and accessories. Built with Node.js and SQLite, with no paid third-party services or external CDN dependencies; fonts and icons are bundled with the project.

## Features

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

## Run locally

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

## SEO

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

## Security notes

- Keep `.env` private and never commit production credentials.
- Owner-only actions protect user administration, backups, and restore operations.
- Order totals are calculated on the server, not trusted from the browser.
