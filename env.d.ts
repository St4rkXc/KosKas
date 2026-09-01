/**
 * @module env
 * @description Global type declarations for Vite environment and Vue SFC modules.
 * Enables TypeScript to resolve `import.meta.env` and `.vue` file imports.
 */
/// <reference types="vite/client" />
/** Declares `.vue` files as Vue `DefineComponent` for TypeScript imports. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
