import { PlTemplateMixin } from './template-mixin.js';
import { PropertiesMixin } from './engine/v1/properties.js';
import { ContextMixin } from './engine/v1/ctx.js';

export class PlElement extends PlTemplateMixin(PropertiesMixin(ContextMixin(HTMLElement))) {
}

export class PlSVGElement extends PlTemplateMixin(PropertiesMixin(ContextMixin(EventTarget))) {
    isSVGCustomElement = true;
}
