/**
 * @module main
 * @description Application entry point. Initializes Supabase auth before mounting the Vue app.
 * Sets up global error/warning handlers, creates the Pinia store, and mounts to `#root`.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useAuth } from './composables/useAuth';
import './index.css';

const app = createApp(App);
const pinia = createPinia();

/** Global Vue error handler — logs unhandled component errors. */
app.config.errorHandler = (err, _instance, info) => {
    console.error('Unhandled Vue error:', err, info);
};

/** Global Vue warning handler — logs component warnings. */
app.config.warnHandler = (msg, _instance, trace) => {
    console.warn('Vue warning:', msg, trace);
};

app.use(pinia);

const { initAuth } = useAuth();
/** Resolve auth session before mounting to prevent UI flash. */
initAuth().then(() => {
    app.mount('#root');
});
