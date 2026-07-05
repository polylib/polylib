export { PlElement, PlSVGElement } from './pl-element.js';
export { Template, html, svg } from './engine/v1/template.js';
export { css } from './engine/v1/css.js';
export { TemplateInstance } from './engine/v1/instance.js';

import { Directives } from './engine/v1/template.js';
import repeat from './engine/v1/repeat.js';
import ifDirective from './engine/v1/if.js';
Directives['repeat'] = repeat;
Directives['if'] = ifDirective;
