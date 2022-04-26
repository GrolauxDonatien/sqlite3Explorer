(function () {

    var properties = [
        'direction',  // RTL support
        'boxSizing',
        'width',  // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
        'height',
        'overflowX',
        'overflowY',  // copy the scrollbar for IE

        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',

        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',

        // https://developer.mozilla.org/en-US/docs/Web/CSS/font
        'fontStyle',
        'fontVariant',
        'fontWeight',
        'fontStretch',
        'fontSize',
        'fontSizeAdjust',
        'lineHeight',
        'fontFamily',

        'textAlign',
        'textTransform',
        'textIndent',
        'textDecoration',  // might not make a difference, but better be safe

        'letterSpacing',
        'wordSpacing'
    ];

    var isFirefox = !(window.mozInnerScreenX == null);
    // module.exports = function (textarea, position, recalculate) {
    function getCaretCoordinates(element, position, recalculate) {
        // mirrored div
        var div = document.createElement('div');
        div.id = 'input-textarea-caret-position-mirror-div';
        document.body.appendChild(div);

        var style = div.style;
        var computed = window.getComputedStyle ? getComputedStyle(element) : element.currentStyle;  // currentStyle for IE < 9

        // default textarea styles
        style.whiteSpace = 'pre-wrap';
        if (element.nodeName !== 'INPUT')
            style.wordWrap = 'break-word';  // only for textarea-s

        // position off-screen
        style.position = 'absolute';  // required to return coordinates properly
        style.visibility = 'hidden';  // not 'display: none' because we want rendering

        // transfer the element's properties to the div
        properties.forEach(function (prop) {
            style[prop] = computed[prop];
        });

        if (isFirefox) {
            style.width = parseInt(computed.width) - 2 + 'px'  // Firefox adds 2 pixels to the padding - https://bugzilla.mozilla.org/show_bug.cgi?id=753662
            // Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
            if (element.scrollHeight > parseInt(computed.height))
                style.overflowY = 'scroll';
        } else {
            style.overflow = 'hidden';  // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
        }

        if (element.nodeName == "DIV" || element.nodeName == "SPAN") {
            div.textContent = element.textContent.substring(0, position);
        } else {
            div.textContent = element.value.substring(0, position);
        }
        // the second special handling for input type="text" vs textarea: spaces need to be replaced with non-breaking spaces - http://stackoverflow.com/a/13402035/1269037
        if (element.nodeName === 'INPUT')
            div.textContent = div.textContent.replace(/\s/g, "\u00a0");

        var span = document.createElement('span');
        // Wrapping must be replicated *exactly*, including when a long word gets
        // onto the next line, with whitespace at the end of the line before (#7).
        // The  *only* reliable way to do that is to copy the *entire* rest of the
        // textarea's content into the <span> created at the caret position.
        // for inputs, just '.' would be enough, but why bother?
        if (element.nodeName == "DIV" || element.nodeName == "SPAN") {
            div.textContent = element.textContent.substring(position) || '.';
        } else {
            span.textContent = element.value.substring(position) || '.';  // || because a completely empty faux span doesn't render at all
        }
        div.appendChild(span);

        var coordinates = {
            top: span.offsetTop + parseInt(computed['borderTopWidth']),
            left: span.offsetLeft + parseInt(computed['borderLeftWidth'])
        };

        document.body.removeChild(div);

        return coordinates;
    }


    function getCaretPosition(input) {
        if (!input) return; // No (input) element found
        if (input.getAttribute("contenteditable") == "true") {
            if ("getSelection" in document) {
                let sel = document.getSelection();
                if ("anchorOffset" in sel) return sel.anchorOffset;
            }
        }
        if ('selectionEnd' in input) {
            // Standard-compliant browsers
            return input.selectionEnd;
        } else if (document.selection) {
            // IE
            input.focus();
            var sel = document.selection.createRange();
            var selLen = document.selection.createRange().text.length;
            sel.moveStart('character', -input.value.length);
            return sel.text.length - selLen;
        }
        // node_walk: walk the element tree, stop when func(node) returns false
        function node_walk(node, func) {
            var result = func(node);
            for (node = node.firstChild; result !== false && node; node = node.nextSibling)
                result = node_walk(node, func);
            return result;
        };

        // getCaretPosition: return [start, end] as offsets to elem.textContent that
        //   correspond to the selected portion of text
        //   (if start == end, caret is at given position and no text is selected)
        function contentEditableCaretPosition(elem) {
            var sel = window.getSelection();
            var cum_length = [0, 0];

            if (sel.anchorNode == elem)
                cum_length = [sel.anchorOffset, sel.extentOffset];
            else {
                var nodes_to_find = [sel.anchorNode, sel.extentNode];
                if (!elem.contains(sel.anchorNode) || !elem.contains(sel.extentNode))
                    return undefined;
                else {
                    var found = [0, 0];
                    var i;
                    node_walk(elem, function (node) {
                        for (i = 0; i < 2; i++) {
                            if (node == nodes_to_find[i]) {
                                found[i] = true;
                                if (found[i == 0 ? 1 : 0])
                                    return false; // all done
                            }
                        }

                        if (node.textContent && !node.firstChild) {
                            for (i = 0; i < 2; i++) {
                                if (!found[i])
                                    cum_length[i] += node.textContent.length;
                            }
                        }
                    });
                    cum_length[0] += sel.anchorOffset;
                    cum_length[1] += sel.extentOffset;
                }
            }
            if (cum_length[0] <= cum_length[1])
                return cum_length;
            return [cum_length[1], cum_length[0]];
        }
        let p = contentEditableCaretPosition(input);
        if (p === undefined) return p;
        return p[0];
    }

    function measureText(text, font) {
        let c = document.createElement("canvas");
        c.setAttribute("width", 10000);
        let ctx = c.getContext("2d");
        ctx.font = font;
        return ctx.measureText(text).width;
    }

    function isValid(char) {
        return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || ".[]'\"´_1234567890".indexOf(char) != -1
    }

    function getBeginningOfWord(text, pos) {
        while (pos >= 1 && isValid(text[pos - 1])) pos--;
        return pos;
    }

    function getWord(text, pos) {
        pos = getBeginningOfWord(text, pos);
        text = text.substring(pos);
        pos = 0;
        while (pos < text.length && isValid(text[pos])) pos++;
        return text.substring(0, pos);
    }

    $.formeditor.autocomplete = function (el, lists, {autoopen=false,triggerchange=true}={}) {
        let clist = $('<div class="autocompleteList">');
        let cdesc = $('<div class="autocompleteDescription">');
        let state = "CLOSE";
        let fontSize, fontFamily, font;
        function initFont() {
            fontSize = getComputedStyle(el[0]).getPropertyValue("font-size");
            fontFamily = getComputedStyle(el[0]).getPropertyValue("font-family");
            font = fontSize + " " + fontFamily;
            fontSize = parseInt(fontSize.substring(0, fontSize.length - 2));
        }
        function showDescription() {
            let l = clist.find('.autocompleteSelected');
            let d = l.attr("data-description");
            cdesc.remove();
            if (d == null) {
                return;
            }
            let lc = l[0].getBoundingClientRect();
            let gc = clist[0].getBoundingClientRect();
            let bc = document.body.getBoundingClientRect();
            let w = measureText(d, font);
            let css = {
                position: "fixed",
                top: (lc.top - 1) + "px",
                font: font,
                backgroundColor: "white",
                border: "solid 1px black",
                "z-index": 100000
            };
            if (gc.left + gc.width + Math.min(200, w) < bc.width) {
                css.left = (gc.left + gc.width + 2) + "px";
            } else {
                css.left = (gc.left - w - 3) + "px";
            }
            cdesc.css(css).text(d);
            $('body').append(cdesc);
        }
        let states = {
            "CLOSE": {
                toggle() {
                    states[state].open();
                },
                open() {
                    state = "OPEN";
                    let caret = getCaretPosition(el[0]);
                    let text = el.is('div,span') ? el.text() : el.val();
                    caret = getBeginningOfWord(text, caret);
                    let caretCoords = getCaretCoordinates(el[0], caret);
                    let elCoords = el[0].getBoundingClientRect();
                    if (isNaN(fontSize)) initFont();
                    clist.css({
                        position: "fixed",
                        left: (elCoords.left + caretCoords.left - 4) + "px",
                        top: (elCoords.top + caretCoords.top + fontSize + 2) + "px",
                        backgroundColor: "white",
                        border: "solid 1px black",
                        font: font,
                        "z-index": 100000
                    })
                    $('body').append(clist);
                    clist.off('mousedown');
                    clist.off('mouseup');
                    clist.on('mousedown', 'div', (event) => {
                        event.preventDefault();
                    });
                    clist.on('mouseup', 'div', (event) => {
                        let el = clist.find('.autocompleteSelected');
                        el.removeClass('autocompleteSelected');
                        $(event.currentTarget).addClass('autocompleteSelected');
                        states[state].accept();
                        event.preventDefault();
                    });
                    states[state].refresh();
                },
                key(k) {
                    if (isValid(k)) states[state].open();
                }
            },
            "OPEN": {
                toggle() {
                    states[state].close();
                },
                close() {
                    state = "CLOSE";
                    clist.remove();
                    cdesc.remove();
                },
                refresh() {
                    clist.empty();
                    let caret = getCaretPosition(el[0]);
                    let text = el.is('div,span') ? el.text() : el.val();
                    let word = getWord(text, caret).toLowerCase();
                    let last = false;
                    let sortedLists = [];
                    for (let i = 0; i < lists.length; i++) {
                        let l = Object.keys(lists[i]);
                        l.sort();
                        for (let j = 0; j < l.length; j++) {
                            let o = {};
                            o[l[j].toLowerCase()] = {
                                r: l[j],
                                d: lists[i][l[j]]
                            };
                            l[j] = o;
                        }
                        sortedLists.push(l);
                    }
                    for (let i = 0; i < sortedLists.length; i++) {
                        let list = sortedLists[i];
                        let first = true;
                        for (let j = 0; j < list.length; j++) {
                            let n = Object.keys(list[j])[0];
                            if (n.startsWith(word)) {
                                if (last && first) {
                                    clist.append('<hr>');
                                }
                                let line = $('<div>')
                                let t = list[j][n].r;
                                line.append($('<span>').text(t.substring(0, word.length)));
                                line.append($('<span>').text(t.substring(word.length)));
                                line.attr('data-description', list[j][n].d);
                                clist.append(line);
                                first = false;
                            }
                        }
                        if (!first) last = true;
                    }
                    if (last === false) {
                        states[state].close();
                    } else {
                        clist.children().first().addClass("autocompleteSelected");
                        showDescription();
                    }
                },
                key() {
                    states[state].refresh();
                },
                up() {
                    let el = clist.find('.autocompleteSelected');
                    el.removeClass('autocompleteSelected');
                    if (el.prev().length > 0) {
                        el.prev().addClass("autocompleteSelected");
                    } else {
                        clist.children().last().addClass("autocompleteSelected");
                    }
                    showDescription();
                    if (clist.find('.autocompleteSelected').is('hr')) {
                        states[state].up();
                    }
                },
                down() {
                    let el = clist.find('.autocompleteSelected');
                    el.removeClass('autocompleteSelected');
                    if (el.next().length > 0) {
                        el.next().addClass("autocompleteSelected");
                    } else {
                        clist.children().first().addClass("autocompleteSelected");
                    }
                    showDescription();
                    if (clist.find('.autocompleteSelected').is('hr')) {
                        states[state].down();
                    }
                },
                accept() {
                    let v = clist.find('.autocompleteSelected').text();
                    states[state].close();
                    let text = el.is('div,span') ? el.text() : el.val();
                    let caret = getCaretPosition(el[0]);
                    let start = getBeginningOfWord(text, caret);
                    let end = start;
                    while (end < text.length && isValid(text[end])) end++;
                    text = text.substring(0, start) + v + text.substring(end);
                    if (el.is('div,span')) {
                        el.text(text);
                        let char = start+v.length, sel; // character at which to place caret
                        if (document.selection) {
                            sel = document.selection.createRange();
                            sel.moveStart('character', char);
                            sel.select();
                        }
                        else {
                            sel = window.getSelection();
                            sel.collapse(el[0].lastChild, char);
                        }
                    } else {
                        el.val(text);
                        el[0].selectionStart = start + v.length;
                        el[0].selectionEnd = el[0].selectionStart;
                    }
                    if (triggerchange===true) el.trigger("change");
                }
            }
        }

        el.on('keydown', (event) => {
            if (event.keyCode == 32 && event.ctrlKey == true && event.altKey == false && event.shiftKey == false) {
                if (states[state].toggle) states[state].toggle();
            } else if (event.key == "ArrowUp") {
                if (states[state].up) {
                    states[state].up();
                    event.preventDefault();
                }
            } else if (event.key == "ArrowDown") {
                if (states[state].down) {
                    states[state].down();
                    event.preventDefault();
                }
            } else if (event.key == "Escape" || event.key == "ArrowLeft" || event.key == "ArrowRight" || event.key == "Home" || event.key == "End") {
                if (states[state].close) states[state].close();
            } else if (event.key == "Enter") {
                if (states[state].accept) {
                    states[state].accept();
                    event.preventDefault();
                }
            }
        });
        el.on('keyup', (event) => {
            if (event.key && event.key.length == 1) { // assume a proper key has been typed
                if (states[state].key) states[state].key(event.key);
            } else if (event.key == "Backspace" || event.key == "Delete") {
                if (states[state].refresh) states[state].refresh();
            }
        });
        el.on('blur', (event) => {
            if (states[state].close) states[state].close();
        });
        if (autoopen) {
            el.on('focus',(event)=> {
                states[state].toggle();
            });
        };

        return {
            destroy: function () {
                if (states[state].close) states[state].close();
            }
        }
    }

}
)();