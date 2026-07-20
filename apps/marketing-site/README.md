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

### "Become a vendor" application emails

The `/become-a-vendor` page submits applications through a Server Action
(`src/app/become-a-vendor/actions.ts`) that emails the shop via
[Resend](https://resend.com). Configure these environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | API key from your Resend dashboard. |
| `VENDOR_APPLICATION_TO_EMAIL` | Yes | Where applications are delivered. |
| `VENDOR_APPLICATION_FROM_EMAIL` | No | Sender address; defaults to `onboarding@resend.dev` for testing. Use an address on a domain verified in Resend for production. |

If `RESEND_API_KEY` or `VENDOR_APPLICATION_TO_EMAIL` is missing, the form
validates input but fails gracefully with a user-friendly message instead of
crashing.


This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
