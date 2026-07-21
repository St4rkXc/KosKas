<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { 
  Settings, RefreshCw, Trash2, Plus, ArrowLeftRight,
  Utensils, Home, Fuel, Coffee, ShieldAlert, PiggyBank, Coins, 
  ShoppingBag, Gamepad2, Heart, BookOpen, Plane, Car, Gift, Sparkles
} from 'lucide-vue-next';
import KeypadModal from './components/KeypadModal.vue';
import PocketSettingsModal from './components/PocketSettingsModal.vue';
import TransferModal from './components/TransferModal.vue';
import { useStore } from './store';
import { formatRupiah, vibrate } from './types';

const store = useStore();
const showHistory = ref(false);
const isKeypadOpen = ref(false);
const isPocketSettingsOpen = ref(false);
const isTransferOpen = ref(false);

// Map icon strings to Lucide Icon components
const iconMap: Record<string, any> = {
  Utensils, Home, Fuel, Coffee, ShieldAlert, PiggyBank, Coins,
  ShoppingBag, Gamepad2, Heart, BookOpen, Plane, Car, Gift, Sparkles
};

onMounted(() => {
  store.loadFromStorage();
});

const daysRemaining = computed(() => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate() + 1;
});

const pocketStats = computed(() => {
  const stats: Record<string, { spent: number; remaining: number; percentage: number; isOver: boolean }> = {};
  store.pockets.forEach(pocket => {
    const remaining = store.pocketBalances[pocket.id] || 0;
    const spent = store.transactions
      .filter(t => t.type === 'expense' && t.fromPocketId === pocket.id)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const percentage = pocket.allocation > 0 ? Math.min((spent / pocket.allocation) * 100, 100) : 0;
    stats[pocket.id] = {
      spent,
      remaining,
      percentage,
      isOver: remaining < 0
    };
  });
  return stats;
});

const dailyPanganStats = computed(() => {
  const panganPocket = store.pockets.find(p => p.id === 'pangan');
  const panganAllocation = panganPocket ? panganPocket.allocation : 1500000;
  
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const remainingDays = daysInMonth - currentDay + 1;
  
  const dailyTarget = Math.floor(panganAllocation / daysInMonth);
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const spentToday = store.transactions
    .filter(t => t.type === 'expense' && t.fromPocketId === 'pangan' && t.timestamp >= todayStart)
    .reduce((sum, t) => sum + t.amount, 0);
    
  return {
    dailyTarget,
    remainingToday: dailyTarget - spentToday,
    spentToday
  };
});

function handleAddExpense(pocketId: string, amount: number) {
  store.addExpense(pocketId, amount);
}

function handleReset() {
  if (window.confirm("Yakin ingin reset bulan ini? Semua data pengeluaran dan transfer akan hilang.")) {
    store.resetMonth();
  }
}

