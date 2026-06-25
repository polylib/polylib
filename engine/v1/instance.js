import { findByNPath, getBindValue } from '../../common.js';
import { createBind, getBackApl } from './template.js';

export class TemplateInstance {
    /** Nested template instances */
    nti = [];
    constructor(template) {
        this.tpl = template;
        this.clone = this.tpl.getClone();
        this.tpl.svgCE.forEach((path) => {
            const node = findByNPath(this.clone, path);
            const constr = customElements.get(node.getAttribute('is'));
            node.ctx = new constr({ lightDom: true, root: node });
            this.tpl.afterStampHooks.push({ path, hook: node => node.ctx.connectedCallback() });
        });
        // save clone node list to future detach
        this._nodes = [...this.clone.childNodes];
        this.binds = this.tpl.binds.map(b => ({ ...b, node: findByNPath(this.clone, b.path) }));
    }

    attach(target, before, context) {
        this.ctx = Array.isArray(context) ? context : [context];
        const tw = document.createTreeWalker(this.clone, NodeFilter.SHOW_COMMENT, { acceptNode: n => n._tpl ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
        while (tw.nextNode()) tw.currentNode._hctx = this.ctx;

        this.tpl.stampHooks.forEach(h => h.hook(findByNPath(this.clone, h.path), this.ctx));
        // build effect map
        this.binds.forEach((b) => {
            this.attachBind(b);
        });
        // apply binds
        this.applyBinds();
        this.insert(target, before);
        this.tpl.afterStampHooks.forEach(h => h.hook(findByNPath({ childNodes: this._nodes }, h.path), this.ctx));
        return this;
    }

    _publishRef(host, id, element) {
        if (!host?._$ || !(id in host._$) || host._$[id] === element) return;
        host._$[id] = element;
        host.notifyChange({ action: 'upd', path: ['$', id], value: element });
    }

    _notifyStampedRefs() {
        for (const host of this.ctx ?? []) {
            if (!host?._$) continue;
            for (const id of Object.keys(host._$)) {
                if (host._$[id]) continue;
                const path = this.tpl.idPaths.get(id);
                if (!path) continue;
                const node = findByNPath({ childNodes: this._nodes }, path);
                if (node?.id === id) this._publishRef(host, id, node);
            }
        }
    }

    _notifyDetachedRefs() {
        for (const host of this.ctx ?? []) {
            if (!host?._$) continue;
            for (const id of Object.keys(host._$)) {
                if (!host._$[id]) continue;
                host._$[id] = null;
                host.notifyChange({ action: 'upd', path: ['$', id], value: null });
            }
        }
    }

    insert(target, before) {
        target = before?.parentNode ?? target;
        if (before) {
            target.insertBefore(this.clone, before);
        } else {
            target.appendChild(this.clone);
        }
        this._notifyStampedRefs();
    }

    attachBind(bind) {
        const node = bind.node;
        if (!node) return;
        bind.f = m => this.applyBind(bind, m);
        if (!bind.initiator) bind.initiator = {};
        bind.depend?.forEach((d) => {
            bind.initiator[d] = this.addEffect(d, bind.f);
        });
        if (bind.twoSide) {
            getBackApl(bind)(bind.node, this.ctx);
        }
    }

    applyBind(bind, m) {
        const node = bind.node;
        if (!node) return;
        let val = getBindValue(bind);
        val = bind.negate ? !val : val;
        bind.apl(node.ctx || node, this.ctx, m, val, bind.initiator[bind.depend[0]]);
    }

    applyBinds() {
        this.binds.forEach((bind) => {
            this.applyBind(bind);
        });
    }

    detach() {
        this.__detached = true;

        this.nti.forEach(t => t.detach());
        // TODO: detach property effects, events etc...
        this.binds.forEach((b) => {
            if (b.initiator) {
                Object.entries(b.initiator).forEach(([k, i]) => {
                    const ind = i?._em[k].indexOf(b.f);
                    if (ind >= 0) i._em[k].splice(ind, 1);
                });
            }
        });
        this._nodes.forEach(n => n.remove());
        this._notifyDetachedRefs();
    }

    /**
     *
     * @param path
     * @param {Function} cb
     */
    addEffect(path, cb) {
        // find dataContext for property
        const prop = path.split('.')[0];
        const ctx = this.ctx.find((c) => {
            return c.hasProp?.(prop);
        });
        ctx?.addEffect(path, cb);
        return ctx;
    }

    removeBind(path, prop) {
        const targetNode = findByNPath({ childNodes: this._nodes }, path);
        if (!targetNode) return;
        const tib = this.binds;
        const binds = tib.filter(i => i.node === targetNode && i.name === prop);

        // check and remove current bind if exist
        binds.forEach((b) => {
            if (b.twoSide) {
                targetNode.removeEventListener(b.eventBB, b.funcBB);
            }
            b.depend.forEach((d) => {
                const em = (b.initiator[d]?._em ?? this._em)[d];
                if (em) {
                    const ind = em.indexOf(b.f);
                    if (ind >= 0) em.splice(ind, 1);
                }
            });
            delete tib[tib.indexOf(b)];
        });
    }

    replaceBind(path, property, value) {
        this.removeBind(path, property);
        const bind = createBind(property, value);
        bind.path = path;
        this.binds.push(bind);
        this.attachBind(bind);
        // ti.addEffect(bindVal.name2 ?? bindVal.name, bind.f);
        // call apply to set prop value via property effect
        this.applyBind(bind);
    }

    querySelector(selector) {
        return this.clone.querySelector(selector);
    }
}
