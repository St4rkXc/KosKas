<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
  Utensils, Home, Fuel, Coffee, ShieldAlert, PiggyBank, Coins, 
  ShoppingBag, Gamepad2, Heart, BookOpen, Plane, Car, Gift, Sparkles, 
  Trash2, Plus, X, AlertCircle
} from 'lucide-vue-next';
import { Pocket, AVAILABLE_ICONS, AVAILABLE_COLORS, formatRupiah, vibrate } from '../types';
import { useStore } from '../store';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useStore();

const monthlyFund = ref(0);
const localAllocations = ref<Record<string, number>>({});
const editingId = ref<string | null>(null);
const editValueStr = ref('0');

// Custom pocket form state
const showAddForm = ref(false);
const newPocketName = ref('');
const newPocketIcon = ref('Sparkles');
const newPocketColor = ref(AVAILABLE_COLORS[0].class);
const newPocketAllocation = ref(0);

// Map icon names to Lucide Icon components
const iconMap: Record<string, any> = {
  Utensils, Home, Fuel, Coffee, ShieldAlert, PiggyBank, Coins,
  ShoppingBag, Gamepad2, Heart, BookOpen, Plane, Car, Gift, Sparkles, Trash2, Plus, X
};

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    // Set monthly fund to the current total allocation
    monthlyFund.value = store.totalAllocation;
    
    // Copy current pocket allocations to local state
    const allocs: Record<string, number> = {};
    store.pockets.forEach(p => {
      allocs[p.id] = p.allocation;
    });
    localAllocations.value = allocs;
    
    editingId.value = null;
    showAddForm.value = false;
    resetAddForm();
  }
});

// Calculate total allocated to all pockets except Saving and Leftover
const totalAllocatedExceptSaving = computed(() => {
  return Object.entries(localAllocations.value)
    .filter(([id]) => id !== 'saving' && id !== 'leftover')
    .reduce((sum, [, amount]) => sum + amount, 0);
});

// Calculate how much goes into Saving pocket
const calculatedSavingAllocation = computed(() => {
  return Math.max(0, monthlyFund.value - totalAllocatedExceptSaving.value);
});

// Validation check: ensure allocations do not exceed monthly fund
const isAllocationValid = computed(() => {
  return monthlyFund.value >= totalAllocatedExceptSaving.value;
});

function handleEditClick(pocketId: string) {
  vibrate(10);
  editingId.value = pocketId;
  editValueStr.value = (localAllocations.value[pocketId] || 0).toString();
}

function handleMonthlyFundEditClick() {
  vibrate(10);
  editingId.value = 'monthly_fund';
  editValueStr.value = monthlyFund.value.toString();
}

function handleKeyPress(key: string) {
  vibrate(10);
  if (key === 'DEL') {
    editValueStr.value = editValueStr.value.length > 1 ? editValueStr.value.slice(0, -1) : '0';
  } else if (key === '000') {
    editValueStr.value = editValueStr.value === '0' ? '0' : editValueStr.value + '000';
  } else {
    editValueStr.value = editValueStr.value === '0' ? key : editValueStr.value + key;
  }
}

function handleSaveField() {
  if (editingId.value) {
    vibrate([20, 20]);
    const value = parseInt(editValueStr.value, 10) || 0;
    
    if (editingId.value === 'monthly_fund') {
      monthlyFund.value = value;
    } else {
      localAllocations.value[editingId.value] = value;
    }
    editingId.value = null;
  }
}

function resetAddForm() {
  newPocketName.value = '';
  newPocketIcon.value = 'Sparkles';
  newPocketColor.value = AVAILABLE_COLORS[0].class;
  newPocketAllocation.value = 0;
}

function handleAddPocket() {
  if (!newPocketName.value.trim()) return;
  
  vibrate([20, 50]);
  store.addPocket(
    newPocketName.value.trim(),
    newPocketAllocation.value,
    newPocketColor.class || newPocketColor.value,
    newPocketIcon.value
  );
  
  // Re-sync local state
  localAllocations.value[store.pockets[store.pockets.length - 1].id] = newPocketAllocation.value;
  showAddForm.value = false;
  resetAddForm();
}

function handleDeletePocket(id: string) {
  if (window.confirm("Yakin ingin menghapus pocket ini? Sisa saldonya akan dipindahkan ke Saving (Tabungan).")) {
    vibrate([50, 20]);
    store.deletePocket(id, 'saving');
    
    // Remove from local allocations state
    delete localAllocations.value[id];
  }
}

