import { computed, type Ref } from "vue";

export function useDateUtils(nowDate?: Ref<Date>) {
    const now = nowDate || computed(() => new Date());

    const currentDateStr = computed(() => {
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const d = now.value;
        return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    });

    function formatDateTime(timestamp: number) {
        const date = new Date(timestamp);
        const n = now.value;

        const isToday = date.getDate() === n.getDate() &&
                        date.getMonth() === n.getMonth() &&
                        date.getFullYear() === n.getFullYear();

        const yesterday = new Date(n);
        yesterday.setDate(n.getDate() - 1);
        const isYesterday = date.getDate() === yesterday.getDate() &&
                            date.getMonth() === yesterday.getMonth() &&
                            date.getFullYear() === yesterday.getFullYear();

        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        if (isToday) {
            return `Hari ini, ${timeStr}`;
        } else if (isYesterday) {
            return `Kemarin, ${timeStr}`;
        } else {
            const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            return `${date.getDate()} ${monthsShort[date.getMonth()]}, ${timeStr}`;
        }
    }

    return {
        currentDateStr,
        formatDateTime,
    };
}
