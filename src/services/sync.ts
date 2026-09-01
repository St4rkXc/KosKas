/**
 * @module services/sync
 * @description Remote CRUD operations for Supabase cloud synchronization.
 * Handles conversion between the app's camelCase domain model and the database's
 * snake_case column naming convention. Supports batch upserts (100 rows per batch)
 * to stay within Supabase's per-request limits.
 *
 * All functions are user-scoped — queries include `user_id` filtering for data isolation.
 */
import { supabase } from '@/lib/supabase';
import type { Pocket, Transaction } from '@/types';
import type { Database } from '@/types/supabase';

type PocketRow = Database['public']['Tables']['pockets']['Row'];
type TransactionRow = Database['public']['Tables']['transactions']['Row'];

/**
 * Fetch all pockets for a user from Supabase.
 * @param userId - The authenticated user's UUID.
 * @returns Array of Pocket objects mapped from database rows.
 * @throws Supabase error if the query fails.
 */
export async function fetchPockets(userId: string): Promise<Pocket[]> {
  const { data, error } = await supabase
    .from('pockets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRowToPocket);
}

/**
 * Fetch transactions for a user from Supabase, ordered by timestamp descending.
 * @param userId - The authenticated user's UUID.
 * @param limit - Maximum number of rows to fetch (default 1000).
 * @returns Array of Transaction objects mapped from database rows.
 * @throws Supabase error if the query fails.
 */
export async function fetchTransactions(userId: string, limit = 1000): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRowToTransaction);
}

/**
 * Insert or update a single pocket in Supabase.
 * Converts camelCase Pocket fields to snake_case database columns.
 * @param userId - The authenticated user's UUID.
 * @param pocket - The Pocket object to upsert.
 * @throws Supabase error if the operation fails.
 */
export async function upsertPocket(userId: string, pocket: Pocket) {
  const { error } = await supabase.from('pockets').upsert({
    id: pocket.id,
    user_id: userId,
    name: pocket.name,
    allocation: pocket.allocation,
    color_class: pocket.colorClass,
    icon: pocket.icon,
    is_system: pocket.isSystem ?? false,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Delete a single pocket from Supabase.
 * @param userId - The authenticated user's UUID.
 * @param pocketId - The ID of the pocket to delete.
 * @throws Supabase error if the operation fails.
 */
export async function deletePocketRemote(userId: string, pocketId: string) {
  const { error } = await supabase
    .from('pockets')
    .delete()
    .eq('user_id', userId)
    .eq('id', pocketId);
  if (error) throw error;
}

/**
 * Insert or update a single transaction in Supabase.
 * @param userId - The authenticated user's UUID.
 * @param tx - The Transaction object to upsert.
 * @throws Supabase error if the operation fails.
 */
export async function upsertTransaction(userId: string, tx: Transaction) {
  const { error } = await supabase.from('transactions').upsert({
    id: tx.id,
    user_id: userId,
    type: tx.type,
    from_pocket_id: tx.fromPocketId ?? null,
    to_pocket_id: tx.toPocketId ?? null,
    amount: tx.amount,
    timestamp: tx.timestamp,
    note: tx.note ?? null,
    is_rollover: tx.isRollover ?? false,
    rollover_date: tx.rolloverDate ?? null,
  });
  if (error) throw error;
}

/**
 * Delete a single transaction from Supabase.
 * @param userId - The authenticated user's UUID.
 * @param txId - The ID of the transaction to delete.
 * @throws Supabase error if the operation fails.
 */
export async function deleteTransactionRemote(userId: string, txId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('id', txId);
  if (error) throw error;
}

/**
 * Delete all transactions for a user (used during monthly reset).
 * @param userId - The authenticated user's UUID.
 * @throws Supabase error if the operation fails.
 */
export async function deleteAllTransactionsRemote(userId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Batch upsert all pockets for a user in a single Supabase request.
 * @param userId - The authenticated user's UUID.
 * @param pockets - Array of Pocket objects to upsert.
 * @throws Supabase error if the operation fails.
 */
export async function upsertAllPockets(userId: string, pockets: Pocket[]) {
  const rows = pockets.map(p => ({
    id: p.id,
    user_id: userId,
    name: p.name,
    allocation: p.allocation,
    color_class: p.colorClass,
    icon: p.icon,
    is_system: p.isSystem ?? false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('pockets').upsert(rows);
  if (error) throw error;
}

/**
 * Batch upsert all transactions in chunks of 100 rows to stay within Supabase limits.
 * @param userId - The authenticated user's UUID.
 * @param txs - Array of Transaction objects to upsert.
 * @throws Supabase error if any batch fails.
 */
export async function syncAllTransactions(userId: string, txs: Transaction[]) {
  const rows = txs.map(tx => ({
    id: tx.id,
    user_id: userId,
    type: tx.type,
    from_pocket_id: tx.fromPocketId ?? null,
    to_pocket_id: tx.toPocketId ?? null,
    amount: tx.amount,
    timestamp: tx.timestamp,
    note: tx.note ?? null,
    is_rollover: tx.isRollover ?? false,
    rollover_date: tx.rolloverDate ?? null,
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('transactions').upsert(batch);
    if (error) throw error;
  }
}

/** Map a database pocket row (snake_case) to a domain Pocket object (camelCase). */
function mapRowToPocket(row: PocketRow): Pocket {
  return {
    id: row.id,
    name: row.name,
    allocation: Number(row.allocation),
    colorClass: row.color_class,
    icon: row.icon,
    isSystem: row.is_system ?? false,
  };
}

/** Map a database transaction row (snake_case) to a domain Transaction object (camelCase). */
function mapRowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as 'expense' | 'transfer',
    fromPocketId: row.from_pocket_id ?? undefined,
    toPocketId: row.to_pocket_id ?? undefined,
    amount: Number(row.amount),
    timestamp: Number(row.timestamp),
    note: row.note ?? undefined,
    isRollover: row.is_rollover ?? undefined,
    rolloverDate: row.rollover_date ?? undefined,
  };
}
