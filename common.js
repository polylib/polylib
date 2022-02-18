/**
 *
 * @param {HTMLElement} node
 * @param {String} attr
 * @param {String|Number|Boolean} val
 */
export function setAttrValue(node, attr, val) {
    if (val !== undefined && val !== false)
        node.setAttribute(attr, val === true ? '' : val);
    else
        node.removeAttribute(attr);
}

/**
 *
 * @param {String|String[]} path
 * @return {String[]}
 */
export function normalizePath(path) {
    return Array.isArray(path) ? path : path.split('.');
}

/**
 *
 * @param {Object} obj
 * @param {String[]} path
 */
export function getProp(obj, path) {
    while (path.length > 0 && obj) {
        obj = obj[path.shift()];
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