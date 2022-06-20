import {getProp, isSubPath, normalizePath, stringPath} from "../../common.js";
let wmh = 0;
export const ContextMixin = s => class dataContext extends s {
    _em = {};
    wmh = {};
    set(path, value, wmh) {
        let xpath = normalizePath(path);
        let xl = xpath.length;
        let x = xpath.pop();
        let obj = getProp(this, xpath);
        let oldValue = obj[x];
        //TODO: move _props to props mixin
        if (obj._props?.[x]) obj._props[x] = value; else obj[x] = value;
        if (value === oldValue/* && xl === 1*/) return;
        this.notifyChange({ action: 'upd', path, value, oldValue, wmh});
    }

    get(path) {
        path = normalizePath(path);
        return getProp(this, path);
    }
    push(path,value) {
        let target = this.get(path);
        if (Array.isArray(target)) {
            if (!Array.isArray(value)) value = [value]
            let len = target.push(...value);
            this.notifyChange({ action: 'splice', path, target, index: target.length - 1, addedCount: value.length, added: value });
            return len;
        }
    }
    splice(path, index, deletedCount, ...added) {
        let target = this.get(path);
        let deleted = target.splice(index, deletedCount, ...added);
        this.notifyChange({ action: 'splice', path, target, index: index, deletedCount, addedCount: added?.length, added, deleted });
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
        let path = normalizePath(m.path);
        m.wmh = m.wmh || getNextWM();
        if ( this.wmh[path[0]] >= m.wmh ) return;
        this.wmh[path[0]] = m.wmh;
        if (m.value === m.oldValue && m.action === 'upd' && path.length === 1) return;
        let name = path[0];
        //TODO: move to prop mixin as effects
        let inst = this.constructor;
        if (inst.properties?.[name]?.observer) {
            this[inst.properties[name].observer](this._props[name], m.oldValue, m);
        }
        this.applyEffects(m);

        // Polymer-like notify for upward binds
        this.dispatchEvent(new CustomEvent(name + '-changed', { detail: m }));

    }
    forwardNotify(mutation, from, to) {
        let r = new RegExp(`^(${from})(\..)?`);
        let path = mutation.path;
        if (Array.isArray(path)) path = path.join('.');
        path = path.replace(r, to+'$2');
        mutation = {...mutation, path};
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
        let effectMap = this._em;
        effectMap && Object.keys(effectMap).forEach( k => {
            if (!m || isSubPath(stringPath(m.path), k)) {
                effectMap?.[k]?.forEach( f => f(m) );
            }
        });
    }
}

export function getNextWM() {
    return wmh++;
}