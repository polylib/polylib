import {findByNPath} from "../../common.js";
import {createBind, getBackApl} from "./template.js";

export class TemplateInstance {
    /** Nested template instances */
    nti = [];
    constructor(template) {
        this.tpl = template
        this.clone = this.tpl.getClone();
        this.tpl.svgCE.forEach( path => {
            let node = findByNPath(this.clone, path);
            let constr = customElements.get(node.getAttribute('is'));
            node.ctx = new constr({lightDom: true, root: node});
            this.tpl.afterStampHooks.push( { path , hook: node => node.ctx.connectedCallback() } )
        })
        // save clone node list to future detach
        this._nodes =  [...this.clone.childNodes];
        this.binds = this.tpl.binds.map( b => ({...b, node: findByNPath(this.clone, b.path) }));
    }
    attach(target, before, context) {
        this.ctx = Array.isArray(context) ? context : [context];
        let tw = document.createTreeWalker(this.clone, NodeFilter.SHOW_COMMENT, { acceptNode: n => n._tpl ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT } );
        while( tw.nextNode() ) tw.currentNode._tpl._hctx = this.ctx;

        this.tpl.stampHooks.forEach( h => h.hook(findByNPath(this.clone, h.path), this.ctx));
        // build effect map
        this.binds.forEach(b => {
            this.attachBind(b);
        })
        // apply binds
        this.applyBinds();
        this.insert(target, before);
        this.tpl.afterStampHooks.forEach( h => h.hook(findByNPath({childNodes: this._nodes}, h.path), this.ctx));
        return this;
    }
    insert(target, before) {
        target = before?.parentNode ?? target;
        target.insertBefore(this.clone, before);
    }
    attachBind(bind) {
        let node = bind.node;
        if (!node) return;
        bind.f = (m) => this.applyBind(bind,m);
        bind.depend?.forEach(d => {
            if (!bind.initiator) bind.initiator = {};
            bind.initiator[d] = this.addEffect(d, bind.f);
        })
        if (bind.twoSide) {
            getBackApl(bind)(bind.node, this.ctx);
        }
    }
    applyBind(bind, m) {
        let node = bind.node;
        if (!node) return;
        let val = this.getBindValue(bind);
        val = bind.negate ? !val : val;
        bind.apl(node.ctx || node , this.ctx, m, val, bind.initiator[bind.depend[0]] );
    }
    applyBinds() {
        this.binds.forEach(bind => {
            this.applyBind(bind);
        });
    }
    getBindValue(bind) {
        let dv = bind.depend.map(p => {
            if (/['"]/.test(p)) {
                return p.replace(/["']/g, "")
            } else {
                return bind.initiator[p]?.get(p);
            }
        });

        if (dv.length > 1) {
            let [fn,...args] = dv;
            if (!fn) {
                console.error('Function not found in context: %s(%s)', bind.depend[0], bind.depend.slice(1).join(','));
                return;
            }
            //TODO: ctx for function
            return fn.apply(bind.initiator[bind.depend[0]], args);
        } else {
            return dv[0];
        }
    }
    detach() {
        this.nti.forEach(t => t.detach() );
        //TODO: detach property effects, events etc...
        this.binds.forEach(b => {
            if (b.initiator) Object.entries(b.initiator).forEach( ([k,i]) => {
                let ind = i?._em[k].indexOf(b.f);
                if (ind >=0) i._em[k].splice(ind,1);
            })
        });
        this._nodes.forEach( n => n.remove() )
    }
    /**
     *
     * @param path
     * @param {Function} cb
     */
    addEffect(path, cb) {
        // find dataContext for property
        let ctx = this.ctx.find( c => c.hasProp(path.split('.')[0]) );
        ctx?.addEffect(path, cb);
        return ctx;
    }

    removeBind(path, prop) {
        let targetNode = findByNPath(this, path);
        if (!targetNode) return;
        let tib = this.binds;
        let binds = tib.filter( i => i.node === targetNode && i.name === prop );

        //check and remove current bind if exist
        binds.forEach( b => {
            if (b.twoSide) {
                targetNode.removeEventListener(b.eventBB, b.funcBB);
            }
            b.depend.forEach( d => {
                let em = (b.initiator[d]?._em ?? this._em)[d];
                if (em ) {
                    let ind = em.indexOf(b.f);
                    if (ind >= 0) em.splice(ind,1);
                }
            })
            delete tib[tib.indexOf(b)];
        });
    }

    replaceBind(path, property, value) {
        this.removeBind(path, property);
        let bind = createBind(property, value);
        bind.path = path;
        this.binds.push(bind);
        this.attachBind(bind);
        //ti.addEffect(bindVal.name2 ?? bindVal.name, bind.f);
        // call apply to set prop value via property effect
        this.applyBind(bind);
    }
    querySelector(selector) {
        return this.clone.querySelector(selector);
    }
}