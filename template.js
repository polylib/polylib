import {forEachTemplateRecursive, isSubPath, setAttrValue} from "./common.js";


function fromKebab (str) {
    return str.replace(/-[a-z\u00E0-\u00F6\u00F8-\u00FE]/g, function (match) {
        return match.slice(1).toUpperCase();
    });
}

/**
 *
 * @param root
 * @param node
 * @return {Number[]}
 */
export function getNPath(root, node) {
    let path = [];
    while (node && node !== root) {
        path.unshift([...node.parentNode.childNodes].indexOf(node));
        node = node.parentNode;
    }
    return path;
}

/**
 *
 * @param effects
 * @param path
 * @param {Function} effect
 */
function addEffect(effects, path, effect) {
    if (effects[path]) {
        effects[path].push(effect);
    } else {
        effects[path] = [effect];
    }
}

class TemplateInstance extends DocumentFragment {
    /** Effect map */
    _em = {};
    /** Nested template instances */
    nti = [];
    /**
     * @constructor
     * @param {Template} template
     */
    constructor(template) {
        super();
        this.tpl = template;
        this.init();

    }
    init() {
        let frag = this.tpl.content.cloneNode(true);
        frag.querySelectorAll('template').forEach( t => {
            t.tpl = this.tpl.nestedTemplate.get(t.id);
            t.tpl.tplPH = t;
        } );
        this._nodes =  [...frag.childNodes];
        this.append(frag)
        this._nodes.forEach( i => i._io = this.tpl.tplPH);
        //this.replaceChildren(...frag.childNodes);
        this.binds = this.tpl.binds.map( b => ({...b, node: this.findByNPath(b.path) }));
    }
    dirtyRefresh() {
        this.detach();
        this.init();
        this.attach(this.ctx, this.before, this._pti, this._hti);
    }
    /**
     *
     * @param ctx
     * @param [before]
     * @param {TemplateInstance} [pti] - parent template instance
     * @param {TemplateInstance} hti
     */
    attach(ctx, before, pti, hti) {
        this.ctx = ctx;
        this._pti = pti;
        this._hti = this._hti ?? hti;
        this.before = before;
        // memorize context for nested template
        forEachTemplateRecursive(this, t => {
            t._hti = this._hti ?? pti ?? this;
            t._pti = this;
        });

        // build effect map
        this.binds.forEach(b => {

            this.attachBind(b);
        })
        // apply binds
        this.applyBinds();
        if (ctx?.root) {
            this.insert(ctx, before);
            //ctx.root._io = this.tpl;
        }
        this.tpl._tis.set(this, null);
        return this;
    }
    findByNPath(path) {
        return path.reduce((n, i) => n.childNodes.length ? n.childNodes[i] : n._nodes[i], this);
    }
    attachBind(bind) {
        let node = this.findByNPath(bind.path);
        if (!node) return;
        bind.node = node;
        let f = (m) => this.applyBind(bind,m);
        bind.f = f;
        bind.depend?.forEach(d => {
            if (!bind.initiator) bind.initiator = {};
            bind.initiator[d] = this.addEffect(d, f);
        })
        if (bind.twoSide) {
            getBackApl(bind)(bind.node, this.ctx);
        }
    }
    applyBinds() {
        this.binds.forEach(bind => {
            this.applyBind(bind);
        });
    }
    applyEffects(m) {
        let effectMap = this._em;
        effectMap && Object.keys(effectMap).forEach( k => {
            if (!m || isSubPath(m.path, k)) {
                effectMap?.[k]?.forEach( f => f(m) );
            }
        });
    }

