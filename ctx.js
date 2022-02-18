import {getProp, normalizePath} from "./common.js";

/** @typedef LightDataContext
 * @property {Object} model
 * @method get
 * @method set
 * @method {Function(Object)} replace
 *
 */

/**
 *
 * @param ctx
 * @param {Object} i
 * @param as
 * @return {LightDataContext}
 */
export function createContext(ctx, i, as) {
    return {
        get: (name) => {
            let [base, ...path] = name.split('.');
            if (base === as) {
                return getProp(i, path);
            } else {
                return ctx.get(name)
            }
        },
        set: (name, val) => {
            let path = normalizePath(name);
            if (path.shift() === as) {
                let rest = path.slice();
                let index = ctx.items.indexOf(i);
                let x = path.pop();
                let obj = getProp(i, path);
                let old = obj[x];
                obj[x] = val;
                ctx.notifyChange({action: 'upd', path: ['items', index, ...rest].join('.'), value: val, oldValue: old});
            } else {
                ctx.pctx?.set(name, val);
            }
        },
        replace: (val) => {
            i = val;
        },
        get model() {
            return i
        },
        as,
        wmh: {},
        hasProp: name => as === name
    }
}