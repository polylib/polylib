/**
 *
 * @param {HTMLElement} node
 * @param {String} attr
 * @param {String|Number|Boolean} val
 */
export function setAttrValue(node, attr, val) {
    if ( node.isSVGCustomElement ) node = node.root;
    if (val !== undefined && val !== false)
        node.setAttribute(attr, val === true ? '' : val);
    else
        node.removeAttribute(attr);
}
export function getAttrValue(node, attr) {
    if ( node instanceof PlSVGElement) node = node.root;
    return node.getAttribute(attr);
}

/**
 *
 * @param {String|String[]} path
 * @return {String[]}
 */
export function normalizePath(path) {
    return Array.isArray(path) ? path.slice() : path.split('.');
}
/**
 *
 * @param {String|String[]} path
 * @return {String}
 */
export function stringPath(path) {
    return Array.isArray(path) ? path.join('.') : path;
}

/**
 *
 * @param {Object} obj
 * @param {String[]} path
 */
export function getProp(obj, path) {
    if (path.length > 0 && obj) {
        path.forEach( p => obj = obj?.[p] );
    }
    return obj;
}

/**
 * Check if b is sub path of a
 * @param {String} a
 * @param {String} b
 * @return {boolean}
 */
export function isSubPath(a, b) {
    let ax = a + '.';
    let bx = b + '.';
    return ax.startsWith(bx.slice(0, ax.length));
}

export function forEachTemplateRecursive(root, cb) {
    root.querySelectorAll('template')
        .forEach( t => {
            cb(t);
            forEachTemplateRecursive(t.content, cb)
        });
}

export function fromKebab (str) {
    return str.replace(/-[a-z\u00E0-\u00F6\u00F8-\u00FE-]/g, function (match) {
        return match.slice(1).toUpperCase();
    });
}

export function fixText(t) {
    if (t === undefined || t === null) return '';
    return t;
}

/**
 *  Get array of number representing indexes of child nodes from root to node
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
export function findByNPath(node, path) {
    return path.reduce((n, i) => n.childNodes[i] , node);
}

export function getRandomId() {
    return (Math.random() + 1).toString(36).substring(2)
}

export function toDashed(string) {
    return string.replace(/([a-z\d])([A-Z-])/g, '$1-$2').toLowerCase();
}