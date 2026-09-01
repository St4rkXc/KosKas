/**
 * @module iconMap
 * @description Maps Lucide icon name strings to their corresponding Vue components.
 * Used by the dynamic `<component :is="resolveIcon(name)">` pattern in templates
 * where icon names are stored as data (e.g., pocket icon configuration).
 */
import type { Component } from 'vue';
import * as icons from 'lucide-vue-next';

/** Lookup table mapping icon name strings to Lucide Vue components. */
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

/**
 * Resolve an icon name string to its Vue component, falling back to Sparkles if not found.
 * @param name - The Lucide icon name (e.g., "Utensils", "Home").
 * @returns The corresponding Vue component, or the Sparkles icon as a fallback.
 * @example
 * const icon = resolveIcon("Utensils"); // Icons.Utensils component
 * const fallback = resolveIcon("Unknown"); // Icons.Sparkles component
 */
export const resolveIcon = (name: string): Component => iconMap[name] || icons.Sparkles;
