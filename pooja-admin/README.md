# Bhakti — Admin dashboard

A static React + Vite site over `pooja-api` (it serves nothing itself). Plain JS/JSX and
plain CSS; the only dependencies are React and Vite.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api and /uploads to API_ORIGIN (default :4000)
npm run build    # check-deps + check-access + vite build; VITE_API_BASE is baked in at build time
```

Layout, the design-system kit (`src/client/ui/`) and the permission model are described in
`../AGENTS.md` (§2) and `../DESIGN.md`.
