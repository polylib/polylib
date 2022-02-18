import {getProp, normalizePath, setAttrValue} from "./common.js";

let wmh = 0;

const toKebab = string =>  string.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const PlPropertiesMixin = s => class plPropMixin extends s {
    _props = {};
    wmh = {};
    constructor() {
        super();
        let inst = this.constructor;
        let pi = [];
        while ( inst ) {
            if (inst.hasOwnProperty('properties')) pi.unshift(inst.properties);
            inst = inst.__proto__ ;
        }
        this._dp = Object.assign({}, ...pi);
        Object.keys(this._dp).forEach( p => {
            // возможно значение уже назначено снаружи или задано в атрибуте, запоминаем и используем его вместо дефолтного
            let attrVal = this.getAttribute(toKebab(p));
            // убираем атрибуты для свойств, если они не отображаются в атрибуты
            if (attrVal !== null && !this._dp[p].reflectToAttribute) this.removeAttribute(toKebab(p));
            let val = (this.hasOwnProperty(p) ? this[p] : undefined) ?? (this._dp[p].type === Boolean ? (attrVal !== null ? attrVal !== 'false' : undefined) : attrVal);
            Object.defineProperty(this, p, {
                get: () => this._props[p],
                set: (value) => {
                    let oldValue = this._props[p];
                    this._props[p] = value;
                    if (oldValue !== value) this.notifyChange({ action: 'upd', path: p, value, oldValue });
                },
            });
            let value = this._dp[p].value;
            if (typeof value === 'function')  value = value();
            this._props[p] = val ?? value;
            if (this._dp[p].reflectToAttribute) {
                this.addEventListener(p+'-changed', () => this.reflectToAttribute(p, this._props[p]) );
            }
            if (val) setTimeout( () => this.notifyChange({ action: 'upd', path: p, value: val, init: true }), 0);
        });
        this.addEventListener('property-change', event => {
            // запускаем эффекты для всех кого может затронуть изменение
           this._ti?.applyEffects(event.detail)

        });

    }
    connectedCallback() {
        super.connectedCallback?.();
        Object.keys(this._dp).forEach( p => {
            if (this._dp[p].reflectToAttribute) {
                //TODO: думается надо делать property effect
                this.reflectToAttribute(p,this._props[p]);
            }
        });
    }
    reflectToAttribute(name, val) {
        if (this.constructor.properties[name].type === Boolean)
            val = !!val;
        setAttrValue(/** @type HTMLElement */this,toKebab(name),val);
    }

    set(path, value, wmh) {
        let xpath = normalizePath(path);
        let xl = xpath.length;
        let x = xpath.pop();
        let obj = getProp(this, xpath);
        let oldValue = obj[x];
        (obj._props || obj)[x] = value;
        if (value === oldValue && xl === 1) return;
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
            target.push(...value);
            this.notifyChange({ action: 'splice', path, target, index: target.length - 1, addedCount: value.length, added: value });
        }
    }
    splice(path, index, deletedCount, ...added) {
        let target = this.get(path);
        let deleted = target.splice(index, deletedCount, ...added);
        this.notifyChange({ action: 'splice', path, target, index: index, deletedCount, addedCount: added?.length, added, deleted });
    }

    /** @typedef {Object} DataMutation
     * @property {String} action
     * @property {String} path - path to change relative to data host
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
        let path = m.path.split('.');
        m.wmh = m.wmh || wmh++;
        if ( this.wmh[path[0]] >= m.wmh ) return;
        this.wmh[path[0]] = m.wmh;
        if (m.value === m.oldValue && m.action === 'upd' && path.length === 1) return;
        let [name] = m.path.split('.');

        let inst = this.constructor;
        if (inst.properties[name]?.observer) {
                    this[inst.properties[name].observer](this._props[name], undefined, m);
                }

        this.dispatchEvent(new CustomEvent('property-change', { detail: m }));

        // Polymer notify
        this.dispatchEvent(new CustomEvent(name + '-changed', { detail: m }));

    }
    forwardNotify(mutation, from, to) {
        let r = new RegExp(`^(${from})(\..)?`)
        let translatedPath = mutation.path.replace(r, to+'$2');
        mutation = {...mutation, path: translatedPath};
        this.notifyChange(mutation);
    }
    hasProp(name) {
        return name in this;
    }
}
export {PlPropertiesMixin};