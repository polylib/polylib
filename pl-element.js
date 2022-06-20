import {PlTemplateMixin} from "./template-mixin.js";
import {PropertiesMixin} from "./engine/v1/properties.js";
import {ContextMixin} from "./engine/v1/ctx.js";

export class PlElement extends PlTemplateMixin(PropertiesMixin(ContextMixin(HTMLElement))) {
    //static template;
    _$ = {};
    /**
     * @constructor
     * @param {object} [config]
     * @param {boolean} [config.lightDom] - Использование LightDom вместо ShadowDom
     */
    constructor(config) {
        super(config);
        this.$ = new Proxy(this._$, {
            get: (target,name) => {
                if (!(name in target)) {
                    target[name] = this.root.querySelector('#'+name) ?? this._ti.querySelector('#'+name);
                }
                return target[name];
            }
        })
    }
    connectedCallback() {
        super.connectedCallback()
    }

}

export class PlSVGElement extends PlTemplateMixin(PropertiesMixin(ContextMixin(EventTarget))) {
    //static template;
    _$ = {};
    isSVGCustomElement = true;
    /**
     * @constructor
     * @param {object} [config]
     * @param {boolean} [config.lightDom] - Использование LightDom вместо ShadowDom
     */
    constructor(config) {
        super(config);
        this.$ = new Proxy(this._$, {
            get: (target,name) => {
                if (!(name in target)) {
                    target[name] = this.root.querySelector('#'+name) ?? this._ti.querySelector('#'+name);
                }
                return target[name];
            }
        })
    }
}