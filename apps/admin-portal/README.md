# Admin Portal

Internal administration app for the Forest City Vault community marketplace,
built with [Next.js](https://nextjs.org) (App Router) and the
`@nataliebasille/natcore-design-system`. Branding (palette, fonts, and design
tokens) is shared with the marketing site.

## Getting started

From the repository root, install workspace dependencies:

```bash
pnpm install
```

Then run the dev server (defaults to port `3101`):

```bash
pnpm --filter @forest-city-vault/app-admin-portal dev
```

Open [http://localhost:3101](http://localhost:3101) with your browser to see the
result. Edit `src/app/page.tsx` to start building — the page auto-updates as you
edit.

## Branding

The palette and design tokens live in `src/app/globals.css` (`@theme static`
block) and mirror the marketing site's brand:

- **Primary** `#af5f1d` · **Secondary** `#4c4639` · **Accent** `#be996d`
- Fonts: Playfair Display (headings), Manrope (subheadings), Alegreya (body)

## Configuration

Environment variables are read from the repository-root `.env` (see
`.env.example`). Do not create a local `.env.local`.
