import {setAttrValue, toDashed} from "../../common.js";
import {getNextWM} from "./ctx.js";

export const PropertiesMixin = s => class PropMixin extends s {
    _props = {};

    constructor(config) {
        super();
        let inst = this.constructor;
        let pi = [];
        while (inst) {
            if (inst.hasOwnProperty('properties')) pi.unshift(inst.properties);
            inst = inst.__proto__;
        }
        this._dp = Object.assign({}, ...pi);
        Object.keys(this._dp).forEach( p => {
            // возможно значение уже назначено снаружи или задано в атрибуте, запоминаем и используем его вместо дефолтного
            let attrVal = (config?.root ?? this).getAttribute?.(toDashed(p));
            // убираем атрибуты для свойств, если они не отображаются в атрибуты
            if (attrVal !== null && !this._dp[p].reflectToAttribute) this.removeAttribute?.(toDashed(p));
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
        });
        setTimeout( () => {
            Object.keys(this._props).forEach( p => {
                if (this._props[p] !== this._dp[p]?.value)  this.notifyChange({ action: 'upd', path: p, value: this._props[p], init: true, wmh: getNextWM() })
            })
        })
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
        if (this._dp[name].type === Boolean)
            val = !!val;
        setAttrValue(/** @type HTMLElement */this,toDashed(name),val);
    }
}