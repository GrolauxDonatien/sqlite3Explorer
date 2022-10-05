(function () { // create own lexical scope

    function instance(root) {

        const {
            getBbox, getClosest, distance, shiftFrom, shiftTo, shiftModel
        } = root;

        let freeze=false;

        function createPhysCanvas(root, config = {}) {
            if (!(root instanceof Element) || root.tagName != 'CANVAS') {
                throw new Exception("Invalid parameter for canvas");
            }

            // number of pixels tolerated for a click between mousedown and mouseup, otherwise this a drag
            const DOTCLICKPRECISION = config.dotClickPrecision || 4;
            config.dotClickPrecision = DOTCLICKPRECISION;
            // debug mode displays vector data on the canvas
            const FORCEDEBUG = config.forceDebug || false;
            config.forceDebug = FORCEDEBUG;
            // do not repulse farther than this
            const REPULSIONRANGE = config.repulsionRange || 100;
            config.repulsionRange = REPULSIONRANGE;
            // strength of repulsion
            const REPULSIONFORCE = config.repulsionForce || 0.005;
            config.repulsionForce = REPULSIONFORCE;
            // do not attract closer than this
            const ATTRACTIONRANGE = config.attractionRange || 100;
            config.attractionRange = ATTRACTIONRANGE;
            // strength of attraction
            const ATTRACTIONFORCE = config.attractionForce || 0.003;
            config.attractionForce = ATTRACTIONFORCE;
            // a weight for objects
            const WEIGHT = config.weight || 100;
            config.weight = WEIGHT;
            const WEIGHT2 = WEIGHT * WEIGHT;
            // friction prevents movement below a threshold
            const FRICTION = config.friction || 0.2;
            config.friction = FRICTION;
            const FRICTION2 = FRICTION * FRICTION;
            // when rectangles overlap, the repulsion is based on dots in the rectangles, which are placed at this distance apart
            const REPRESENTATIVEDISTANCE = config.representativeDistance || 10;
            config.representativeDistance = REPRESENTATIVEDISTANCE;
            // vectors are limited by this max speed
            const MAXSPEED = config.maxSpeed || 5;
            config.maxSpeed = MAXSPEED;
            const MAXSPEED2 = MAXSPEED * MAXSPEED;
            // padding for areas inside rectangles
            const PADX = config.padx || 5;
            config.padx = PADX;
            const PADY = config.pady || 5
            config.pady = PADY;
            // cut off time limit between two frames, prevents messing up the physics simulation because of skewed elapsed times
            const TIMELIMIT = config.timeLimit || 250;
            config.timeLimit = TIMELIMIT;
            const FONT = config.font || "15px Arial";
            config.font = FONT;

            let context;
            const animations = [];
            const model = [];
            let previousTs;
            let init = false;
            let forceBoundaryCheck = false;


            function drawModel(model) {
                // show stuff
                let realLayers = [];
                // this proxy to realLayers create the layers by need (=> infinite number of layers are available)
                let layers = new Proxy(realLayers, {
                    get(_, prop) {
                        if (!(prop in realLayers) && !(prop in realLayers) && (!isNaN(parseInt(prop)))) {
                            realLayers[prop] = [];
                        }
                        return realLayers[prop];
                    }
                })

                for (let i = 0; i < model.length; i++) {
                    let m=model[i];
                    if ("draw" in m) {
                        if (!("super" in m)) {
                            if (m.type in renderers) {
                                m.super = { draw: (layers, model) => { renderers[m.type](m, layers, model); }, physCanvas };
                            } else {
                                m.super = { draw: function () { }, physCanvas };
                            }
                        }
                        m.draw.call(m, layers, model); // each item can also have a draw function to show a selection for example
                    } else if (m.type in renderers) {
                        renderers[m.type](m, layers, model);
                    }
                }

                return realLayers;
            }

            let renderers = {}

            renderers.dot = function (m, layers) {
                layers[2].push((ctx) => {
                    ctx.beginPath();
                    let saved = false;
                    if ("strokeStyle" in m) {
                        ctx.save();
                        saved = true;
                        ctx.strokeStyle = m.strokeStyle;
                    }
                    if ("lineWidth" in m) {
                        if (!saved) { ctx.save(); saved = true; }
                        ctx.lineWidth = m.lineWidth;
                    }
                    if ("fillStyle" in m) {
                        if (!saved) { ctx.save(); saved = true; }
                        ctx.fillStyle = m.fillStyle;
                    } else {
                        ctx.fillStyle = "#FFFFFF";
                    }
                    ctx.arc(m.x, m.y, m.radius || 3, 0, Math.PI * 2, true);
                    ctx.fill();
                    ctx.stroke();
                    if (saved) {
                        ctx.restore();
                    } else {
                        ctx.fillStyle = "#000000";
                    }
                });
            }

            renderers.rect = function (m, layers) {
                layers[3].push((ctx) => {
                    ctx.beginPath();
                    function setStyle() {
                        let saved = false;
                        if ("strokeStyle" in m) {
                            ctx.save();
                            saved = true;
                            ctx.strokeStyle = m.strokeStyle;
                        }
                        if ("lineWidth" in m) {
                            if (!saved) { ctx.save(); saved = true; }
                            ctx.lineWidth = m.lineWidth;
                        }
                        if ("fillStyle" in m) {
                            if (!saved) { ctx.save(); saved = true; }
                            ctx.fillStyle = m.fillStyle;
                        } else {
                            ctx.fillStyle = "#FFFFFF";
                        }
                        if ("lineDash" in m) {
                            if (!saved) { ctx.save(); saved = true; }
                            ctx.setLineDash(m.lineDash);
                        }
                        return saved;
                    }
                    if (m.lineWidth !== 0) {
                        let saved = setStyle();
                        ctx.rect(m.x, m.y, m.width, m.height);
                        ctx.fill();
                        if (saved) {
                            ctx.restore();
                        } else {
                            ctx.fillStyle = "#000000";
                        }
                    }
                    if ("model" in m) {
                        let sublayers = drawModel(m.model);
                        ctx.save();
                        ctx.translate(m.x + (m.paddingLeft || 0) + PADX, m.y + (m.paddingTop || 0) + PADY);
                        ctx.beginPath();
                        ctx.rect(0 - PADX, 0 - PADY, m.width + PADX + PADX - (m.paddingLeft || 0), m.height + PADY + PADY - (m.paddingTop || 0));
                        ctx.clip();
                        for (let i in sublayers) {
                            const layer = sublayers[i];
                            for (let j = 0; j < layer.length; j++) {
                                layer[j](ctx);
                            }
                        }
                        ctx.beginPath(); // clipping bugfix: beginPath is required otherwise the previous path may still be stroke outside the clip
                        ctx.restore();
                    }
                    if (m.lineWidth !== 0) {
                        let saved = setStyle();
                        ctx.rect(m.x, m.y, m.width, m.height);
                        ctx.stroke();
                        if (saved) {
                            ctx.restore();
                        } else {
                            ctx.fillStyle = "#000000";
                        }
                    }
                });
            }

            renderers.link = function (m, layers, model) {
                layers[1].push((ctx) => {
                    ctx.beginPath();
                    let saved = false;
                    if ("strokeStyle" in m) {
                        ctx.save();
                        saved = true;
                        ctx.strokeStyle = m.strokeStyle;
                    }
                    if ("lineWidth" in m) {
                        if (!saved) { ctx.save(); saved = true; }
                        ctx.lineWidth = m.lineWidth;
                    }
                    ctx.setLineDash(m.lineDash || [5, 5]);
                    let p = shiftFrom(m, model);
                    ctx.moveTo(p.x, p.y);
                    p = shiftTo(m, model);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                    if (saved) {
                        ctx.restore();
                    } else {
                        ctx.setLineDash([]);
                    }
                });
            }

            renderers.line = renderers.link;

            function runPhysics(model, elapsed, recenter = true, forceBoundaryCheck = false) {
                let vectors = [];
                let locked = false;
                let touched = false;

                function assert(i) {
                    if (vectors[i] == undefined) {
                        vectors[i] = { x: 0, y: 0 };
                    }
                }

                function assertLink(l) {
                    let f = l.from;
                    if (typeof f == 'number' || f instanceof Number) {
                        l._from = f;
                        assert(f);
                    } else {
                        if (('_from' in l) && (model[l._from] === l.from)) {
                            assert(l._from);
                        } else {
                            l._from = model.indexOf(l.from);
                            if (l._from == -1) {
                                // TODO FIXME
                                return; // throw new Exception("Link to something missing from model");
                            }
                            assert(l._from);
                        }
                    }
                    f = l.to;
                    if (typeof f == 'number' || f instanceof Number) {
                        l._to = f;
                        assert(f);
                    } else {
                        if (('_to' in l) && (model[l._to] === l.to)) {
                            assert(l._to);
                        } else {
                            l._to = model.indexOf(l.to);
                            if (l._to == -1) throw new Exception("Link to something missing to model");
                            assert(l._to);
                        }
                    }
                }

                function repulseDotDot(e1, e2) {
                    // if close enough, make both interact with each other by repulsion
                    const d = distance(e1, e2);
                    if (d < REPULSIONRANGE) {
                        let f = ((REPULSIONFORCE * elapsed * WEIGHT * WEIGHT * (REPULSIONRANGE - d) * (REPULSIONRANGE - d)) / (d * d * REPULSIONRANGE * REPULSIONRANGE));
                        if (f <= 0) return;
                        let r = {
                            d1x: f * (e1.x - e2.x),
                            d1y: f * (e1.y - e2.y),
                            d2x: f * (e2.x - e1.x),
                            d2y: f * (e2.y - e1.y)
                        }
                        return r;
                    }
                }

                function repulseDotRect(dot, rect) {
                    if ((dot.x < rect.x) || (dot.x > rect.x + rect.width) || (dot.y < rect.y) || (dot.y > rect.y + rect.height)) {
                        // dot is completely outside rect
                        return repulseDotDot(dot, getClosest(rect, dot));
                    } else {
                        // dot inside rect is harder because we want to get the dot away from the rectangle, but not too fast
                        // here is the strategy: locate the center of rect wrt to dot
                        let cx = rect.x + rect.width / 2;
                        let cy = rect.y + rect.height / 2;
                        let rx, ry;
                        if (cx < dot.x) {
                            rx = dot.x - REPRESENTATIVEDISTANCE;
                        } else if (cx > dot.x) {
                            rx = dot.x + REPRESENTATIVEDISTANCE;
                        } else {
                            rx = dot.x;
                        }
                        if (cy < dot.y) {
                            ry = dot.y - REPRESENTATIVEDISTANCE;
                        } else if (cy > dot.y) {
                            ry = dot.y + REPRESENTATIVEDISTANCE;
                        } else {
                            if (rx == dot.x) {
                                ry = dot.y - REPRESENTATIVEDISTANCE;
                            } else {
                                ry = dot.y;
                            }
                        }
                        return repulseDotDot(dot, { x: rx, y: ry });
                    }
                }

                function repulseRectRect(rect1, rect2) {
                    // find point of rect1 closest to rect2
                    if ((rect2.x + rect2.width < rect1.x) || (rect1.x + rect1.width < rect2.x) || (rect2.y + rect2.height < rect1.y) || (rect1.y + rect1.height < rect2.y)) {
                        // rect2 is completely outside rect1
                        return repulseDotDot(getClosest(rect1, rect2), getClosest(rect2, rect1));
                    } else {
                        // rect1 intersects rect2
                        // we start from their middle points
                        let p1 = { x: rect1.x + rect1.width / 2, y: rect1.y + rect1.height / 2 };
                        let p2 = { x: rect2.x + rect2.width / 2, y: rect2.y + rect2.height / 2 };
                        let a1 = rect1.width * rect1.height;
                        let a2 = rect2.width * rect2.height;
                        if (p1.x == p2.x && p1.y == p2.y) {
                            // if just the same, move the smallest to the right
                            if (a1 > a2) {
                                p2.x++;
                            } else {
                                p1.x++;
                            }
                        } else {
                            // move the smallest at REPRESENTATIVEDISTANCE of biggest
                            function setDistance(o, t) {
                                return {
                                    x: o.x + REPRESENTATIVEDISTANCE * (t.x - o.x) / distance(p1, p2),
                                    y: o.y + REPRESENTATIVEDISTANCE * (t.y - o.y) / distance(p1, p2),
                                }
                            }
                            if (a1 > a2) {
                                p2 = setDistance(p1, p2);
                            } else {
                                p1 = setDistance(p2, p1);
                            }
                        }
                        // apply repulsion
                        return repulseDotDot(p1, p2);
                    }
                }


                // process sub models first as they change their container rect width and height
                for (let i = 0; i < model.length; i++) {
                    let e = model[i];
                    if ((e.type == "rect") && ("model" in e)) {
                        delete e._lock;
                        let sp = runPhysics(e.model, elapsed, false, true);
                        if (sp === undefined) sp = { touched: true };
                        if (sp.locked) {
                            e._lock = true;
                            sp.touched = true; // force touching
                        }
                        if (sp.touched) {
                            touched = true;
                            let bbox = getBbox(e.model);
                            e.width = Math.max(bbox.x2 || 0, e.minwidth || 0, 20) + PADX + PADX + (e.paddingLeft || 0);
                            e.height = Math.max(bbox.y2 || 0, e.minheight || 0, 20) + PADY + PADY + (e.paddingTop || 0);
                            if (bbox.x1 != 0) {
                                e.x += bbox.x1;
                                e.width -= bbox.x1;
                                shiftModel(e.model, -bbox.x1, 0);
                            }
                            if (bbox.y1 != 0) {
                                e.y += bbox.y1;
                                e.height -= bbox.y1;
                                shiftModel(e.model, 0, -bbox.y1);
                            }
                        }
                    }
                }

                for (let i = 0; i < model.length; i++) {
                    let e1 = model[i];
                    if (e1.type == "dot") {
                        for (let j = i + 1; j < model.length; j++) {
                            let e2 = model[j];
                            if (e2.type == "dot") {
                                let v = repulseDotDot(e1, e2);
                                if (v !== undefined) {
                                    assert(i);
                                    assert(j);
                                    vectors[i].x += v.d1x;
                                    vectors[i].y += v.d1y;
                                    vectors[j].x += v.d2x;
                                    vectors[j].y += v.d2y;
                                }
                            } else if (e2.type == "rect") {
                                let v = repulseDotRect(e1, e2);
                                if (v !== undefined) {
                                    assert(i);
                                    assert(j);
                                    vectors[i].x += v.d1x;
                                    vectors[i].y += v.d1y;
                                    vectors[j].x += v.d2x;
                                    vectors[j].y += v.d2y;
                                }
                            }
                        }
                    } else if (e1.type == "link") {
                        // if far enough, make to and from of the link interact with each other by attraction
                        let n1 = shiftFrom(e1, model);
                        let n2 = shiftTo(e1, model);
                        const d = distance(n1, n2) - ATTRACTIONRANGE;
                        if (d > 0 && true) {
                            let f = (ATTRACTIONFORCE * elapsed * (d - WEIGHT / elapsed)) / d;
                            if (f > 0) {
                                assertLink(e1);
                                //                        if (state=="NONE") console.log(`attracting ${e1._from},${e1._to}:${f * (n2.x - n1.x)},${f * (n2.y - n1.y)}-${f * (n1.x - n2.x)},${f * (n1.y - n2.y)}`);
                                if (e1._from == -1) {
                                    return;
                                }
                                vectors[e1._from].x += f * (n2.x - n1.x);
                                vectors[e1._from].y += f * (n2.y - n1.y);
                                vectors[e1._to].x += f * (n1.x - n2.x);
                                vectors[e1._to].y += f * (n1.y - n2.y);
                            }
                        }
                    } else if (e1.type == "rect") {
                        for (let j = i + 1; j < model.length; j++) {
                            let e2 = model[j];
                            if (e2.type == "dot") {
                                let v = repulseDotRect(e2, e1);
                                if (v !== undefined) {
                                    assert(i);
                                    assert(j);
                                    vectors[j].x += v.d1x;
                                    vectors[j].y += v.d1y;
                                    vectors[i].x += v.d2x;
                                    vectors[i].y += v.d2y;
                                }
                            } else if (e2.type == "rect") {
                                let v = repulseRectRect(e1, e2);
                                if (v !== undefined) {
                                    assert(i);
                                    assert(j);
                                    vectors[i].x += v.d1x;
                                    vectors[i].y += v.d1y;
                                    vectors[j].x += v.d2x;
                                    vectors[j].y += v.d2y;
                                }
                            }
                        }
                    }
                }
                let friction = FRICTION2 * elapsed;
                let max = MAXSPEED2 * elapsed;
                for (let i in vectors) {
                    if (FORCEDEBUG) {
                        let v = vectors[i];
                        context.fillText(`(${v.x} , ${v.y})`, model[i].x, model[i].y)
                    }
                    let mod = model[i];
                    if (mod.lock === true || mod._lock === true) continue;
                    let v = vectors[i];
                    if (v.x == 0 && v.y == 0) continue;
                    let d2 = v.x * v.x + v.y * v.y;
                    if (d2 < friction) continue;
                    if (d2 > max) {
                        let d = Math.sqrt(d2);
                        let m = Math.sqrt(max);
                        v.x = v.x * m / d;
                        v.y = v.y * m / d;
                    }
                    mod.old = { x: mod.x, y: mod.y };
                    mod.x += v.x;
                    mod.y += v.y;
                }
                for (let i in (forceBoundaryCheck ? model : vectors)) {
                    let mod = model[i];
                    if (mod.lock === true || mod._lock === true) {
                        locked = true;
                        continue;
                    }
                    if (!('old' in mod)) mod.old = { x: mod.x, y: mod.y };
                    if (recenter) {
                        if (mod.x < 0) {
                            mod.x = 0
                        } else if (mod.x > context.canvas.width - (mod.width || 0) - (mod.paddingLeft || 0)) {
                            mod.x = Math.max(0, context.canvas.width - (mod.width || 0) - (mod.paddingLeft || 0));
                        }
                        if (mod.y < 0) {
                            mod.y = 0;
                        } else if (mod.y > context.canvas.height - (mod.height || 0) - (mod.paddingTop || 0)) {
                            mod.y = Math.max(0, context.canvas.height - (mod.height || 0) - (mod.paddingTop || 0));
                        }
                    }
                    if (!touched && (mod.old.x != mod.x || mod.old.y != mod.y) && distance(mod.old, mod) > 1) {
                        touched = true;
                    }
                    delete mod.old;
                }
                return { touched, locked };
            }

            /* thanks to a Proxy, we are notified when the physcanvas model is manipulated externally */

            function paint(ts) {
                triggerEvent("beforePaint");
                let touched = false;
                let elapsed;
                if (previousTs === undefined) {
                    elapsed = 0;
                } else {
                    elapsed = ts - previousTs;
                }

                if (elapsed > TIMELIMIT) {
                    // too long since last frame which messes up the physics simulation; we'll just ignore this frame and try again
                    previousTs = ts;
                    window.requestAnimationFrame(paint);
                    return;
                }

                context.save();
                context.clearRect(0, 0, context.canvas.width, context.canvas.height);
                context.font = FONT;

                // run physical model
                if (elapsed > 0) {
                    touched = runPhysics(model, elapsed, false, forceBoundaryCheck).touched;
                } else {
                    touched = true; // ensures we will run again, which will in turn run the physics
                }

                let layers = drawModel(model);

                for (let i in layers) {
                    const layer = layers[i];
                    for (let j = 0; j < layer.length; j++) {
                        layer[j](context);
                    }
                }

                let now = new Date();
                let splices = [];
                // animate stuff
                for (let i = 0; i < animations.length; i++) {
                    let a = animations[i];
                    let ds = now - a._start;
                    if (ds > a.length) { // animated till the end
                        if (a._last == a.length) { // last frame of animation was already shown
                            if ("done" in a) {
                                delete a._start;
                                delete a._last;
                                a.done.call(a);
                                touched = true;
                            }
                            splices.push(i);
                        } else { // show last frame of animation
                            a.step.call(a, a.length, context);
                            a._last = a.length;
                        }
                    } else {
                        a.step.call(a, ds, context);
                        a._last = ds;
                    }
                }

                for (let i = splices.length - 1; i >= 0; i--) {
                    animations.splice(splices[i], 1);
                }

                forceBoundaryCheck = false;
                context.restore();
                if (touched || animations.length > 0) { // something changed or there is an animation running => keep on going.
                    previousTs = ts;
                    window.requestAnimationFrame(paint);
                } else {
                    triggerEvent("stopPaint");
                    previousTs = undefined;
                }
                triggerEvent("afterPaint");
            }

            function repaint() {
                if (!init) return; // not yet initialized, repaint is called anyway at the end of initialization
                freeze=false;
                if (previousTs !== undefined) return; // paint is already bound to be called
                triggerEvent("startPaint");
                window.requestAnimationFrame(paint);
            }

            let proxy = new Proxy(model, {
                get(obj, prop) {
                    if ((typeof prop == "number") || (prop instanceof Number)) {
                        return model[prop];
                    } else {
                        if (prop == "length") return model.length;
                        let cnum = parseInt(prop);
                        if (!isNaN(cnum) && cnum == parseFloat(prop)) { // an integer index
                            return model[cnum];
                        }
                        if (prop in model && typeof model[prop] == "function") {
                            return function () {
                                let r = model[prop].apply(model, arguments);
                                if (!freeze) repaint();
                                setTimeout(checkBoundaries,0);
                                return r;
                            }
                        } else {
                            return undefined;
                        }
                    }
                },
                set(obj, prop, value) {
                    debugger;
                }
            });


            // manage canvas size so that its resolution is related to its size 

            window.addEventListener("resize", resize);

            function resize() {
                const displayWidth = root.clientWidth;
                const displayHeight = root.clientHeight;

                if (displayWidth == 0 && displayHeight == 0) { // try again later, will eventualy resolved
                    setTimeout(resize, 100);
                    return;
                }

                if (!init || (root.width !== displayWidth || root.height !== displayHeight)) {
                    root.width = displayWidth;
                    root.height = displayHeight;
                    if (!init) {
                        context = root.getContext("2d");
                        init = true;
                    }
                    forceBoundaryCheck = true;
                    repaint();
                }
            }

            // manage zoom by CTRL+WHEEL

            let zoom = 1.0;
            root.style.zoom = (zoom * 100) + "%";
            root.addEventListener('wheel', function (event) {
                if (event.ctrlKey !== true) return;
                event.preventDefault();
                if (event.deltaY > 0) {
                    zoom = zoom / 1.1;
                    if (zoom > 0.98 && zoom < 1.02) zoom = 1.0; // resets floating point approximations
                    root.style.zoom = (zoom * 100) + "%";
                    resize();
                }
                if (event.deltaY < 0) {
                    zoom = zoom * 1.1;
                    if (zoom > 0.98 && zoom < 1.02) zoom = 1.0; // resets floating point approximations
                    root.style.zoom = (zoom * 100) + "%";
                    resize();
                }
            });

            // manage events

            let events = {
                "mousemove": [],
                "mousedown": [],
                "mouseup": [],
                "click": [],
                "startPaint": [],
                "stopPaint": [],
                "beforePaint": [],
                "afterPaint": [],
            };

            function addEventListener(event, fn) {
                if (!(event in events)) throw new Error("Invalid event " + event);
                events[event].push(fn);
            }

            function removeEventListener(event, fn) {
                if (!(event in events)) throw new Error("Invalid event " + event);
                if (fn === undefined) {
                    events[event].length = 0;
                } else {
                    let idx = events[event].indexOf(fn);
                    if (idx >= 0) events[event].splice(idx, 1);
                }
            }

            function triggerEvent(which) {
                for (let i = 0; i < events[which].length; i++) {
                    let propagate = true;
                    let event = { stopPropagation() { propagate = false; }, physCanvas };
                    events[which][i](event);
                    if (!propagate) return;
                }
            }

            function listen(e) {

                root.addEventListener(e, (event) => {
                    if (events[e].length == 0) return;
                    let rect = event.currentTarget.getBoundingClientRect()
                    event.canvasX = event.clientX / zoom - rect.left;
                    event.canvasY = event.clientY / zoom - rect.top;
                    // is that click nearby an item ?

                    function getCandidate(model, padx = 0, pady = 0) {
                        let candidate;
                        let ex = event.canvasX - padx;
                        let ey = event.canvasY - pady;
                        for (let i = 0; i < model.length; i++) {
                            let m = model[i];
                            if (m.ignore === true) continue; // ignore that thing
                            if ("x" in m) {
                                if ("width" in m) {
                                    // x,y,width,height
                                    if (ex >= m.x && ex <= (m.x + m.width) && ey >= m.y && ey <= (m.y + m.height)) {
                                        if ("model" in m) {
                                            let sub = getCandidate(m.model, m.x + (m.paddingLeft || 0) + padx + PADX, m.y + (m.paddingTop || 0) + pady + PADY);
                                            if (sub !== undefined) {
                                                if (candidate === undefined || sub.m.width * sub.m.height < candidate.s) {
                                                    candidate = sub;
                                                    candidate.tx = (candidate.tx || 0) + m.x + PADX;
                                                    candidate.ty = (candidate.ty || 0) + m.y + PADY;
                                                }
                                            }
                                        }
                                        if (candidate === undefined || m.width * m.height < candidate.s) {
                                            candidate = {
                                                m, s: m.width * m.height
                                            }
                                        }
                                    }
                                } else if ("radius" in m) {
                                    let d = distance({ x: ex, y: ey }, m);
                                    if (d <= m.radius) {
                                        if (candidate === undefined || candidate.s < d * d * Math.PI) {
                                            candidate == { m, s: d * d * Math.PI }
                                        }
                                    }
                                } else {
                                    let d = distance({ x: ex, y: ey }, m);
                                    if (d < DOTCLICKPRECISION * zoom) { // do not accepts dots too far away
                                        if (candidate === undefined || candidate.s < d * d * Math.PI) {
                                            candidate = { m, s: d * d * Math.PI };
                                        }
                                    }
                                }
                            }
                        }
                        return candidate;
                    }

                    let candidate = getCandidate(model);
                    if (candidate !== undefined) {
                        event.modelTarget = candidate.m;
                        if ("tx" in candidate) {
                            event.modelTargetX = candidate.tx;
                            event.modelTargetY = candidate.ty;
                        }
                        event.physCanvas = physCanvas;
                    }

                    for (let i = 0; i < events[e].length; i++) {
                        if (events[e][i](event) === false) {
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    }
                });
            }

            listen("mousemove");
            listen("mousedown");
            listen("mouseup");
            listen("click");

            let state = "NONE";
            let ox, oy, ot, ots;

            // manage canvas mouse events
            // so that the canvas mouse coordinates is precomputed, move of draggable items is already taken care of, objects clicked are identified and so forth


            addEventListener("mousedown", (event) => {
                if ("modelTarget" in event && (event.modelTarget.draggable !== false)) { // user clicked on something that is not locked
                    switch (state) {
                        case "NONE":
                            ox = event.canvasX;
                            oy = event.canvasY;
                            ot = event.modelTarget;
                            ots = new Date();
                            ot.lock = true; // ensure that thing is not moving anymore
                            state = "MAYBE";
                            break;
                    }
                    return false;
                }
            });

            addEventListener("mousemove", (event) => {
                if (event.buttons == 0 && state!="NONE") { // if the user drags outside the canvas and release the mouse button, the mouseup event is not triggered. We force its trigger here.
                    for (let i = 0; i < events["mouseup"].length; i++) {
                        if (events["mouseup"][i](event) === false) return;
                    }
                    return;
                }
                switch (state) {
                    case "MAYBE":
                        if (distance({ x: ox, y: oy }, { x: event.canvasX, y: event.canvasY }) > 2 * zoom) {
                            state = "DRAG";
                            // leak into drag below;
                        } else {
                            return false;
                        }
                    case "DRAG":
                        ot.x += (event.canvasX - ox);
                        ot.y += (event.canvasY - oy);
                        ox = event.canvasX;
                        oy = event.canvasY;
                        repaint();
                        return false;
                }
            });

            function captureClick(e) {
                e.stopPropagation(); // Stop the click from being propagated.
                window.removeEventListener('click', captureClick, true); // cleanup
            }

            addEventListener("mouseup", (event) => {
                switch (state) {
                    case "DRAG":
                        // coming from a drag, we must kill the click event that follows
                        window.addEventListener('click', captureClick, true);
                        bringIntoView();
                    // then we can leak into the next case which reset the state machine
                    case "MAYBE":
                        ot.lock = false;
                        delete ot.lock;
                        delete ot;
                        delete ots;
                        if (state=="MAYBE" && event.which!=1) { // probably a right-click, let the event bubble up
                            state="NONE";
                        } else {
                            state = "NONE";
                            return false;
                        }
                }
            })

            function checkBoundaries() {
                function check(model) {
                    for (let i = 0; i < model.length; i++) {
                        let e = model[i];
                        if ((e.type == "rect") && ("model" in e)) {
                            check(e.model);
                            let bbox = getBbox(e.model);
                            bbox.x1 += e.padx || 0;
                            bbox.y1 += e.pady || 0;
                            if (bbox.x1 != undefined && bbox.x1 != 0) {
                                e.x += bbox.x1;
                                e.width -= bbox.x1;
                                shiftModel(e.model, -bbox.x1, 0);
                            }
                            if (bbox.y1 != undefined && bbox.y1 != 0) {
                                e.y += bbox.y1;
                                e.height -= bbox.y1;
                                shiftModel(e.model, 0, -bbox.y1);
                            }
                            e.width = Math.max(e.width - (e.paddingLeft||0), (bbox.x2 - bbox.x1 + PADX + PADX) || 0) + (e.paddingLeft||0);
                            e.height = Math.max(e.height - (e.paddingTop||0), (bbox.y2 - bbox.y1 + PADX + PADX) || 0) + (e.paddingTop||0);
                        }
                    }
                }
                check(model);
            }

            function bringIntoView() {
                let touched = false;
                for (let i = 0; i < model.length; i++) {
                    let m = model[i];
                    if ("x" in m) {
                        if ("width" in m) {
                            if (m.x + m.width > root.width) {
                                m.x = root.width - m.width;
                                touched = true;
                            }
                            if (m.y + m.height > root.height) {
                                m.y = root.height - m.height;
                                touched = true;
                            }
                            if (m.x < 0) {
                                m.x = 0;
                                touched = true;
                            }
                            if (m.y < 0) {
                                m.y = 0;
                                touched = true;
                            }
                        }
                    }
                }
                if (touched) repaint();
            }

            const physCanvas = {
                model: proxy,
                freezeUntilRepaint() {
                    freeze=true;
                },
                animate: function (a) {
                    a._start = new Date();
                    a._last = 0;
                    animations.push(a);
                    repaint();
                },
                repaint,
                addEventListener,
                removeEventListener,
                checkBoundaries,
                bringIntoView,
                bbox() {
                    let bb=getBbox(model);
                    return {
                        x:bb.x1,
                        y:bb.y1,
                        width:bb.x2-bb.x1,
                        height:bb.y2-bb.y1
                    }
                },
                zoom() {
                    if (arguments.length > 0) {
                        if (!(arguments[0] > 0.0)) throw new Exception("Invalid zoom value");
                        zoom = arguments[0];
                        resize();
                    }
                    return zoom;
                },
                config,
                context,
                canvas: root
            };

            config.phys = physCanvas;

            resize(); // set up stuff

            return physCanvas;
        }

        root.createPhysCanvas = createPhysCanvas;
        return root;
    }

    if (typeof window != "undefined") {
        instance(window);
    }

    if (typeof module != "undefined" && module.exports) {
        module.exports = instance(require('./utils.js'));
    }

})();




