import { setAttrValue, toDashed } from '../../common.js';
import { getNextWM } from './ctx.js';

let timer = null;
let pending = [];
function addPendingInitialization(f) {
    if (!timer) {
        timer = setTimeout(() => {
            timer = null;
            const current = pending.slice();
            pending = [];
            current.forEach(f => f());
        }, 0);
    }
    pending.push(f);
}

export const PropertiesMixin = s => class PropMixin extends s {
    _props = {};

    constructor(config) {
        super();
        let inst = this.constructor;
        const pi = [];
        while (inst) {
            if (Object.prototype.hasOwnProperty.call(inst, 'properties')) pi.unshift(inst.properties);
            inst = inst.__proto__;
        }
        this._dp = {};
        // copy props from static properties with destruction to avoid future change default value in prototype
        pi.forEach(i => Object.entries(i).forEach(([k, v]) => this._dp[k] = { ...v }));
        Object.keys(this._dp).forEach((p) => {
            // возможно значение уже назначено снаружи или задано в атрибуте, запоминаем и используем его вместо дефолтного
            const attrVal = (config?.root ?? this).getAttribute?.(toDashed(p));
            // убираем атрибуты для свойств, если они не отображаются в атрибуты
            if (attrVal !== null && !this._dp[p].reflectToAttribute) this.removeAttribute?.(toDashed(p));
            const val = (Object.prototype.hasOwnProperty.call(this, p) ? this[p] : undefined) ?? (this._dp[p].type === Boolean ? (attrVal !== null ? attrVal !== 'false' : undefined) : attrVal);
            Object.defineProperty(this, p, {
                get: () => this._props[p],
                set: (value) => {
                    const oldValue = this._props[p];
                    this._props[p] = value;
                    if (oldValue !== value) this.notifyChange({ action: 'upd', path: p, value, oldValue });
                }
            });
            if (typeof this._dp[p].value === 'function' && this._dp[p].type !== Function) this._dp[p].value = this._dp[p].value();
            this._props[p] = val ?? this._dp[p].value;
            if (this._dp[p].reflectToAttribute) {
                this.addEventListener(p + '-changed', () => this.reflectToAttribute(p, this._props[p]));
            }
        });
        addPendingInitialization(() => {
            Object.keys(this._props).forEach((p) => {
                if (this._props[p] !== this._dp[p]?.value) {
                    this.notifyChange({action: 'upd', path: p, value: this._props[p], init: true, wmh: getNextWM()});
                }
            });
        });
    }

    connectedCallback() {
        super.connectedCallback?.();
        Object.keys(this._dp).forEach((p) => {
            if (this._dp[p].reflectToAttribute) {
                // TODO: думается надо делать property effect
                this.reflectToAttribute(p, this._props[p]);
            }
        });
    }

    reflectToAttribute(name, val) {
        if (this._dp[name].type === Boolean) {
            val = Boolean(val);
        }
        setAttrValue(/** @type HTMLElement */this, toDashed(name), val);
    }
};
