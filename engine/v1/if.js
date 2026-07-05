import { getNPath, getRandomId } from '../../common.js';
import { createBind, DIRECTIVE_SCHEME, Template } from './template.js';
import { ContextMixin } from './ctx.js';
import { PropertiesMixin } from './properties.js';
import { TemplateInstance } from './instance.js';

class IfController extends PropertiesMixin(ContextMixin(EventTarget)) {
    _display = new WeakMap();

    static properties = {
        if: { type: Boolean, observer: 'onIfChanged' },
        restamp: { type: Boolean, value: false }
    };

    onIfChanged(condition) {
        if (condition) {
            if (!this._ti) this.render();
            else this.show();
        } else if (this._ti) {
            if (this.restamp) {
                this.detach();
            } else {
                this.hide();
            }
        }
    }

    render() {
        const ti = new TemplateInstance(this.tpl);
        this._ti = ti;
        ti.attach(null, this.anchor, [this, ...this.pti]);
    }

    show() {
        this._ti?._nodes.forEach((node) => {
            if (node instanceof Element && this._display.has(node)) {
                node.style.display = this._display.get(node);
                this._display.delete(node);
            }
        });
    }

    hide() {
        this._ti?._nodes.forEach((node) => {
            if (node instanceof Element) {
                if (!this._display.has(node)) {
                    this._display.set(node, node.style.display);
                }
                node.style.display = 'none';
            }
        });
    }

    detach() {
        this._ti?.detach();
        this._ti = undefined;
    }
}

export default function ifDirective(node, template) {
    const content = template.svg ? template.tpl.content.childNodes[0] : template.tpl.content;
    const nPath = getNPath(content, node);

    const bind = createBind('if', node.getAttribute(DIRECTIVE_SCHEME + ':if'), nPath);
    if (bind) template.binds.push(bind);

    const restampExpr = node.getAttribute(DIRECTIVE_SCHEME + ':restamp');
    if (restampExpr !== null) {
        const restampBind = restampExpr ? createBind('restamp', restampExpr, nPath) : null;
        if (restampBind) template.binds.push(restampBind);
    }

    node.removeAttribute(DIRECTIVE_SCHEME + ':if');
    node.removeAttribute(DIRECTIVE_SCHEME + ':restamp');

    const id = getRandomId();
    const ph = document.createComment('if:' + id);
    node.parentNode.replaceChild(ph, node);
    const tpl = new Template(node);
    tpl.restamp = restampExpr !== null && !restampExpr;
    template.nestedTemplates.set(id, tpl);
    template.stampHooks.push({ path: nPath, hook: stampIf });
    tpl.id = id;
    return ph;
}

function stampIf(node, ctx) {
    node.ctx = new IfController();
    node.ctx.pti = ctx;
    node.ctx.anchor = node;
    node.ctx.tpl = node._tpl;
    node.ctx.restamp = Boolean(node._tpl.restamp);
    ctx[0]._ti.nti.push(node.ctx);
}
