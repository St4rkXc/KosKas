import { describe, it, expect } from 'vitest';
import { resolveIcon, iconMap } from './iconMap';
import * as icons from 'lucide-vue-next';
import { AVAILABLE_ICONS } from './types';

describe('iconMap', () => {
  it('should contain all expected default icons', () => {
    const expectedIcons = [
      'Utensils',
      'Home',
      'Fuel',
      'Coffee',
      'ShieldAlert',
      'PiggyBank',
      'Coins',
      'ShoppingBag',
      'Gamepad2',
      'Heart',
      'BookOpen',
      'Plane',
      'Car',
      'Gift',
      'Sparkles',
    ];
    expectedIcons.forEach((name) => {
      expect(iconMap[name]).toBeDefined();
    });
  });

  it('should contain utility icons', () => {
    const utilityIcons = [
      'Trash2',
      'Plus',
      'X',
      'ArrowLeftRight',
      'AlertCircle',
      'Settings',
      'RefreshCw',
      'BarChart3',
      'LayoutGrid',
      'TrendingUp',
      'TrendingDown',
      'ChevronLeft',
      'ChevronRight',
    ];
    utilityIcons.forEach((name) => {
      expect(iconMap[name]).toBeDefined();
    });
  });
});

describe('resolveIcon', () => {
  it('should return the correct component for a known icon name', () => {
    const result = resolveIcon('Utensils');
    expect(result).toBe(icons.Utensils);
  });

  it('should return the correct component for Sparkles', () => {
    const result = resolveIcon('Sparkles');
    expect(result).toBe(icons.Sparkles);
  });

  it('should return the correct component for Trash2', () => {
    const result = resolveIcon('Trash2');
    expect(result).toBe(icons.Trash2);
  });

  it('should fall back to Sparkles for an unknown icon name', () => {
    const result = resolveIcon('NonExistentIcon');
    expect(result).toBe(icons.Sparkles);
  });

  it('should fall back to Sparkles for an empty string', () => {
    const result = resolveIcon('');
    expect(result).toBe(icons.Sparkles);
  });

  it('should resolve all AVAILABLE_ICONS from types', () => {
    AVAILABLE_ICONS.forEach((name) => {
      const resolved = resolveIcon(name);
      expect(resolved).toBeDefined();
      // All should resolve to their actual icon, not the fallback
      // (unless the icon is Sparkles itself, which is also the fallback)
      if (name !== 'Sparkles') {
        expect(resolved).toBe((icons as Record<string, unknown>)[name]);
      }
    });
  });

  it('should resolve each mapped icon to its lucide equivalent', () => {
    Object.entries(iconMap).forEach(([name, component]) => {
      const resolved = resolveIcon(name);
      expect(resolved).toBe(component);
    });
  });
});
