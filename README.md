# ProductData_Pipeline

A web app for preparing and exporting clothing/apparel product master data for the [JTL](https://www.jtl-software.com/) e-commerce/ERP ecosystem. It provides a spreadsheet-style editor and a set of tools for building consistent article names, article numbers, and export files (Artikelstammdaten) used to list products across sales channels.

  ## Features

- **Gesamtexport editor** (`/`) — a spreadsheet-like grid for entering and editing product rows (collection, item name, measurements, material, category/Warengruppe, color, size, EAN, HAN, prices, quantity, description) with paste, undo, find & replace, and CSV/dictionary import
- **Artikel anlegen** (`/artikel-anlegen`) — guided article creation
- **Smart naming** (`/smart`) — automatically builds standardized article names and article numbers (Artikelnummer/Artikelname) using a German naming dictionary, with duplicate detection for color/size
- **Text generator** (`/text-generator`) — generates product description text
- **Discounts** (`/discounts`) — manage discount/price data
- **Sales channel export** (`/sales-channel`) — exports JTL Artikelstammdaten formatted for specific sales channels

## Tech Stack

- React + TypeScript, built with Vite
- shadcn-ui components on top of Tailwind CSS
- React Router for client-side routing, TanStack Query for data fetching
- A small Node.js backend under `server/` exposing API routes used by the app

## Getting Started

```bash
# install dependencies
npm i

# copy environment variables and fill in the required values
cp .env.example .env

# start the frontend dev server
npm run dev
```

The `server/` directory contains the backend API; see `server/index.js` and `server/routes` for available endpoints.

## Project Origin

This project was originally scaffolded with [Lovable](https://lovable.dev/) and has since been extended with custom pages and a backend service.

## License

No license specified yet.
