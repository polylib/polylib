import {TemplateInstance} from "./index.js";

const PlTemplateMixin = s => class plTplMixin extends s {
    /**
     * @constructor
     * @param {object} [config]
     * @param {boolean} [config.lightDom] - Использование LightDom вместо ShadowDom
     * @param {boolean} [config.delegatesFocus] - delegatesFocus flag for shadowRoot
     */
    constructor(config) {
        super(config);
        this.root = config?.lightDom ? config?.root ?? this : this.attachShadow({ mode: 'open', delegatesFocus: config?.delegatesFocus });
    }
    connectedCallback() {
        super.connectedCallback();
        let tpl = this.constructor.template;
        if (tpl) {
            let inst = new TemplateInstance(tpl);
            this._ti = inst;
            inst.attach(this.root, undefined, this);
        }
        // append styles
        if (this.constructor.css) {
            if (this.constructor.css instanceof CSSStyleSheet) {
                if (this.root.adoptedStyleSheets)
                    this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, this.constructor.css];
                else
                    this.root.getRootNode().adoptedStyleSheets = [...this.root.getRootNode().adoptedStyleSheets, this.constructor.css];
            } else {
                this.root.append(this.constructor.css.cloneNode(true))
            }
        }
    }
    disconnectedCallback() {
        this._ti?.detach();
    }
}

export {PlTemplateMixin};