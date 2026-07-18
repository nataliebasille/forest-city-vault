## Forest City Vault marketing site

This app is the public-facing marketing site for **Forest City Vault: a community marketplace**.

### Development

From the repository root:

```bash
pnpm --filter marketing-site dev
```

### Build

```bash
pnpm --filter marketing-site build
```

### Lint

```bash
pnpm --filter marketing-site lint
```

### Branding + design system notes

- Natcore design system is imported in `src/app/globals.css`.
- Theme roles are mapped to Forest City Vault brand colors.
- Brand logos are in `public/branding`.
- Free Google Fonts are used as license-safe substitutes for brand typography.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
