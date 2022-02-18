import {TemplateInstance} from "./template.js";

const PlTemplateMixin = s => class plTplMixin extends s {
    /**
     * @constructor
     * @param {object} [config]
     * @param {boolean} [config.lightDom] - Использование LightDom вместо ShadowDom
     */
    constructor(config) {
        super();
        this.root = config?.lightDom ? this : this.attachShadow({ mode: 'open' });
    }
    connectedCallback() {
        super.connectedCallback();
        let tpl = this.constructor.template;
        if (tpl) {
            let inst = new TemplateInstance(tpl);
            this._ti = inst;
            inst.attach(this);
        }
        // append styles
        if (this.constructor.css) {
            if (this.constructor.css instanceof CSSStyleSheet) {
                if (this.root.adoptedStyleSheets) this.root.adoptedStyleSheets = [this.constructor.css];
            } else {
                this.root.append(this.constructor.css)
            }
        }
    }
    disconnectedCallback() {
        this._ti?.detach();
    }
}

export {PlTemplateMixin};