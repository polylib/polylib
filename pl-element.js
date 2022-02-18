import {PlPropertiesMixin} from "./property-mixin.js";
import {PlTemplateMixin} from "./template-mixin.js";

class PlElement extends PlTemplateMixin(PlPropertiesMixin(HTMLElement)) {
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

export { PlElement }
export { html, css } from "./template.js";