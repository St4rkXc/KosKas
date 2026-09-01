# KosKas — Personal Finance Tracker for Monthly Budget Discipline

A single-page web application for tracking personal expenses using a pocket-based budgeting approach. KosKas helps you allocate your monthly income into customizable "pocket" categories (Food, Rent, Transportation, Lifestyle, Emergency Fund, Savings, etc.) and monitor daily spending in real-time with an automatic rollover system for leftover food budget.

## Features

- **Pocket-Based Budgeting** — Allocate monthly income into customizable spending categories
- **System Pockets** — 7 built-in pockets that cannot be deleted: Food, Fixed/Rent, Transportation, Lifestyle, Emergency Fund, Savings, and Food Leftover
- **Custom Pockets** — Create custom pockets with your choice of icon and color
- **Expense Tracking** — Record expenses with a fast numeric keypad and pocket selector
- **Inter-Pocket Transfers** — Move balances between pockets as needed
- **Automatic Food Rollover** — System automatically calculates and transfers unused daily food budget to the "Food Leftover" pocket
- **Real-Time Dashboard** — View remaining balance per pocket, visual progress bars, and over-budget status
- **Daily Food Statistics** — Monitor daily food spending targets and remaining budget
- **Cloud Sync** — Supabase-backed cloud synchronization with localStorage fallback for offline use
- **Authentication** — Email/password and Google OAuth via Supabase Auth
- **Performance Dashboard** — Month-over-month spending comparison with per-pocket analytics
- **Dark Tactical UI** — Neon-minimalist design with a tactical aesthetic for a focused visual experience
- **Responsive Design** — Optimized for mobile and desktop with custom breakpoints
- **Haptic Feedback** — Vibration on interactions for a more immersive mobile experience (supported devices)

## Prerequisites

- **Node.js** — version 18 or higher
- **pnpm** — version 10.28.0 or higher

Install pnpm globally if not already available:

```bash
npm install -g pnpm@10.28.0
```

## Installation & Running

### 1. Clone the Repository

```bash
git clone <repository-url>
cd koskas
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Available variables:
- `VITE_SUPABASE_URL` — Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Your Supabase anonymous key

### 4. Run the Development Server

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`

### 5. Build for Production

```bash
pnpm build
```

Output will be in the `dist/` folder.

### 6. Preview Production Build

```bash
pnpm preview
```

### 7. Type Checking

```bash
pnpm lint
```

Runs TypeScript type checking without emitting files.

### 8. Run Tests

```bash
pnpm test
```

Runs the Vitest test suite with happy-dom environment.

## Usage Guide

### Getting Started with the Pocket System

When you first open KosKas, you'll see 7 default pockets:

1. **Food** — Daily food budget (Rp 1,500,000 default)
2. **Fixed / Rent** — Housing costs (Rp 1,000,000 default)
3. **Transportation** — Transport costs (Rp 300,000 default)
4. **Lifestyle** — Lifestyle & entertainment (Rp 300,000 default)
5. **Emergency Fund** — Emergency savings (Rp 200,000 default)
6. **Savings** — Unallocated remaining balance (automatic)
7. **Food Leftover** — Daily food budget rollover (automatic)

### Setting Monthly Budget Allocations

1. Click the **"Allocation"** button in the bottom-right corner
2. Set your **Total Monthly Balance** (monthly income)
3. Adjust allocation for each pocket as needed
4. The **Savings** pocket automatically receives any unallocated remainder
5. Click **"Save Allocation"** to apply

**Tip:** Total allocation must not exceed Total Monthly Balance.

### Recording Expenses

1. Click the green **FAB (+)** button in the bottom-right corner
2. Select the target pocket (Food, Rent, Transportation, etc.)
3. Enter the amount using the numeric keypad
4. Click **"Save"**

The expense will immediately reduce the selected pocket's balance.

### Transferring Between Pockets

If you need to move balances between pockets:

1. Click the **"Transfer"** button in the bottom-right corner
2. Select the source pocket (From Pocket)
3. Select the destination pocket (To Pocket)
4. Enter the transfer amount
5. Add a note (optional)
6. Click **"Execute Transfer"**

**Validation:** Transfer amount must not exceed the source pocket's balance.

### Deleting Custom Pockets

For pockets you created yourself (not system pockets):

1. Open **Allocation** settings
2. Find the pocket you want to delete
3. Click the **Trash** icon next to the pocket name
4. Confirm deletion

**Note:** Remaining balance will automatically be transferred to the Savings pocket.

### Understanding Food Rollover

KosKas automatically calculates daily food budget rollover:

- Daily target = `Food Allocation / Number of days in month`
- Each elapsed day, the system calculates unused budget remainder
- Leftover budget is transferred to the **Food Leftover** pocket
- Rollover is recalculated on every new transaction

**Example:**
- Food Allocation: Rp 1,500,000
- Days in month: 30
- Daily target: Rp 50,000
- If you only spent Rp 35,000 today, Rp 15,000 will be rolled over to Food Leftover

### Monthly Reset

To start a new month:

1. Click the **Settings** icon in the header
2. Click **"Recent Activity"** to view history
3. Click the **"Reset"** button
4. Confirm the reset

