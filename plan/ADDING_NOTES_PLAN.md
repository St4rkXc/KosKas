# Plan: Implement Adding Notes to Expenses

## Overview
Currently, the `transactions` table in Supabase already has a `note` column (type: `text`, nullable). The goal is to implement the functionality in the user interface to allow users to add notes when creating expenses, and to display these notes where appropriate (e.g., in the transaction history).

## Steps

### 1. Database Verification (Completed)
- I have verified using the Supabase MCP that the `transactions` table has a `note` column.
- Schema:
  - `id` (text)
  - `user_id` (uuid)
  - `type` (text - 'expense' | 'transfer')
  - `from_pocket_id` (text)
  - `to_pocket_id` (text)
  - `amount` (bigint)
  - `timestamp` (bigint)
  - **`note` (text, nullable)**
  - `is_rollover` (boolean)
  - `rollover_date` (text)
  - `created_at` (timestamp with time zone)

### 2. Update Types/Interfaces
- Locate the TypeScript interfaces defining a `Transaction` (likely in a `types` or `models` directory, or within the state management store).
- Ensure the `note` property is included in the interface: `note?: string`.

### 3. Update the "Add Expense" / "Record Transaction" UI
- Identify the component responsible for recording an expense (likely a modal, bottom sheet, or a dedicated page).
- Add a text input field (e.g., an `<input type="text">` or `<textarea>`) for the "Note" or "Description".
- Bind this input field to the component's state.

### 4. Update the Submission Logic
- When the user submits the expense, ensure the `note` value from the state is included in the payload sent to the backend/store.
- If using a service layer or store action to create the transaction, update its signature to accept the `note` field.

### 5. Update the "Transaction History" UI (Optional but Recommended)
- Identify the component that displays the list of transactions (e.g., `TransactionList`, `HistoryView`).
- Update the UI to display the `note` if it exists. It could be displayed below the pocket name or amount, perhaps in a smaller or muted font.

## Questions for the User
1. **Where should the note input be placed in the Add Expense UI?** (e.g., below the amount, below the pocket selection?)
2. **Do we need to show the note in the transaction history list?** If yes, how prominent should it be?
3. **Is the note purely optional?** (I assume yes, based on the database schema allowing nulls).

---
*Please review this plan. Let me know if you approve or if you have any changes before I proceed with the implementation.*