    insert(ctx, before) {
        let target = before?.parentNode ?? ctx?.root;
        if (before) {
            target.insertBefore(this,before);
        } else {
            target.appendChild(this);
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
        this.tpl._tis.delete(this);
    }
    applyBind(bind, m) {
        let node = bind.node;
        if (!node) return;
        let val = this.getBindValue(bind);
        val = bind.negate ? !val : val;
        bind.apl(node, this.ctx, m, val,this._hti?.ctx );
    }
    getValue(name) {
        let t = this;
        while (t) {
            let val = t.ctx.get(name);
            if (val !== undefined) return val;
            t = t._pti;
        }
        /* not found in upper context, try original template ctx */
        return this.tpl._hti?.ctx.get(name);
    }
    getBindValue(bind) {
        let dv = bind.depend.map(p => {
            if (/['"]/.test(p)) {
                return p.replace(/["']/g, "")
            } else {
                return this.getValue(p);
            }
        });
        
        if (dv.length > 1) {
            let [fn,...args] = dv;
            if (!fn) {
                console.error('Function not found in context: %s(%s)', bind.depend[0], bind.depend.slice(1).join(','));
                return;
            }
            //TODO: ctx for function
            return fn.apply(this._hti?.ctx ?? this.ctx, args);
        } else {
            return dv[0];
        }
    }
    /**
     *
     * @param path
     * @param {Function} cb
     */
    addEffect(path, cb) {
        // check prop exist
        if (this.ctx.hasProp(path.split('.')[0]))
        {
            if (!this.ctx._ti || this.ctx._ti === this) {
                addEffect(this._em, path, cb);
                return this;
            }
            else
                return this.ctx._ti.addEffect(path, cb);
        } else {
            return this.ctx._ti._pti?.addEffect(path, cb) ?? this._hti?.addEffect(path, cb);
        }
    }

    removeBind(path, prop) {
        let targetNode = this.findByNPath(path);
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
}

export const effectsFns = {
    attr: getAttrApl,
    prop: getPropApl,
    text: getTextApl,
    event: getEventApl
}

class Template {
    tplElement;
    usedCE = new Set();
    usedCEL = new Set();
    nestedTemplate = new Map();
    _pti;
    binds;
    static devMode;
    /** Template instances stamped from this template
     * @type {Map<TemplateInstance>}
     */
    _tis = new Map();
    /**
     * @constructor
     * @param {String|HTMLTemplateElement} tpl
     * @return Template
     */
    constructor(tpl) {
        /** @type: HTMLTemplateElement */
        let node;
        if (tpl instanceof HTMLTemplateElement) {
            node = tpl;
        } else {
            node = document.createElement("template");
            node.innerHTML = tpl;
        }
        forEachTemplateRecursive(node.content, t => {
            if (t._prepared) return;
            let id = (Math.random() + 1).toString(36).substring(2);

            //node.parentNode.replaceChild(anc, node);
            let newTpl = document.createElement('template');
            newTpl.tpl = new Template(t);

            newTpl.tpl.usedCE.forEach(t => this.usedCE.add(t) );
            newTpl.tpl.usedCEL.forEach(t => this.usedCEL.add(t) );
            this.nestedTemplate.set(id, newTpl.tpl);
            newTpl.id = id;
            newTpl._prepared = true;
            t.parentNode.replaceChild(newTpl, t);

        })
        this.origTpl = node.content.cloneNode(true);
        this.origTpl._parentTemplate = this;
        this.origTpl.querySelectorAll('template').forEach( t => {
            t.tpl = this.nestedTemplate.get(t.id);
        } );
        this.init(node.content)
        this.tplElement = node;
        this._pti = node._pti;
        this._hti = node._hti;
        /*if (Template.devMode) {
            this.origTpl = node.content.cloneNode(true);
            this.origTpl.querySelectorAll('template')
                .forEach( t => {
                    t.tpl = this.nestedTemplate.get(t.id);
                    t.tpl.origTpl._parentTemplate = t;
                } );
        }*/
    }
    init(content) {
        this.content = content;
        this.binds = [];
        this.walkNode(content, []);
    }

    refresh() {
        this.init(this.origTpl.cloneNode(true));

        [...this._tis].forEach( i => i[0].dirtyRefresh());
    }
    stamp(ctx, before, pti, hti) {
        let instance = new TemplateInstance(this);
        instance.attach(ctx, before, pti, hti);
        return instance;
    }
    walkNode(node, path) {
        if (node.localName?.match(/\w+-/))
            if (node.getAttribute('loading') === 'lazy')
                this.usedCEL.add(node.localName);
            else
                this.usedCE.add(node.localName);
        for ( let i of node.childNodes ) {
            this.walkNode(i, [...path, [...node.childNodes].indexOf(i)])
        }


        if (nodeCheckBind(node)) {
            let bind = getAttrBinds(node, path);
            if (bind) this.binds.push(...bind);
            if (node.nodeType === document.TEXT_NODE) {
                bind = getTextBind(node, path);
                if (bind) this.binds.push(...bind);
            }
        }
    }

}


function css(str) {
    if (document.adoptedStyleSheets) {
        let sheet = new CSSStyleSheet();
        sheet.replaceSync(str);
        return sheet;
    } else {
        let sheet = document.createElement('style');
        sheet.innerText = str;
        return sheet;
    }
}
function fixText(t) {
    if (t === undefined || t === null) return '';
    return t;
}


function html(str) {
    return new Template(str.raw);
}

function getPropApl(b) {
    return function prop(node, ctx, mutation, val) {
        if (node[b.name] === val) {
            if (typeof val === 'object' && mutation) {
                if(b.depend.length === 1)
                    node.forwardNotify(mutation, b.depend[0], b.name);
                else
                    node.notifyChange({ path: b.name, action: 'upd', wmh: mutation.wmh, value: val });
            }
        } else {
            if (node.set)
                node.set(b.name, val, mutation?.wmh);
            else
                node[b.name] = val;
        }
    };
}

function getTextApl(b) {
    return function text(node, ctx, m, content) {
        // remove current stamped template instance if exist
        if (node._ct) {
            node._ct.detach();
            node._ct = undefined;
        }
        // if value is template stamp to text node parent
        if (content instanceof Template) {
            let inst = content.stamp(ctx, node, ctx._ti, content._hti);
            ctx._ti.nti.push(inst);
            node._ct = inst;
            content = '';
        }
        node.textContent = fixText(content);
    };
}

function getEventApl(b) {
    return function event(node, ctx, m, val, self) {
        if (!val) {
            console.error('Function "%s" for event handler "%s" not found', b.depend[0], b.name);
            return;
        }
        let fn = val;
        !node._listeners && (node._listeners = {});
        if (node._listeners[b.name]) {
            node.removeEventListener(b.name, node._listeners[b.name]);
            node._listeners[b.name] = null;
        }
        let f = e => {
            // build hierarchy chain
            let composedPath = e.composedPath();
            composedPath = composedPath.slice(0,composedPath.indexOf(ctx)).filter( i => i._ti );
            composedPath.push(ctx);
            let model = {};
            let found = false;
            composedPath.forEach( ctxModel => {
                // поднимаемся наверх по всем вложенным контекстам, собираем полную модель
                while (ctxModel) {
                    if (ctxModel.model) {
                        if (ctxModel.as)
                            model[ctxModel.as] = ctxModel.model;
                        else
                            Object.assign( model, ctxModel.model);
                        found = true;
                    }
                    ctxModel = ctxModel._ti._pti?.ctx;
                }
            });
            if (found) e.model = model;
            fn.call(self || ctx, e);
        };
        node._listeners[b.name] = f;
        node.addEventListener(b.name, f);
    };
}

function getAttrApl(b) {
    return function attr(node, ctx, m, val) {
        setAttrValue(node, b.name, val);
    };
}

export function getBackApl(b) {
    return function back(node, ctx) {
        b.eventBB = b.backEvt || `${b.name}-changed`;
        b.funcBB = (event) => {
            if (event.detail.wmh <= ctx.wmh[b.name] || event.detail.init) return;
            if (typeof node[b.name] === 'object' && event.detail.value === event.detail.oldValue || event.detail.path.split('.').length > 1) {
                ctx.forwardNotify?.(event.detail, b.name, b.depend[0]);
            } else {
                ctx.set(b.depend[0], node[b.name], event.detail.wmh);
            }
        };
        node.addEventListener( b.eventBB, b.funcBB);
    };
}


let pattern = /(\[\[.*?]]|{{.*?}})/gm;

function nodeCheckBind(node) {
    switch (node.nodeType) {
        case document.DOCUMENT_FRAGMENT_NODE:
            return true;
        case document.TEXT_NODE:
            return !!node.textContent.match(pattern);
        case document.COMMENT_NODE:
            return false;
        default:
            return !!node.outerHTML.match(pattern)
    }
}

/** @typedef {Object} TemplateBind
 * @property {Number[]} path
 * @property {String} type
 * @property {Boolean} negate
 * @property {String[]} depend - зависимости
 * @property {Boolean} twoSide
 * @property {String} name
 * @property {String} [backEvt]
 * @property {Function} [apl]
 */

export function createBind(attrName, attrValue, path) {
    let match = attrValue.match(/(\[\[(.*?)]]|{{(.*?)}})/gm);
    if (match) {
        let depend = getDependence(attrValue);
        /** @type TemplateBind */
        let sbnd = {
            path,
            type: null,
            twoSide: match[0][0] === '{',
            name: null,
            negate: match[0][2] === '!',
            depend
        };
        if (attrName.indexOf('on-') === 0) {
            sbnd.type = 'event'
            sbnd.name = fromKebab(attrName.slice(3));
        } else if (attrName.lastIndexOf('$') > -1) {
            sbnd.type = 'attr';
            sbnd.name = fromKebab(attrName.slice(0, -1));
        } else {
            sbnd.type = 'prop';
            sbnd.name = fromKebab(attrName);
        }
        sbnd.apl = effectsFns[sbnd.type](sbnd);
        return sbnd;
    }
}
/**
 *
 * @param node
 * @param {Number[]} path
 * @return {TemplateBind[]}
 */

function getAttrBinds(node, path) {
    if (node.attributes)
        return [...node.attributes]
            .map( attr => {
                let b = createBind(attr.nodeName, attr.nodeValue, path);
                if (b) node.removeAttribute(attr.nodeName);
                return b;
                })
            .filter( i => i );
}
//
function getTextBind(node, path) {
    if (node.textContent.match(pattern)) {
        // split text node and replace original node with parts
        let parts = node.textContent.match(/(\[\[.+?]])|(.+?(?=\[\[))|.+/mg);
        let binds = [];
        let base = path.at(-1);
        /** @type Node[] */
        let nodes = parts.map( (p,index) => {
            if (p[0] === '[') {
                let negate = !!p.match(/\[\[!/);
                let depend = getDependence(p);
                let bind = { path: path.slice(0,-1).concat([base+index]), type: 'text', depend, textContent: p, negate };
                bind.apl = getTextApl(bind);
                binds.push(bind);
                return document.createTextNode('');
            } else {
                return document.createTextNode(p);
            }
        })
        nodes.forEach( n => {
            node.parentNode.insertBefore(n, node);
        });
        node.__removed = true;
        node.parentNode.removeChild(node);

        return binds;
    }
}

/** @typedef ExpressionInfo
 * @property {Function} fn
 * @property {String[]} depend
 * @property {String} [backEvt]
 */

/**
 *
 * @param expr
 * @return {string[]}
 */
export function getDependence(expr) {
    let match = expr.match(/(\[\[(.*?)]]|{{(.*?)(:(?<evt>.*?))?}})/m);
    if (match) {
        let prop = (match[2] || match[3]).trim();
        if (prop[0] === '!') prop = prop.slice(1);
        let fm = prop.match(/(?<fname>[\w\d]+)\((?<args>.*)\)/)
        if( fm ) {
            return [fm.groups.fname,...fm.groups.args?.split(',').map(i => i.trim())];
        } else {
            return [prop];
        }
    } else {
        console.log('unsupported expression:', expr);
    }
}

export { html, css, Template, TemplateInstance, addEffect };