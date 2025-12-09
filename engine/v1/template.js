import {fixText, fromDashed, getRandomId, normalizePath, setAttrValue} from '../../common.js'
import {TemplateInstance} from "./instance.js";


export const DIRECTIVE_SCHEME = 'd';
export const Directives = {};

export function html(str) {
    return new Template(str.raw || str);
}

export function svg(str) {
    if (Array.isArray(str.raw)) str = str.raw.join('');
    return new Template( str, { svg: true });
}

export class Template {
    nestedTemplates = new Map();
    svgCE = [];
    binds = [];
    stampHooks = [];
    afterStampHooks = [];
    constructor(tpl, opt) {
        this.svg = opt?.svg === true;
        /** @type: HTMLTemplateElement */
        let node;
        if (tpl instanceof HTMLTemplateElement) {
            node = tpl;
        } else {
            node = document.createElement('template');
            if (tpl instanceof Element)
                node.content.replaceChildren(tpl);
            else {
                if (this.svg) {
                    let svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');
                    node.content.appendChild(svg);
                    svg.innerHTML = tpl;
                } else
                    node.innerHTML = tpl;
            }
        }
        this.tpl = node;

        this.init(this.svg ? node.content.childNodes[0] : node.content);

    }
    init(content) {
        this.walkNode(content, []);
    }
    walkNode(node, path) {
        if (node.attributes && [...node.attributes].find(  n => n.name.indexOf(':') >=0 && n.name.split(':')[0] === DIRECTIVE_SCHEME)) {
            // ..directive
            [...node.attributes].forEach( a => {
                let d = Directives[a.name.split(':')[1]];
                d?.(node, this);
            });
        }
        if (node.nodeName === 'TEMPLATE') {
            let id = getRandomId();
            let ph = document.createComment('tpl:'+id);
            let tpl = new Template(node);
            this.nestedTemplates.set(id, tpl);
            tpl.id = id;
            node.parentNode?.replaceChild(ph, node);
            node = ph;
        }
        //TODO: move to form component
        if (node.localName?.match(/\w+-/)) {
             if (node.namespaceURI === 'http://www.w3.org/2000/svg') {
                let svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');
                svg.replaceChildren(...node.childNodes);
                let tpl = new Template(svg, { svg: true });
                let newNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                [...node.attributes].forEach( i => newNode.setAttribute(i.name, node.getAttribute(i.name)) );
                newNode.setAttribute('is', node.localName);
                node.parentNode.replaceChild(newNode, node);
                newNode._tpl = tpl;
                this.svgCE.push(path);
            }
        }
        for ( let i of node.childNodes ) {
            this.walkNode(i, [...path, [...node.childNodes].indexOf(i)])
        }

        if (node instanceof Element) {
            let bind = getAttrBinds(node, path);
            if (bind) this.binds.push(...bind);
        } else if (node.nodeType === document.TEXT_NODE) {
            let bind = getTextBind(node, path);
            if (bind) this.binds.push(...bind);
        }

    }
    stamp(context) {
        console.log('stamp template, deprecated', this);
        let instance = new TemplateInstance(this);
        instance.attach(context.root);
        return instance;
    }
    getClone() {
        let clone = this.tpl.content.cloneNode(true);
        if (this.svg && clone.childNodes[0]?.nodeName==='svg') {
            let nodes = clone.childNodes[0].childNodes
            clone.replaceChildren(...nodes);
        }
        if (this.nestedTemplates.size > 0) {
            let nodeIterator = document.createNodeIterator(clone, NodeFilter.SHOW_COMMENT);
            let node;
            while (node = nodeIterator.nextNode()) {
                let id = (node.textContent.split(":")[1] || "").trim();
                node._tpl = this.nestedTemplates.get(id);
            }
        }
        return clone;
    }
}

let pattern = /(\[\[.*?]]|{{.*?}})/gm;


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
        node.parentNode.removeChild(node);
        return binds;
    }
}

/** @typedef {Object} TemplateBind
 * @property {Number[]} path - NPath of target
 * @property {String} type - bind target type: attr, prop, event
 * @property {Boolean} negate - value negation on apply
 * @property {String[]} depend - list of properties
 * @property {Boolean} twoSide - true for two side bind
 * @property {String} name - name of target prop/attr/event
 * @property {String} [backEvt] -
 * @property {Function} [apl] - function that apply value to target
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
            sbnd.name = fromDashed(attrName.slice(3));
            sbnd.apl = getEventApl(sbnd);
        } else if (attrName.lastIndexOf('$') > -1) {
            sbnd.type = 'attr';
            sbnd.name = fromDashed(attrName.slice(0, -1));
            sbnd.apl = getAttrApl(sbnd);
        } else {
            sbnd.type = 'prop';
            sbnd.name = fromDashed(attrName);
            sbnd.apl = getPropApl(sbnd);
        }
        return sbnd;
    }
}

/**
 *  Find dependencies of expression.
 *  Expression can be:
 *      {{prop}} - two way bind
 *      [[!prop]] - bind with negation
 *      [[function(prop,'constString')]] - function with arguments
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

function getPropApl(b) {
    return function prop(node, ctx, mutation, val) {
        if (node[b.name] === val) {
            if (typeof val === 'object' && mutation) {
                if(b.depend.length === 1)
                    node.forwardNotify?.(mutation, b.depend[0], b.name);
                else
                    node.notifyChange?.({ path: b.name, action: 'upd', wmh: mutation.wmh, value: val });
            }
        } else {
            if (node.set)
                node.set(b.name, val, mutation?.wmh);
            else
                node[b.name] = val;
        }
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
            let model = {};
            let found = false;
            ctx.forEach( ctxModel => {
                // поднимаемся наверх по всем вложенным контекстам, собираем полную модель

                    if (ctxModel.model) {
                        if (ctxModel.as)
                            model[ctxModel.as] = ctxModel.model;
                        else
                            Object.assign( model, ctxModel.model);
                        found = true;
                    }
            });
            if (found) e.model = Object.assign( e.model ?? {}, model);
            fn.call(self || ctx[0], e);
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

function getTextApl() {
    return function text(node, ctx, m, content) {
        // remove current stamped template instance if exist
        if (node._ti) {
            node._ti.detach();
            node._ti = undefined;
        }
        // if value is template stamp to text node parent
        if (content instanceof Template) {
            //TODO: move this to instance
            let instance = new TemplateInstance(content);
            node._ti = instance;
            instance.attach(null, node, [node, ...ctx, ...(content._hctx)??[]]);
            ctx[0]._ti.nti.push(instance);
            content = '';
        }
        node.textContent = fixText(content);
    };
}

export function getBackApl(b) {
    return function back(node) {
        b.eventBB = b.backEvt || `${b.name}-changed`;
        b.funcBB = (event) => {
            // b.initiator[b.depend[0]] can be undefined when no property declared
            if (event.detail.wmh <= b.initiator[b.depend[0]]?.wmh[b.name] || event.detail.init) return;
            if (typeof node[b.name] === 'object' && event.detail.value === event.detail.oldValue || normalizePath(event.detail.path).length > 1) {
                b.initiator[b.depend[0]].forwardNotify?.(event.detail, b.name, b.depend[0]);
            } else {
                b.initiator[b.depend[0]]?.set(b.depend[0], (node.ctx || node)[b.name], event.detail.wmh);
            }
        };
        (node.ctx || node).addEventListener( b.eventBB, b.funcBB);
    };
}