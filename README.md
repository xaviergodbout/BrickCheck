# BrickCheck

BrickCheck helps you recover complete LEGO sets from a mixed parts bin. Search the Rebrickable catalog, work through a pictured inventory, track multiple sets, and move progress between browsers with JSON import and export.

## Features

- Live Rebrickable search for sets, minifigures, polybags, and BrickHeadz
- Custom Rebrickable MOC checks from a MOC URL/ID and its exported inventory CSV
- Pictured part inventory with grid and list views
- Missing, found, minifigure, spare-part, color, and status organization
- Assembled or disassembled minifigure tracking
- Multiple locally saved set checks
- Optional username-and-password accounts that sync sets, progress, and the Rebrickable API key
- Per-set and all-set progress export/import
- Copy-ready BrickLink Wanted List XML for the exact missing quantities, including minifigure parts
- Responsive layout and dark mode


## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`.

To verify the static export:

```bash
npm run build
```

The publishable files are generated in `dist/client`.

## Saved data

BrickCheck always keeps a local browser copy. When signed in, sets, progress, the active set, and the Rebrickable API key also sync to the account. Display preferences remain device-specific. Use **Export all** as an additional backup.

## Optional account sync setup

1. Create a free Supabase project.
2. In **Authentication → Providers → Email**, turn off **Confirm email**. BrickCheck uses internal email-shaped identifiers so the public form can remain username + password only.
3. Open the Supabase SQL editor and run [`supabase/brickcheck.sql`](supabase/brickcheck.sql).
4. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - `SUPABASE_URL`: the project URL from Supabase API settings
   - `SUPABASE_ANON_KEY`: the project publishable/anon key
5. Re-run the GitHub Pages workflow or push a new commit.

For local account testing, copy `.env.example` to `.env.local` and add the same two values using the `NEXT_PUBLIC_` variable names already shown in the file.

## Data and trademarks

Catalog data and images are retrieved from [Rebrickable](https://rebrickable.com/api/). LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this project.