**Warning:** All transactions and transfers will be deleted. Pocket settings are preserved.

### Viewing Transaction History

1. Click the **Clock** icon in the header
2. Browse the transaction list
3. Hover over a transaction to reveal the delete button
4. Click the **Trash** icon to delete a specific transaction

## Configuration

### Custom Breakpoints

KosKas uses custom breakpoints instead of standard Tailwind defaults:

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `mobile-sm` | 480px | Small mobile |
| `mobile` | 640px | Standard mobile |
| `tablet` | 768px | Tablet |
| `laptop-sm` | 1024px | Small laptop |
| `laptop` | 1280px | Standard laptop |
| `desktop` | 1440px | Desktop |
| `desktop-lg` | 1600px | Large desktop |

### Design System

#### Colors

- **Background Primary:** `#050505` (deep black)
- **Background Surface:** `#121212` (surface black)
- **Text Primary:** `#FAFAFA` (white)
- **Text Muted:** `#71717A` (gray)
- **Neon Safe:** `#10B981` (green — safe status)
- **Neon Warn:** `#F59E0B` (amber — warning)
- **Neon Danger:** `#EF4444` (red — over budget)
- **Neon Vault:** `#8B5CF6` (purple — savings)

#### Fonts

- **Sans-serif:** Inter (body text)
- **Monospace:** JetBrains Mono (numbers & data)

### LocalStorage Keys

KosKas stores data in the browser with the following keys:

- `koskas_transactions` — Transaction list
- `koskas_pockets` — Pocket configuration
- `koskas_month_start` — Month start timestamp
- `koskas_archives` — Archived monthly data (up to 6 months)

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Vue** | 3.5 | Frontend framework with Composition API |
| **Pinia** | 4.0 | State management (composition store pattern) |
| **TypeScript** | 5.8 | Type safety |
| **Tailwind CSS** | 4.1 | Utility-first CSS framework |
| **Vite** | 6.2 | Build tool & dev server |
| **Supabase** | 2.x | Auth + cloud sync backend |
| **lucide-vue-next** | 1.0 | Icon library |
| **Vitest** | 4.x | Unit testing framework |
| **pnpm** | 10.28 | Package manager |

## Build & Deploy

### Local Development

```bash
pnpm dev
```

Development server with HMR on port 3000.

### Production Build

```bash
pnpm build
```

Output: optimized files in the `dist/` folder.

### Deploy to Static Hosting

Files in `dist/` can be deployed to any static hosting provider:

- **Vercel** — Drag & drop the `dist/` folder or connect repository
- **Netlify** — Upload `dist/` folder or connect repository
- **GitHub Pages** — Push `dist/` to the `gh-pages` branch
- **Cloudflare Pages** — Connect repository or upload folder
- **Firebase Hosting** — `firebase deploy --only hosting`

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Note:** Haptic feedback is only available on mobile devices supporting `navigator.vibrate()`.

## Known Limitations

1. **`deletePocket` bug** — Transfer for balance preservation can be corrupted because `fromPocketId` gets rewritten, causing inaccurate transferred balance.
2. **Rollover calculation performance** — `updateRollovers` has O(days x transactions) complexity and runs on every mutation. Can cause lag on mobile with many transactions.
3. **Triple scan in `pocketBalances`** — Now optimized to single-pass aggregation.
4. **No keypad input length cap** — Numeric input has no maximum length, potentially causing integer overflow on very large numbers.
5. **Timestamp ambiguity in rollover** — Rollover transactions with the same timestamp as other expenses can cause inconsistent sort order.
6. **Duplicate `vite` in dependencies** — `vite` is listed in both `dependencies` and `devDependencies`.
7. **`clean` script not Windows-compatible** — Uses `rm -rf` which only works on Unix/Linux/macOS.
8. **Unused dependencies** — Some dependencies are not used in the bundle.

## Future Improvements

### High Priority
- Fix `deletePocket` bug — Fix balance preservation transfer logic
- Optimize `updateRollovers` — Use memoization or virtual scrolling
- Add input length cap — Limit keypad input to 12 digits to prevent overflow
- Fix Windows compatibility — Replace `clean` script with cross-platform solution (rimraf)

### Medium Priority
- Clean up dependencies — Remove unused dependencies, move `vite` to devDependencies
- Add data export — Export/import data to JSON for backup
- Add charts/graphs — Visualize spending with charts

### Low Priority
- Add categories per pocket — Sub-categories within each pocket
- Recurring transactions — Automatic recurring expenses
- Budget alerts — Notifications when approaching pocket limits
- Multi-currency support — Support for currencies other than IDR
- Dark/Light theme toggle — Option for light mode
- PWA support — Installable app with offline support

## License

No license specified. Contact the repository maintainer for more information.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.

For questions or issues, please open an issue on the GitHub repository.

## Acknowledgments

- Built with **Vue 3** and **Pinia**
- Styled with **Tailwind CSS**
- Icons from **Lucide**
- Cloud sync powered by **Supabase**
- Design inspired by tactical/neon aesthetic

---

