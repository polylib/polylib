import { TemplateInstance } from './index.js';
import { getBindValue } from './common.js';

const PlTemplateMixin = s => class plTplMixin extends s {
    _observersBinds = [];
    /**
     * @constructor
     * @param {object} [config]
     * @param {boolean} [config.lightDom] - Использование LightDom вместо ShadowDom
     * @param {boolean} [config.delegatesFocus] - delegatesFocus flag for shadowRoot
     * @param {boolean} [config.root] - alternate root for lightDom
     */
    constructor(config) {
        super(config);
        // setup observers
        if (this.constructor.observers?.length > 0) {
            this.createObserversBinds();
        }
        this.root = config?.lightDom
            ? config?.root ?? this
            : this.attachShadow({ mode: 'open', delegatesFocus: config?.delegatesFocus });
    }

    createObserversBinds() {
        this.constructor.observers.forEach((observer) => {
            const match = observer.match(/(?<fname>[\w\d]+)\((?<args>.*)\)/);
            if (match) {
                const args = match.groups.args.split(',').map(i => i.trim());
                const depend = [match.groups.fname, ...args];
                const bind = {
                    type: 'observer',
                    depend
                };
                this._observersBinds.push(bind);
            }
        });
    }

    connectedCallback() {
        super.connectedCallback();
        const tpl = this.constructor.template;
        if (tpl) {
            const inst = new TemplateInstance(tpl);
            this._ti = inst;
            this.clear$();
            inst.attach(this.root, undefined, this);
        }

        // attach observers effects
        this._observersBinds.forEach((bind) => {
            attachObserversBind(bind, [this]);
        });

        // append styles
        if (this.constructor.css) {
            if (this.constructor.css instanceof CSSStyleSheet) {
                if (this.root.adoptedStyleSheets) {
                    this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, this.constructor.css];
                } else {
                    this.root.getRootNode().adoptedStyleSheets = [...this.root.getRootNode().adoptedStyleSheets, this.constructor.css];
                }
            } else {
                this.root.append(this.constructor.css.cloneNode(true));
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._ti?.detach();
    }
};

export function attachObserversBind(bind, contexts) {
    bind.f = () => getBindValue(bind);
    if (!bind.initiator) bind.initiator = {};

    bind.depend?.forEach((d) => {
        const ctx = contexts.find((c) => {
            return c.hasProp?.(d.split('.')[0]);
        });
        bind.initiator[d] = ctx;
        ctx.addEffect(d, bind.f);
    });
}

export { PlTemplateMixin };