function handleSaveAll() {
  if (!isAllocationValid.value) return;
  
  vibrate([30, 50, 30]);
  
  // Update all allocations including the computed saving pocket
  const finalAllocations = { ...localAllocations.value };
  finalAllocations['saving'] = calculatedSavingAllocation.value;
  finalAllocations['leftover'] = 0; // Leftover allocation is always 0
  
  store.updateAllAllocations(finalAllocations);
  emit('close');
}
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 bg-[#050505] bg-opacity-80 z-40" @click="$emit('close')"></div>
  </Transition>

  <Transition name="slide-up">
    <div
      v-if="isOpen"
      class="fixed bottom-0 left-0 right-0 bg-[#121212] z-50 flex flex-col border-t border-[#1E1E1E]"
      style="padding-bottom: env(safe-area-inset-bottom); height: 90vh"
    >
      <!-- Modal Header -->
      <div class="flex justify-between items-center p-6 border-b border-[#1E1E1E]">
        <h2 class="text-[#FAFAFA] font-sans font-bold uppercase tracking-wider text-sm">Alokasi & Pengaturan Pocket</h2>
        <button @click="$emit('close')" class="text-[#71717A] hover:text-white transition-colors">Batal</button>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
        
        <!-- Monthly Fund Section -->
        <div class="bg-[#050505] p-5 rounded-[4px] border border-[#1E1E1E]">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[#71717A] text-[11px] uppercase font-bold tracking-wider">Total Saldo Bulanan (Income)</span>
          </div>
          
          <div v-if="editingId === 'monthly_fund'" class="flex gap-2">
            <div class="flex-1 bg-[#121212] text-white font-mono text-xl p-2 rounded flex items-center justify-end">
              {{ parseInt(editValueStr, 10).toLocaleString('id-ID') }}
            </div>
            <button 
              @click="handleSaveField"
              class="bg-[#10B981] text-black px-4 font-bold rounded uppercase text-xs"
            >
              Set
            </button>
          </div>
          <div v-else class="flex justify-between items-end">
            <div class="text-[#10B981] font-mono text-3xl font-extrabold">
              {{ formatRupiah(monthlyFund) }}
            </div>
            <button 
              @click="handleMonthlyFundEditClick"
              class="text-[#10B981] text-xs font-bold uppercase underline"
            >
              Ubah Saldo
            </button>
          </div>
        </div>

        <!-- Allocation Status Warning if Overbudget -->
        <div v-if="!isAllocationValid" class="bg-red-950/30 border border-red-500/50 p-4 rounded-[4px] flex items-center gap-3 text-red-400">
          <AlertCircle :size="20" class="flex-shrink-0" />
          <div class="text-xs font-mono">
            Total alokasi ({{ formatRupiah(totalAllocatedExceptSaving) }}) melebihi Saldo Bulanan ({{ formatRupiah(monthlyFund) }}). Kurangi alokasi pocket Anda!
          </div>
        </div>

        <!-- Automatic saving allocation output -->
        <div class="bg-[#1A1018] p-5 rounded-[4px] border border-[#EC4899]/30 flex justify-between items-center">
          <div>
            <div class="flex items-center gap-2 text-[#EC4899] text-[11px] uppercase font-bold tracking-wider">
              <PiggyBank :size="14" />
              Alokasi Tabungan (Saving)
            </div>
            <div class="text-xs text-[#71717A] mt-1">Sisa saldo bulanan yang tidak dialokasikan</div>
          </div>
          <div class="text-[#EC4899] font-mono text-2xl font-bold">
            {{ formatRupiah(calculatedSavingAllocation) }}
          </div>
        </div>

        <!-- Pocket List -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <h3 class="text-[#71717A] text-[11px] uppercase font-bold tracking-wider">Daftar Pockets</h3>
            <button 
              @click="showAddForm = !showAddForm"
              class="flex items-center gap-1 text-xs text-[#10B981] uppercase font-bold"
            >
              <Plus :size="14" /> {{ showAddForm ? 'Tutup' : 'Tambah Pocket' }}
            </button>
          </div>

          <!-- Add Pocket Form -->
          <Transition name="fade">
            <div v-if="showAddForm" class="bg-[#050505] p-5 rounded-[4px] border border-[#1E1E1E] space-y-4">
              <div>
                <label class="text-[#71717A] text-[10px] uppercase font-bold block mb-1">Nama Pocket</label>
                <input 
                  v-model="newPocketName"
                  type="text"
                  placeholder="e.g. Belanja, Kado"
                  class="w-full bg-[#121212] border border-[#1E1E1E] px-3 py-2 text-white text-sm rounded focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <!-- Icon selector -->
              <div>
                <label class="text-[#71717A] text-[10px] uppercase font-bold block mb-2">Pilih Icon</label>
                <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button 
                    v-for="iconName in AVAILABLE_ICONS" 
                    :key="iconName"
                    @click="newPocketIcon = iconName"
                    :class="['w-10 h-10 rounded flex items-center justify-center flex-shrink-0 transition-colors', newPocketIcon === iconName ? 'bg-[#10B981] text-black' : 'bg-[#121212] text-[#71717A] hover:bg-[#1E1E1E]']"
                  >
                    <component :is="iconMap[iconName]" :size="18" />
                  </button>
                </div>
              </div>

              <!-- Color selector -->
              <div>
                <label class="text-[#71717A] text-[10px] uppercase font-bold block mb-2">Pilih Warna</label>
                <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button 
                    v-for="color in AVAILABLE_COLORS" 
                    :key="color.name"
                    @click="newPocketColor = color.class"
                    :class="['px-3 py-2 rounded flex-shrink-0 text-xs font-bold border transition-all', color.class, newPocketColor === color.class ? 'border-white scale-95' : 'border-transparent opacity-60']"
                  >
                    {{ color.name }}
                  </button>
                </div>
              </div>

              <button 
                @click="handleAddPocket"
                :disabled="!newPocketName.trim()"
                class="w-full bg-[#10B981] text-black font-bold uppercase tracking-wider py-2.5 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buat Pocket Baru
              </button>
            </div>
          </Transition>

          <!-- Pocket List Items -->
          <div class="space-y-2">
            <div 
              v-for="pocket in store.pockets.filter(p => p.id !== 'saving' && p.id !== 'leftover')" 
              :key="pocket.id" 
              class="bg-[#050505] p-4 rounded-[4px] border border-[#1E1E1E] flex flex-col gap-3"
            >
              <div class="flex justify-between items-center">
                <div class="flex items-center gap-2.5">
                  <div :class="['w-7 h-7 rounded flex items-center justify-center', pocket.colorClass]">
                    <component :is="iconMap[pocket.icon]" :size="14" />
                  </div>
                  <div>
                    <span class="text-sm font-semibold text-white">{{ pocket.name }}</span>
                    <span v-if="pocket.isSystem" class="text-[9px] text-[#71717A] ml-2 uppercase font-mono tracking-wider">System</span>
                  </div>
                </div>
                
                <button 
                  v-if="!pocket.isSystem"
                  @click="handleDeletePocket(pocket.id)"
                  class="text-[#EF4444] hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 :size="16" />
                </button>
              </div>

              <div v-if="editingId === pocket.id" class="flex gap-2">
                <div class="flex-1 bg-[#121212] text-white font-mono text-lg p-2 rounded flex items-center justify-end">
                  {{ parseInt(editValueStr, 10).toLocaleString('id-ID') }}
                </div>
                <button 
                  @click="handleSaveField"
                  class="bg-[#10B981] text-black px-4 font-bold rounded uppercase text-xs"
                >
                  Set
                </button>
              </div>
              <div v-else class="flex justify-between items-end">
                <div>
                  <div class="text-[#71717A] text-[9px] uppercase tracking-wider">Alokasi Bulanan</div>
                  <div class="text-white font-mono text-xl font-bold">
                    {{ formatRupiah(localAllocations[pocket.id] || 0) }}
                  </div>
                </div>
                <button 
                  @click="handleEditClick(pocket.id)"
                  class="text-[#10B981] text-xs font-bold uppercase underline"
                >
                  Ubah Alokasi
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Numeric Keypad Area for allocations -->
      <Transition name="expand">
        <div v-if="editingId" class="overflow-hidden bg-black flex-shrink-0 border-t border-[#1E1E1E]">
          <div class="grid grid-cols-3 gap-1 p-1">
            <button
              v-for="key in ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'DEL']"
              :key="key"
              @click="handleKeyPress(key)"
              class="bg-[#121212] h-12 flex items-center justify-center text-xl font-mono font-bold active:bg-white active:text-black transition-colors text-white"
            >
              <template v-if="key === 'DEL'">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
              </template>
              <template v-else>
                {{ key }}
              </template>
            </button>
          </div>
        </div>
      </Transition>

      <!-- Save and Submit Actions -->
      <div class="p-4 bg-[#121212] border-t border-[#1E1E1E]">
        <button
          @click="handleSaveAll"
          :disabled="!isAllocationValid"
          :class="['w-full font-bold uppercase tracking-widest py-4 rounded-[4px] transition-colors', isAllocationValid ? 'bg-[#10B981] text-black active:bg-[#059669]' : 'bg-[#1E1E1E] text-[#71717A] cursor-not-allowed']"
        >
          Simpan Alokasi
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.expand-enter-active,
.expand-leave-active {
  transition: height 0.2s ease;
  height: 196px;
}
.expand-enter-from,
.expand-leave-to {
  height: 0;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
