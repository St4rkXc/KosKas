import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useAuth } from './composables/useAuth';
import './index.css';

const app = createApp(App);
const pinia = createPinia();

app.config.errorHandler = (err, _instance, info) => {
    console.error('Unhandled Vue error:', err, info);
};

app.config.warnHandler = (msg, _instance, trace) => {
    console.warn('Vue warning:', msg, trace);
};

app.use(pinia);

const { initAuth } = useAuth();
initAuth().then(() => {
    app.mount('#root');
});
