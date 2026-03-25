import { getProp, isSubPath, normalizePath, stringPath } from '../../common.js';

const WMH_MAX_VALUE = 2 ** 32;

let wmh = 0;
export const ContextMixin = s => class dataContext extends s {
    _em = {};
    wmh = {};
    set(path, value, wmh) {
        const xpath = normalizePath(path);
        const x = xpath.pop();
        const obj = getProp(this, xpath);
        if (obj === null || obj === undefined) return;
        const oldValue = obj[x];
        // TODO: move _props to props mixin
        if (obj._props?.[x]) {
            obj._props[x] = value;
        } else {
            obj[x] = value;
        }
        if (value === oldValue/* && xl === 1 */) return;
        this.notifyChange({ action: 'upd', path, value, oldValue, wmh });
    }

    get(path) {
        path = normalizePath(path);
        return getProp(this, path);
    }

    push(path, value) {
        const target = this.get(path);
        if (Array.isArray(target)) {
            if (!Array.isArray(value)) value = [value];
            const len = target.push(...value);
            this.notifyChange({ action: 'splice', path, target, index: target.length - value.length, addedCount: value.length, added: value });
            return len;
        }
    }

    splice(path, index, deletedCount, ...added) {
        const target = this.get(path);
        const deleted = target.splice(index, deletedCount, ...added);
        this.notifyChange({ action: 'splice', path, target, index, deletedCount, addedCount: added?.length, added, deleted });
    }

    assign(path, object) {
        Object.entries(object)
            .forEach(([property, value]) => {
                this.set(path + '.' + property, value);
            });
    }

    /** @typedef {Object} DataMutation
     * @property {String} action
     * @property {String|Array} path - path to change relative to data host
     * @property {any} value - new value
     * @property {any} oldValue - value before mutation
     * @property {Number} [wmh] - watermark for change loop detection
     * @property {Number} [index] - start for splice mutation
     * @property {Number} [addedCount]
     * @property {Number} [deletedCount]
     * @property {Object[]} [added]
     * @property {Object[]} [deleted]
     */

    /**
     *
     * @param {DataMutation} m
     */
    notifyChange(m) {
        const path = normalizePath(m.path);
        const textPath = path.join('.');
        m.wmh = m.wmh || getNextWM();
        if (this.wmh[textPath] >= m.wmh && this.wmh[textPath] - m.wmh < WMH_MAX_VALUE / 2) return;
        this.wmh[textPath] = m.wmh;
        if (m.value === m.oldValue && m.action === 'upd' && path.length === 1) return;
        this.applyEffects(m);
        const name = path[0];
        // Порядок важен, чтобы вызывались сначала внутренние обсерверы компонента, а потом остальные
        if (this._dp?.[name]?.observer) {
            this[this._dp[name].observer](this._props[name], m.oldValue, m);
        }
        // Polymer-like notify for upward binds
        this.dispatchEvent(new CustomEvent(name + '-changed', { detail: m }));
    }

    forwardNotify(mutation, from, to) {
        const r = new RegExp(`^(${from})(\\..)?`);
        let path = mutation.path;
        if (Array.isArray(path)) path = path.join('.');
        path = path.replace(r, to + '$2');
        mutation = { ...mutation, path };
        this.notifyChange(mutation);
    }

    hasProp(name) {
        return name in this;
    }

    addEffect(path, effect) {
        if (this._em[path]) {
            this._em[path].push(effect);
        } else {
            this._em[path] = [effect];
        }
    }

    /**
     *
     * @param {DataMutation} m
     */
    applyEffects(m) {
        const effectMap = this._em;
        effectMap && Object.keys(effectMap).forEach((k) => {
            if (!m || isSubPath(stringPath(m.path), k)) {
                effectMap?.[k]?.forEach(f => f(m));
            }
        });
    }

    _hooks = new Map();
    registerHook(hook, cb) {
        if (!this._hooks.has(hook)) this._hooks.set(hook, new Set());
        this._hooks.get(hook).add(cb);
    }

    runHooks(hook) {
        this._hooks.get(hook)?.forEach(hook => hook());
    }

    disconnectedCallback() {
        this.runHooks('disconnected');
    }
};

export function getNextWM() {
    wmh++;
    if (wmh >= WMH_MAX_VALUE) {
        wmh = 0;
    }
    return wmh;
}
