export function css(str) {
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