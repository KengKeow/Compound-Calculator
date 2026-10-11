# COMPOUND. Personal Finance Studio

An offline, minimalist, black / grey / white compound-interest calculator. Built in plain HTML, CSS and JavaScript. All computation happens in your browser, with no network requests or external dependencies.

## Start
1. Unzip the package, keeping `index.html`, `styles.css`, and `script.js` in the same folder.
2. Double-click `index.html` to open it in Chrome, Edge, Firefox or Safari.
3. Adjust any input: the chart, headline values, milestone and results table update immediately.

## Features
- MYR, USD, SGD, EUR, GBP, JPY and INR display currencies. No FX conversion (just display denominations).
- Annual or monthly nominal input interest rate.
- Interest compounded daily, weekly, fortnightly, monthly, quarterly, half-yearly, yearly or a custom 1–365 times per year.
- Any horizon from 1 month to 60 years.
- Regular deposits, withdrawals, both, or neither.
- Contribution frequencies from daily to annually; beginning/end-of-period timing.
- Annual deposit increase by percentage or fixed amount; annual withdrawal increase by percentage.
- Interactive future-balance chart, net-invested curve, and comparison without regular contributions.
- Purchasing-power (inflation-adjusted) view, savings-goal tracker and effective annual yield.
- Monthly/yearly downloadable CSV, standalone chart PNG, and import/export scenario JSON.
- Autosaves current inputs locally in browser storage when supported.
- Responsive design, works offline on desktop and mobile.

## Calculation model
- Fixed nominal annual rate is assumed throughout the projection. For a monthly rate input, the *nominal annual rate* is 12 × the stated monthly rate.
- A simplified financial calendar of 365 days, with February fixed at 28 days, is used for consistency across years. Interest accrues daily on the currently credited account balance and is paid at chosen compounding boundaries.
- Whole-month, quarterly, half-yearly and annual compounding are aligned with month boundaries. Other frequencies are evenly spaced throughout each 365-day year.
- Contributions at the **beginning** of a period are added before the day's interest accrual; **end** contributions are added after interest accrual/credit.
- Withdrawals are capped to the available balance, without permitting debt. A warning appears when this happens.
- Any interest accrued but not yet paid on an incomplete compounding period is reported separately and excluded from the final credited balance.
- The 'Total profit / cash paid in' ratio is simply cumulative credited earnings divided by opening balance plus deposits. It is **not** time-weighted return, IRR, or investment performance relative to a market benchmark.
- The purchasing-power view discounts projected values at `(1 + inflationRate)^(months/12)`.
- This is a mathematical illustration, **not** a precise implementation of KWSP/EPF or ASB dividend calculation rules. Actual dividends may depend on specific contribution dates, daily/monthly balances, and provider policy.

## Verify a known example
Enter 5,000 initial investment, 5% per year, monthly compounding, 5 years, no regular contributions. The expected balance is **6,416.79** (from `5000 × (1 + 0.05/12)^60`).

## Privacy
- No tracking, logins, APIs, chart CDNs, or external fonts.
- Saved JSON and CSV files stay on your machine. Browser autosave uses `localStorage` where permitted by your browser.

## Notes
The design and code are original. This project is inspired by the feature set of The Calculator Site's compound interest calculator and is not affiliated with that website.
