# Vercel deployment

1. Import this repository into Vercel.
2. Keep the framework preset as **Next.js**.
3. Add `MONGODB_URI` and, optionally, `MONGODB_DB=antibody` to every target environment.
4. Run `npm run seed` from a trusted local machine against the same Atlas database.
5. Deploy, then verify `GET /api/harness` reports `"storage":"mongodb-atlas"`.

Atlas network access must permit Vercel's runtime. Use the narrowest practical network policy and a database user scoped to the `antibody` database.
