# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Pocket allocation reset on multi-device sync.** Custom pocket allocations no longer reset to defaults (3.3M IDR) when syncing between devices. Root causes: `resetState()` prematurely cleared localStorage before remote data loaded, `loadFromStorage()` overwrote remote pockets with defaults when remote returned empty, and `monthly_fund` was not persisted to the `profiles` table as the authoritative source. (`src/store.ts`)

### Changed

- Extracted `clearLocalStorage()` helper in `src/store.ts` — localStorage cleanup now runs only after confirmed successful remote load, not eagerly during `resetState()`.
- `loadFromStorage()` now checks localStorage for pockets before falling back to `DEFAULT_POCKETS`, and fetches `monthly_fund` from the `profiles` table.
- `syncToSupabase()` now writes `monthly_fund` (computed from `totalAllocation`) to `profiles.monthly_fund` alongside `month_start`.
