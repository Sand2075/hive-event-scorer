/**
 * Toast - tiny non-blocking notification in the top-right corner.
 *
 * Used instead of blocking confirm()/beforeunload prompts: e.g. when the host
 * starts a new game we gently remind them to save tournament progress. Toasts
 * auto-dismiss after a timeout and can be dismissed early by clicking; they never
 * stack up or block the page.
 */
(function (global) {
    'use strict';

    const Toast = {
        _stack: null,

        _ensureStack() {
            if (this._stack && document.body.contains(this._stack)) return this._stack;
            let el = document.querySelector('.toast-stack');
            if (!el) {
                el = document.createElement('div');
                el.className = 'toast-stack';
                document.body.appendChild(el);
            }
            this._stack = el;
            return el;
        },

        /**
         * @param {string} message  body text
         * @param {object} opts  { title, type: 'info'|'warning', duration (ms) }
         */
        show(message, opts = {}) {
            const stack = this._ensureStack();
            const toast = document.createElement('div');
            toast.className = 'toast' + (opts.type ? ' ' + opts.type : '');
            toast.innerHTML = (opts.title ? `<strong>${opts.title}</strong>` : '') +
                `<span>${message}</span>`;

            const remove = () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 220);
            };
            toast.addEventListener('click', remove);

            stack.appendChild(toast);
            // Force reflow so the transition runs.
            requestAnimationFrame(() => toast.classList.add('show'));

            const duration = opts.duration === undefined ? 5000 : opts.duration;
            if (duration > 0) setTimeout(remove, duration);
        }
    };

    global.Hive = global.Hive || {};
    global.Hive.Toast = Toast;

    if (typeof module !== 'undefined' && module.exports) module.exports = Toast;
})(typeof window !== 'undefined' ? window : globalThis);