function removeTransaction(id: string) {
  vibrate([20, 20]);
  store.removeTransaction(id);
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
</script>

<template>
  <div v-if="!store.isLoaded" class="min-h-screen bg-[#050505] text-[#FAFAFA]"></div>

  <div v-else class="w-full min-h-screen bg-[#050505] text-[#FAFAFA] flex flex-col font-sans p-6 sm:p-10 select-none overflow-x-hidden selection:bg-[#10B981]/30 relative">
    
    <!-- Status Bar Visual Hack -->
    <div class="absolute top-4 left-0 w-full px-6 sm:px-10 flex justify-between z-20 pointer-events-none">
      <div class="font-mono text-[10px] text-[#71717A]">V3.2-TACTICAL</div>
      <div class="font-mono text-[10px] text-[#71717A] hidden sm:flex gap-2">
        <span>DISK: 14%</span>
        <span>SYNC: OK</span>
        <span>OLED: ON</span>
      </div>
    </div>

    <!-- Header Space -->
    <header class="flex-none flex flex-col justify-center items-start border-b border-[#121212] mb-8 pb-8 mt-8 sm:mt-12">
      <div class="w-full flex justify-between items-start">
        <div class="text-[#71717A] text-xs font-mono uppercase tracking-[0.2em] mb-4">Total Sisa Saldo (Semua Pocket)</div>
        <button 
          @click="showHistory = !showHistory" 
          class="text-[#71717A] hover:text-[#FAFAFA] transition-colors z-30"
        >
          <Settings :size="20" />
        </button>
      </div>
      
      <div class="flex items-baseline">
        <span class="text-[#10B981] font-mono text-xl sm:text-3xl font-bold mr-2 sm:mr-4">Rp</span>
        <h1 class="text-[48px] sm:text-[80px] md:text-[112px] font-mono font-extrabold leading-none tracking-tighter text-white whitespace-nowrap">
          {{ formatRupiah(store.totalRemaining).replace('Rp', '').trim() }}
        </h1>
      </div>

      <div class="mt-4 flex items-center gap-4">
        <div :class="['px-3 py-1 text-[#050505] text-[10px] font-bold uppercase rounded-[4px]', store.totalRemaining < 0 ? 'bg-[#EF4444]' : store.totalRemaining < store.totalAllocation * 0.2 ? 'bg-[#F59E0B]' : 'bg-[#10B981]']">
          {{ store.totalRemaining < 0 ? 'Danger' : store.totalRemaining < store.totalAllocation * 0.2 ? 'Warning' : 'Aman' }}
        </div>
        <span class="text-[#71717A] font-mono text-sm">{{ daysRemaining }} Hari Menuju Reset</span>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto pb-32 no-scrollbar">
      <Transition name="fade" mode="out-in">
        <!-- History / Transactions List -->
        <div v-if="showHistory" class="flex flex-col gap-2">
          <div class="flex justify-between items-end mb-4">
            <h2 class="text-[#71717A] text-[11px] uppercase font-bold tracking-[0.2em]">Aktivitas Terakhir</h2>
            <div class="h-[1px] flex-1 mx-4 bg-[#121212]"></div>
            <div class="flex gap-4 items-center">
              <button 
                @click="isTransferOpen = true"
                class="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#F59E0B] hover:text-amber-400"
              >
                <ArrowLeftRight :size="10" /> Transfer
              </button>
              <button 
                @click="isPocketSettingsOpen = true"
                class="text-[10px] font-mono uppercase tracking-wider text-[#10B981] hover:text-[#059669]"
              >
                Alokasi
              </button>
              <button 
                @click="handleReset"
                class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#EF4444] hover:text-red-400"
              >
                <RefreshCw :size="12" /> Reset
              </button>
            </div>
          </div>
          
          <div v-if="store.transactions.length === 0" class="text-center text-[#71717A] py-10 font-mono text-sm">
            Belum ada aktivitas transaksi.
          </div>
          
          <TransitionGroup v-else name="list" tag="div" class="space-y-2">
            <div 
              v-for="tx in store.transactions" 
              :key="tx.id"
              class="bg-[#121212] p-4 rounded-[4px] flex items-center justify-between group overflow-hidden relative"
            >
              <div class="flex items-center gap-4 z-10 pointer-events-none">
                <!-- Dot with pocket color -->
                <div 
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  :style="{ backgroundColor: tx.type === 'expense' ? (store.pockets.find(p => p.id === tx.fromPocketId)?.colorClass.match(/#[A-Fa-f0-9]+/)?.[0] || '#EF4444') : '#F59E0B' }"
                ></div>
                
                <div>
                  <div class="text-sm font-semibold text-[#FAFAFA]">
                    <span v-if="tx.type === 'expense'">
                      {{ store.pockets.find(p => p.id === tx.fromPocketId)?.name || 'Pocket' }}
                    </span>
                    <span v-else-if="tx.isRollover">
                      Pangan Rollover
                    </span>
                    <span v-else>
                      Transfer
                    </span>
                  </div>
                  
                  <div class="text-[10px] text-[#71717A] font-mono mt-0.5">
                    {{ formatTime(tx.timestamp) }} • 
                    <span v-if="tx.type === 'expense'">
                      Pengeluaran{{ tx.note ? ` (${tx.note})` : '' }}
                    </span>
                    <span v-else-if="tx.isRollover">
                      Sisa pangan harian {{ tx.rolloverDate }}
                    </span>
                    <span v-else>
                      {{ store.pockets.find(p => p.id === tx.fromPocketId)?.name }} → {{ store.pockets.find(p => p.id === tx.toPocketId)?.name }}
                      {{ tx.note ? ` (${tx.note})` : '' }}
                    </span>
                  </div>
                </div>
              </div>
              
              <div 
                :class="['font-mono text-sm z-10 pointer-events-none', 
                  tx.type === 'expense' ? 'text-[#EF4444]' : 'text-[#71717A]'
                ]"
              >
                {{ tx.type === 'expense' ? '-' : '' }} {{ formatRupiah(tx.amount) }}
              </div>
              
              <button
                v-if="!tx.isRollover"
                @click="removeTransaction(tx.id)"
                class="absolute inset-y-0 right-0 w-16 bg-[#EF4444] flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity translate-x-full group-hover:translate-x-0 active:bg-red-600"
                style="-webkit-tap-highlight-color: transparent"
              >
                 <Trash2 :size="20" class="text-[#050505]" />
              </button>
            </div>
          </TransitionGroup>
        </div>

        <!-- Dashboard / Cards Grid -->
        <div v-else class="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Daily Pangan Target Card -->
          <div :class="['bg-[#121212] p-5 rounded-[4px] border-l-4 flex flex-col justify-between', dailyPanganStats.remainingToday < 0 ? 'border-[#EF4444]' : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3 ? 'border-[#F59E0B]' : 'border-[#10B981]']">
            <div>
              <div class="flex justify-between items-start mb-2">
                <span class="text-[#71717A] text-[11px] uppercase font-bold tracking-wider">Pangan Hari Ini</span>
                <span :class="['font-mono text-xs', dailyPanganStats.remainingToday < 0 ? 'text-[#EF4444]' : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3 ? 'text-[#F59E0B]' : 'text-[#10B981]']">
                  {{ dailyPanganStats.remainingToday < 0 ? 'OVER' : 'SISA' }}
                </span>
              </div>
              <div :class="['font-mono text-2xl font-bold mb-1', dailyPanganStats.remainingToday < 0 ? 'text-[#EF4444]' : 'text-[#FAFAFA]']">
                {{ formatRupiah(dailyPanganStats.remainingToday) }}
              </div>
              <div class="text-[#71717A] text-[10px]">Tersedia Hari Ini (Target: {{ formatRupiah(dailyPanganStats.dailyTarget) }}/hari)</div>
            </div>
            <div class="w-full h-2 bg-[#1E1E1E] rounded-[2px] mt-4 overflow-hidden">
              <div 
                :class="['h-full transition-all duration-300 ease-out', dailyPanganStats.remainingToday < 0 ? 'bg-[#EF4444]' : dailyPanganStats.remainingToday < dailyPanganStats.dailyTarget * 0.3 ? 'bg-[#F59E0B]' : 'bg-[#10B981]']"
                :style="{ width: `${Math.min((dailyPanganStats.spentToday / (dailyPanganStats.dailyTarget || 1)) * 100, 100)}%` }"
              ></div>
            </div>
          </div>

          <!-- Dynamic Pockets Grid -->
          <div 
            v-for="pocket in store.pockets" 
            :key="pocket.id" 
            class="bg-[#121212] p-5 rounded-[4px] border-l-4 flex flex-col justify-between border-l-current"
            :style="{ borderLeftColor: pocket.colorClass.match(/#[A-Fa-f0-9]+/)?.[0] || '#10B981' }"
          >
            <div>
              <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                  <div :class="['w-6 h-6 rounded flex items-center justify-center', pocket.colorClass]">
                    <component :is="iconMap[pocket.icon]" :size="12" />
                  </div>
                  <span class="text-[#71717A] text-[11px] uppercase font-bold tracking-wider">{{ pocket.name }}</span>
                </div>
                <span :class="['font-mono text-xs', pocketStats[pocket.id]?.isOver ? 'text-[#EF4444]' : 'text-[#10B981]']">
                  {{ pocketStats[pocket.id]?.isOver ? 'OVER' : 'AMAN' }}
                </span>
              </div>
              <div :class="['font-mono text-2xl font-bold mb-1', pocketStats[pocket.id]?.isOver ? 'text-[#EF4444]' : 'text-[#FAFAFA]']">
                {{ formatRupiah(store.pocketBalances[pocket.id] || 0) }}
              </div>
              <div :class="['text-[10px]', pocketStats[pocket.id]?.isOver ? 'text-[#EF4444] uppercase font-bold' : 'text-[#71717A]']">
                {{ pocketStats[pocket.id]?.isOver ? 'Rem Dulu, Bro' : 'Sisa Saldo' }}
              </div>
            </div>
            <div class="w-full h-2 bg-[#1E1E1E] rounded-[2px] mt-4 overflow-hidden">
              <div 
                :class="['h-full transition-all duration-300 ease-out', pocket.colorClass]"
                :style="{ width: `${pocketStats[pocket.id]?.percentage || 0}%` }"
              ></div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Pockets transfer / settings panel launchers when not showing history -->
    <div v-if="!showHistory" class="fixed bottom-28 left-6 right-6 sm:left-10 sm:right-10 flex gap-4 z-20 pointer-events-none">
      <button 
        @click="isTransferOpen = true"
        class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-[#F59E0B] hover:text-amber-400 hover:bg-[#2A2A2A] shadow-lg"
      >
        <ArrowLeftRight :size="14" />
        Transfer
      </button>
      <button 
        @click="isPocketSettingsOpen = true"
        class="pointer-events-auto flex items-center gap-2 bg-[#1E1E1E]/95 border border-white/5 px-4 py-3 rounded text-xs font-bold uppercase tracking-wider text-[#10B981] hover:text-[#059669] hover:bg-[#2A2A2A] shadow-lg"
      >
        <Settings :size="14" />
        Alokasi
      </button>
    </div>

    <!-- The Signature Add Expense FAB -->
    <div class="fixed bottom-8 sm:bottom-12 right-8 sm:right-12 z-30">
      <button
        @click="isKeypadOpen = true"
        class="w-16 h-16 sm:w-20 sm:h-20 bg-[#10B981] text-[#050505] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-95 active:scale-90 transition-transform"
      >
        <Plus :size="36" :stroke-width="2.5" />
      </button>
    </div>

    <!-- Modals -->
    <KeypadModal 
      :is-open="isKeypadOpen" 
      @close="isKeypadOpen = false" 
      @save="handleAddExpense" 
    />

    <PocketSettingsModal
      :is-open="isPocketSettingsOpen"
      @close="isPocketSettingsOpen = false"
    />

    <TransferModal 
      :is-open="isTransferOpen"
      @close="isTransferOpen = false"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
