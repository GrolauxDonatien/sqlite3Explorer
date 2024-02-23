singleselectDropdown = (() => {

    let style = document.createElement('style');
    style.setAttribute("id", "singleselect_dropdown_styles");
    style.innerHTML = `
.singleselect-dropdown{
  display: flex;
  flex-wrap:wrap;
  padding: 2px 0px 0px 0px;
  border-radius: 4px;
  border: solid 1px #ced4da;
  background-color: white;
  position: relative;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23343a40' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right .25rem center;
  background-size: 16px 12px;
}
.singleselect-dropdown span.optext, .singleselect-dropdown span.placeholder{
  margin-right:0.5em; 
  margin-bottom:2px;
  padding:1px 0; 
  border-radius: 4px; 
  display:inline-block;
}
.singleselect-dropdown span.optext{
  background-color:#F0F0F0;
  padding:1px 0.75em;
  white-space:pre-wrap;
  margin-right: 16px;
}
.singleselect-dropdown span.optext .optdel {
  float: right;
  margin: 0 -6px 1px 5px;
  font-size: 0.7em;
  margin-top: 2px;
  cursor: pointer;
  color: #666;
}
.singleselect-dropdown span.optext .optdel:hover { color: #c66;}
.singleselect-dropdown span.placeholder{
  color:#ced4da;
}
.singleselect-dropdown-list-wrapper{
  box-shadow: gray 0 3px 8px;
  z-index: 100;
  padding:2px;
  border-radius: 4px;
  border: solid 1px #ced4da;
  display: none;
  margin: -1px;
  position: absolute;
  top:0;
  left: 0;
  right: 0;
  background: white;
}
.singleselect-dropdown-list-wrapper .singleselect-dropdown-search{
  margin-bottom:5px;
}
.singleselect-dropdown-list{
  padding:2px;
  height: 15rem;
  overflow-y:auto;
  overflow-x: hidden;
}
.singleselect-dropdown-list::-webkit-scrollbar {
  width: 6px;
}
.singleselect-dropdown-list::-webkit-scrollbar-thumb {
  background-color: #bec4ca;
  border-radius:3px;
}

.singleselect-dropdown-list div{
  padding: 5px;
}
.singleselect-dropdown-list input{
  height: 1.15em;
  width: 1.15em;
  margin-right: 0.35em;  
}
.singleselect-dropdown-list div.checked{
    background-color: cornflowerblue;
}
.singleselect-dropdown-list div:hover{
  background-color: #ced4da;
}
.singleselect-dropdown span.maxselected {width:100%;}
.singleselect-dropdown-all-selector {border-bottom:solid 1px #999;}
`;
    document.head.appendChild(style);

    function singleselectDropdown(el, options) {
        let config = {
            search: true,
            height: '15rem',
            placeholder: 'select',
            txtSelected: 'selected',
            txtAll: 'All',
            txtRemove: 'Remove',
            txtSearch: 'search',
            ...options
        };
        let valuekey, textkey;
        for (let k in options.keys) {
            valuekey = k;
            textkey = options.keys[k];
            break;
        }
        function newEl(tag, attrs) {
            let e = document.createElement(tag);
            if (attrs !== undefined) Object.keys(attrs).forEach(k => {
                if (k === 'class') { Array.isArray(attrs[k]) ? attrs[k].forEach(o => o !== '' ? e.classList.add(o) : 0) : (attrs[k] !== '' ? e.classList.add(attrs[k]) : 0) }
                else if (k === 'style') {
                    Object.keys(attrs[k]).forEach(ks => {
                        e.style[ks] = attrs[k][ks];
                    });
                }
                else if (k === 'text') { attrs[k] === '' ? e.innerHTML = '&nbsp;' : e.innerText = attrs[k] }
                else e[k] = attrs[k];
            });
            return e;
        }


        let div = newEl('div', { class: 'singleselect-dropdown', style: { width: config.style?.width ?? el.clientWidth + 'px', padding: config.style?.padding ?? '' } });
        el.style.display = 'none';
        el.parentNode.insertBefore(div, el.nextSibling);
        let listWrap = newEl('div', { class: 'singleselect-dropdown-list-wrapper' });
        let list = newEl('div', { class: 'singleselect-dropdown-list', style: { height: config.height } });
        let search = newEl('input', { class: ['singleselect-dropdown-search'].concat([config.searchInput?.class ?? 'form-control']), style: { width: '100%', display: el.attributes['singleselect-search']?.value === 'true' ? 'block' : 'none' }, placeholder: config.txtSearch });
        listWrap.appendChild(search);
        div.appendChild(listWrap);
        listWrap.appendChild(list);
        let total = 0;

        el.loadOptions = () => {
            list.innerHTML = '';

            if (el.attributes['singleselect-select-all']?.value == 'true') {
                let op = newEl('div', { class: 'singleselect-dropdown-all-selector' })
                let ic = newEl('input', { type: 'checkbox' });
                op.appendChild(ic);
                op.appendChild(newEl('label', { text: config.txtAll }));

                op.addEventListener('click', () => {
                    op.classList.toggle('checked');
                    op.querySelector("input").checked = !op.querySelector("input").checked;

                    var ch = op.querySelector("input").checked;
                    list.querySelectorAll(":scope > div:not(.singleselect-dropdown-all-selector)")
                        .forEach(i => { if (i.style.display !== 'none') { i.querySelector("input").checked = ch; i.optEl.selected = ch } });

                    el.dispatchEvent(new Event('change'));
                });
                ic.addEventListener('click', (ev) => {
                    ic.checked = !ic.checked;
                });
                el.addEventListener('change', (ev) => {
                    let itms = Array.from(list.querySelectorAll(":scope > div:not(.singleselect-dropdown-all-selector)")).filter(e => e.style.display !== 'none')
                    let existsNotSelected = itms.find(i => !i.querySelector("input").checked);
                    if (ic.checked && existsNotSelected) ic.checked = false;
                    else if (ic.checked == false && existsNotSelected === undefined) ic.checked = true;
                });

                list.appendChild(op);
            }

            div.listEl = listWrap;

            let current = options.selected || { [valuekey]: null, [textkey]: "" };

            div.appendChild(newEl('span', { class: ['optext'], text: current[textkey] }));

            function insert(option) {
                let o = {
                    value: option[valuekey],
                    text: option[textkey]
                };
                let selected=o.value == current[valuekey];
                let op = newEl('div', { class:  selected ? 'checked' : '', optEl: o });
                if (selected) {
                    el.innerHTML = '<option value="' + o.value + '" selected></option>';
                }
                op.appendChild(newEl('label', { text: o.text }));
                op.addEventListener('click', (event) => {
                    let olds = list.querySelectorAll('.checked');
                    for (let i = 0; i < olds.length; i++) olds[i].classList.remove('checked');
                    current = o;
                    div.querySelector('span').innerText = o.text;
                    op.classList.add('checked');
                    el.innerHTML = '<option value="' + o.value + '" selected></option>';
                    el.dispatchEvent(new Event('change'));
                    event.stopPropagation();
                    hide();
                });
                o.listitemEl = op;
                list.appendChild(op);
            }

            async function assertDisplayed() {
                let y = list.scrollTop;
                let h = list.offsetHeight;
                let line = list.querySelector(':first-child').offsetHeight;
                let start = Math.floor(y / line) - 1;
                let count = Math.ceil(h / line) + 2;
                let children = list.children;
                if (children.length < Math.min(total, start + count)) {
                    let query = search.value;
                    let spacer = children[children.length - 1];
                    list.removeChild(spacer);
                    while (children.length < Math.min(total, start + count)) {
                        let page = await options.fetch(query, children.length);
                        for (let i = 0; i < page.length; i++) {
                            insert(page[i]);
                        }
                    }
                    list.appendChild(spacer);
                    setTimeout(() => {
                        setSpacer();
                    }, 10);
                }
            }

            list.refresh = async () => {
                list.removeEventListener('scroll', assertDisplayed);
                list.innerHTML = '';
                let query = search.value;
                total = await options.total(query);
                let page = await options.fetch(query, 0);
                for (let i = 0; i < page.length; i++) {
                    insert(page[i]);
                }
                if (total > page.length) { // lazy load, preset height of list
                    let spacer = document.createElement('DIV');
                    spacer.classList.add('spacer');
                    list.appendChild(spacer);
                    setTimeout(() => {
                        setSpacer();
                    }, 10);
                    list.addEventListener('scroll', assertDisplayed);
                }
            }
        }

        function setSpacer() {
            let children = list.children;
            if (children.length == 0) return;
            let spacer = children[children.length - 1];
            if (spacer.classList.contains('spacer')) {
                spacer.style.padding = 'unset';
                spacer.style.margin = 'unset';
                let h = children[0].offsetHeight;
                let curtot = children.length - 1;
                spacer.style.height = Math.max(0, (total - curtot) * h) + "px";
            }
        }

        el.loadOptions();

        search.addEventListener('input', () => {
            list.refresh();
        });

        list.refresh();

        div.addEventListener('click', () => {
            let hidden = div.listEl.style.display != 'block';
            function show() {
                div.listEl.style.display = 'block';
                search.focus();
                search.select();
                setSpacer();
            }
            if (hidden && "beforeOpen" in options) {
                options.beforeOpen(show);
            } else {
                show();
            }
        });

        function hide(event) {
            if (!document.body.contains(div)) {
                document.removeEventListener('click', hide);
                return;
            }
            if (!event || !div.contains(event.target)) {
                if (listWrap.style.display == 'block') {
                    function close() {
                        listWrap.style.display = 'none';
                    }
                    if ("beforeClose" in options) {
                        options.beforeClose(close);
                    } else {
                        close();
                    }
                }
            }

        }

        document.addEventListener('click', hide);
    }

    return singleselectDropdown;
})();


