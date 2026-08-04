# BrickCheck

BrickCheck helps you recover complete LEGO sets from a mixed parts bin. Search the Rebrickable catalog, work through a pictured inventory, track multiple sets, and move progress between browsers with JSON import and export.

## Features

- Live Rebrickable search for sets, minifigures, polybags, and BrickHeadz
- Pictured part inventory with grid and list views
- Missing, found, minifigure, spare-part, color, and status organization
- Assembled or disassembled minifigure tracking
- Multiple locally saved set checks
- Per-set and all-set progress export/import
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

BrickCheck stores sets, progress, display preferences, and the Rebrickable API key in browser storage. Clearing site data removes local progress, so use **Export all** for backups or moving to another computer.

## Data and trademarks

Catalog data and images are retrieved from [Rebrickable](https://rebrickable.com/api/). LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this project.
