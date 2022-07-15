import {getNPath, getRandomId, normalizePath} from "../../common.js";
import {createBind, DIRECTIVE_SCHEME, Template} from "./template.js";
import {ContextMixin} from "./ctx.js";
import {PropertiesMixin} from "./properties.js";
import {TemplateInstance} from "./instance.js";

class Repeater extends PropertiesMixin(ContextMixin(EventTarget)) {
    clones = [];
    static properties = {
        items: { type: Array, observer: 'onChangeData' },
        as: { type: String, value: 'item' },
        tpl: { type: Object },
        anchor: { type: Object }
    }
    constructor(tpl,anchor) {
        super();
        this.tpl = tpl;
        this.anchor = anchor;
        if(this.items) {
            this.renderItems(this.items,anchor)
        }
    }
    renderItems(items, sibling) {
        return items && items.map( i => this.renderItem(i, sibling) );
    }
    renderItem(item, sibling) {
        if (!this.tpl) return;
        let inst = new TemplateInstance(this.tpl);

        let itemContext = new RepeatItem(item, this.as, (ctx, m) => this.onItemChanged(ctx, m));
        itemContext._ti = inst
        inst.attach(null, sibling || this.anchor, [itemContext, this, ...this.pti ]);
        return itemContext;
    }

    /**
     *
     * @param val
     * @param old
     * @param {DataMutation} mutation
     */
    onChangeData(val, old, mutation) {
        let [, index, ...rest] = normalizePath(mutation.path);
        switch (mutation.action) {
            case 'splice':
                // deleted
                // ensure that path for this repeater
                //TODO: update clone indexes on splices
                if (mutation.path === 'items') {
                    for (let ind = mutation.index; ind < mutation.deletedCount + mutation.index; ind++) {
                        this.detachClone(this.clones[ind]);
                    }
                    this.clones.splice(mutation.index, mutation.deletedCount);
                    // added
                    let sibling = this.clones[mutation.index]?._ti._nodes[0];
                    let clones = this.renderItems(mutation.added, sibling, mutation.index);
                    this.clones.splice(mutation.index, 0, ...clones);
                    this.anchor.dispatchEvent(new CustomEvent('dom-changed', { bubbles: true, composed: true }));
                    break;
                }
            // noinspection FallThroughInSwitchStatementJS
            case 'upd':
                if (Number.isInteger(+index) && +index >= 0) {
                    // ищем клон
                    let clone = this.clones[+index];
                    let path = [this.as, ...rest].join('.');
                    if (path === this.as) {
                        clone.set(this.as, mutation.value);
                    } else {
                        clone.applyEffects({...mutation, path});
                    }
                } else if (index === undefined) {
                    if (old !== val) {
                        let items = this.items?.slice?.() || [];
                        let i = 0;
                        while (items.length && i < this.clones.length) {
                            this.clones[i].set(this.as, items.shift());
                            i++;
                        }
                        if ( i < this.clones.length ) {
                            let deleted = this.clones.splice(i, this.clones.length - i);
                            deleted.forEach( c => this.detachClone(c));
                        }
                        if ( items.length ) this.clones.push(...this.renderItems(items, this.anchor));
                    }
                    this.anchor.dispatchEvent(new CustomEvent('dom-changed', { bubbles: true, composed: true }));
                }
                break;
        }
    }
    onItemChanged(ctx, m) {

        let ind = this.clones.findIndex( i => i[this.as] === ctx[this.as]);
        if (ind < 0) console.warn('repeat item not found');
        if (m.path === this.as) {
            this.set(['items', ind], m.value, m.wmh);
        } else {
            this.forwardNotify(m,this.as, 'items.'+ind);
        }

    }
    dirtyRefresh() {
        this.clones.forEach(c => this.detachClone(c));
        this.clones = this.renderItems(this.items, this.anchor) ||[];
    }
    detachClone(clone) {
        clone._ti.detach();
        //clone.dom.forEach(n => n.remove())
    }
    detach() {
        this.clones.forEach(c => this.detachClone(c));
    }
}

class RepeatItem extends ContextMixin(EventTarget) {
    constructor(item, as, cb) {
        super();
        this.as = as;
        this[as] = item;
        this.addEffect(as, m => cb(this, m))
    }
    get model() {
        return this[this.as];
    }
}

export default function repeatDirective(node, template) {
    let content = template.svg ? template.tpl.content.childNodes[0] : template.tpl.content;
    let nPath = getNPath(content, node);
    // add 'as' bind first to ensure it assigned before 'items'
    let as = node.getAttribute(DIRECTIVE_SCHEME+':as') ?? 'item';
    let b = createBind('as', as, nPath);
    if (b) template.binds.push(b); else node.as = node.getAttribute(DIRECTIVE_SCHEME+':as');
    b = createBind('items', node.getAttribute(DIRECTIVE_SCHEME+':repeat'), nPath);
    if (b) template.binds.push(b);
    node.removeAttribute(DIRECTIVE_SCHEME+':repeat');
    node.removeAttribute(DIRECTIVE_SCHEME+':as');
    let id = getRandomId();
    let ph = document.createComment('repeat:'+id);
    node.parentNode.replaceChild(ph, node);
    let tpl = new Template(node);
    template.nestedTemplates.set(id, tpl);
    template.stampHooks.push({path: nPath, hook: stampRepeater})
    tpl.id = id;
    tpl.as = as;
    return ph;
}

function stampRepeater(node, ctx) {
    node.ctx = new Repeater();
    node.ctx.pti = ctx;
    node.ctx.anchor = node;
    node.ctx.tpl = node._tpl;
    node.ctx.as = node._tpl.as;
    ctx[0]._ti.nti.push(node.ctx);
}