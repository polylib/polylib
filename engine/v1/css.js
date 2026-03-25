export function css(str) {
    if (document.adoptedStyleSheets) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(str);
        return sheet;
    } else {
        const sheet = document.createElement('style');
        sheet.innerText = str;
        return sheet;
    }
}
