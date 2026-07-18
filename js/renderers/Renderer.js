/**
 * Renderer - shared base for the tab renderers. Holds references to the app's
 * state/engine/points and provides DOM-safe HTML escaping + number animation.
 * Renderers are pure view: they read state and write DOM, never mutate scores.
 */
(function (global) {
    'use strict';

    class Renderer {
        constructor(app) {
            this.app = app;
            this.state = app.state;
            this.engine = app.engine;
            this.points = app.points;
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        $(id) { return document.getElementById(id); }

        /** Count up/down to a new value for the quick-stat cards. */
        animateNumber(elementId, newValue) {
            const el = this.$(elementId);
            if (!el) return;
            const current = parseInt(el.textContent, 10) || 0;
            if (current === newValue) return;
            el.classList.add('updating');
            const steps = 20, duration = 500;
            const inc = (newValue - current) / steps;
            let val = current, step = 0;
            const timer = setInterval(() => {
                step++; val += inc;
                if (step >= steps) {
                    el.textContent = newValue;
                    clearInterval(timer);
                    setTimeout(() => el.classList.remove('updating'), 500);
                } else {
                    el.textContent = Math.round(val);
                }
            }, duration / steps);
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.renderers = global.Hive.renderers || {};
    global.Hive.renderers.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
