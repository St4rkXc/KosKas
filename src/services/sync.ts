import { supabase } from '@/lib/supabase';
import type { Pocket, Transaction } from '@/types';

export async function fetchPockets(userId: string): Promise<Pocket[]> {
  const { data, error } = await supabase
    .from('pockets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRowToPocket);
}

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRowToTransaction);
}

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

export async function deletePocketRemote(userId: string, pocketId: string) {
  const { error } = await supabase
    .from('pockets')
    .delete()
    .eq('user_id', userId)
    .eq('id', pocketId);
  if (error) throw error;
}

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

export async function deleteTransactionRemote(userId: string, txId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('id', txId);
  if (error) throw error;
}

export async function deleteAllTransactionsRemote(userId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

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

function mapRowToPocket(row: Record<string, unknown>): Pocket {
  return {
    id: row.id as string,
    name: row.name as string,
    allocation: Number(row.allocation),
    colorClass: row.color_class as string,
    icon: row.icon as string,
    isSystem: row.is_system as boolean,
  };
}

function mapRowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    type: row.type as 'expense' | 'transfer',
    fromPocketId: (row.from_pocket_id as string) ?? undefined,
    toPocketId: (row.to_pocket_id as string) ?? undefined,
    amount: Number(row.amount),
    timestamp: Number(row.timestamp),
    note: (row.note as string) ?? undefined,
    isRollover: (row.is_rollover as boolean) ?? undefined,
    rolloverDate: (row.rollover_date as string) ?? undefined,
  };
}
