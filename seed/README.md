# Seed Data

Seeds the PostgreSQL database with realistic test data for development and demo purposes.

## Usage

```bash
# Seed the database (truncates existing data first)
npm run seed

# Verify seeded data produces valid DORA metrics
npm run seed:verify
```

## Configuration

Set `SEED_REFERENCE_REPO` in your `.env` file (or as an environment variable) to change the demo repository used as a reference model (default: `octodemo/bootstrap`).

Edit `seed/config.ts` to adjust:
- Number of users, PRs, deployments
- Failure rates and ratios
- Time range (default: 90 days)

## Expected DORA Metrics

After seeding, `npm run seed:verify` should show:
- Change Lead Time: 2–24 hours median
- Deployment Frequency: 3–6/week
- Change Fail Rate: 10–20%
- Failed Deployment Recovery Time: 0.5–12 hours
- Deployment Rework Rate: 8–15%
