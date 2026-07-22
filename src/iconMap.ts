import type { Component } from 'vue';
import * as icons from 'lucide-vue-next';

export const iconMap: Record<string, Component> = {
    Utensils: icons.Utensils,
    Home: icons.Home,
    Fuel: icons.Fuel,
    Coffee: icons.Coffee,
    ShieldAlert: icons.ShieldAlert,
    PiggyBank: icons.PiggyBank,
    Coins: icons.Coins,
    ShoppingBag: icons.ShoppingBag,
    Gamepad2: icons.Gamepad2,
    Heart: icons.Heart,
    BookOpen: icons.BookOpen,
    Plane: icons.Plane,
    Car: icons.Car,
    Gift: icons.Gift,
    Sparkles: icons.Sparkles,
    Trash2: icons.Trash2,
    Plus: icons.Plus,
    X: icons.X,
    ArrowLeftRight: icons.ArrowLeftRight,
    AlertCircle: icons.AlertCircle,
    Settings: icons.Settings,
    RefreshCw: icons.RefreshCw,
    BarChart3: icons.BarChart3,
    LayoutGrid: icons.LayoutGrid,
    TrendingUp: icons.TrendingUp,
    TrendingDown: icons.TrendingDown,
    ChevronLeft: icons.ChevronLeft,
    ChevronRight: icons.ChevronRight,
};

export const resolveIcon = (name: string): Component => iconMap[name] || icons.Sparkles;
