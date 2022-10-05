(function () {


    function toBezier(c, lineSmoothness) {
        return [c.x1 + (c.dx1 || 0) * lineSmoothness * Math.abs(c.x2 - c.x1), c.y1 + (c.dy1 || 0) * lineSmoothness * Math.abs(c.y2 - c.y1),
            c.x2 + (c.dx2 || 0) * lineSmoothness * Math.abs(c.x1 - c.x2), c.y2 + (c.dy2 || 0) * lineSmoothness * Math.abs(c.y1 - c.y2),
            c.x2, c.y2];
    }

    function getBezierXY(t, sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey) {
        return {
            x: Math.pow(1 - t, 3) * sx + 3 * t * Math.pow(1 - t, 2) * cp1x
                + 3 * t * t * (1 - t) * cp2x + t * t * t * ex,
            y: Math.pow(1 - t, 3) * sy + 3 * t * Math.pow(1 - t, 2) * cp1y
                + 3 * t * t * (1 - t) * cp2y + t * t * t * ey
        };
    }

    function getClosest(f, t) {
        let dx, dy;
        if (f.type == "dot") {
            let inv = getClosest(t, f);
            let out = { x: f.x, y: f.y };
            if (dx in inv) out.dx = -inv.dx;
            if (dy in inv) out.dy = -inv.dy;
            return out;
        }
        if (f.type == "rect") {
            if (t.type == "dot") {
                let x, y;
                if (t.x < f.x) {
                    x = f.x;
                    dx = -1;
                } else if (t.x > f.x + f.width) {
                    x = f.x + f.width;
                    dx = 1;
                } else {
                    x = t.x;
                    dx = 0;
                }
                if (t.y < f.y) {
                    y = f.y;
                    dy = -1;
                } else if (t.y > f.y + f.height) {
                    y = f.y + f.height;
                    dy = 1;
                } else {
                    y = t.y;
                    dy = 0;
                }
                return { x, y }
            } else if (t.type == "rect") {
                let x, y;
                if (t.x + t.width < f.x) {
                    x = f.x;
                    dx = -1;
                } else if (t.x > f.x + f.width) {
                    x = f.x + f.width;
                    dx = 1;
                } else {
                    x = (Math.max(f.x, t.x) + Math.min(f.x + f.width, t.x + t.width)) / 2;
                    dx = 0;
                }
                if (t.y + t.height < f.y) {
                    y = f.y;
                    dy = -1;
                } else if (t.y > f.y + f.height) {
                    y = f.y + f.height;
                    dy = 1;
                } else {
                    y = (Math.max(f.y, t.y) + Math.min(f.y + f.height, t.y + t.height)) / 2;
                    dy = 0;
                }
                return { x, y }
            }
        }
        return { x: f.x, y: f.y, dx, dy };
    }


    function distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function shiftFrom(m, model) {
        let f = (typeof m.from == 'number' || m.from instanceof Number) ? model[m.from] : m.from;
        let t = (typeof m.to == 'number' || m.to instanceof Number) ? model[m.to] : m.to;
        if (m.fromborder === true) {
            return getClosest(f, t);
        }
        return { x: f.x + (m.fromx || 0), y: f.y + (m.fromy || 0) };
    }

    function shiftTo(m, model) {
        let f = (typeof m.from == 'number' || m.from instanceof Number) ? model[m.from] : m.from;
        let t = (typeof m.to == 'number' || m.to instanceof Number) ? model[m.to] : m.to;
        if (m.toborder === true) {
            return getClosest(t, f);
        }
        return { x: t.x + (m.tox || 0), y: t.y + (m.toy || 0) };
    }



    function getBbox(model) {
        let bbox = { x1: undefined, y1: undefined, x2: undefined, y2: undefined };
        for (let j = 0; j < model.length; j++) {
            let m = model[j];
            if ("x" in m) {
                if (bbox.x1 === undefined || m.x < bbox.x1) bbox.x1 = m.x;
                if (bbox.x2 === undefined || m.x + Math.max((m.width || 0), (m.minwidth || 0)) + (m.paddingLeft || 0) > bbox.x2) bbox.x2 = m.x + (m.width || 0);
            }
            if ("y" in m) {
                if (bbox.y1 === undefined || m.y < bbox.y1) bbox.y1 = m.y;
                if (bbox.y2 === undefined || m.y + Math.max((m.height || 0), (m.minheight || 0)) + (m.paddingTop || 0) > bbox.y2) bbox.y2 = m.y + (m.height || 0);
            }
        }
        return bbox;
    }

    function shiftModel(model, x, y) {
        for (let i = 0; i < model.length; i++) {
            let m = model[i];
            if ("x" in m) {
                m.x += x;
                m.y += y;
                /*            if ("model" in m) {
                                shiftModel(m.model, x, y);
                            }*/
            }
        }
    }


    function isObject(o) {
        return o != null && Object.getPrototypeOf(o) === Object.prototype;
    }

    // from https://www.nayuki.io/page/convex-hull-algorithm
    const convexHull = (function () {
        let convexhull = {};
        // Returns a new array of points representing the convex hull of
        // the given set of points. The convex hull excludes collinear points.
        // This algorithm runs in O(n log n) time.
        function makeHull(points) {
            var newPoints = points.slice();
            newPoints.sort(convexhull.POINT_COMPARATOR);
            return convexhull.makeHullPresorted(newPoints);
        }
        convexhull.makeHull = makeHull;
        // Returns the convex hull, assuming that each points[i] <= points[i + 1]. Runs in O(n) time.
        function makeHullPresorted(points) {
            if (points.length <= 1)
                return points.slice();
            // Andrew's monotone chain algorithm. Positive y coordinates correspond to "up"
            // as per the mathematical convention, instead of "down" as per the computer
            // graphics convention. This doesn't affect the correctness of the result.
            var upperHull = [];
            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                while (upperHull.length >= 2) {
                    var q = upperHull[upperHull.length - 1];
                    var r = upperHull[upperHull.length - 2];
                    if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x))
                        upperHull.pop();
                    else
                        break;
                }
                upperHull.push(p);
            }
            upperHull.pop();
            var lowerHull = [];
            for (var i = points.length - 1; i >= 0; i--) {
                var p = points[i];
                while (lowerHull.length >= 2) {
                    var q = lowerHull[lowerHull.length - 1];
                    var r = lowerHull[lowerHull.length - 2];
                    if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x))
                        lowerHull.pop();
                    else
                        break;
                }
                lowerHull.push(p);
            }
            lowerHull.pop();
            if (upperHull.length == 1 && lowerHull.length == 1 && upperHull[0].x == lowerHull[0].x && upperHull[0].y == lowerHull[0].y)
                return upperHull;
            else
                return upperHull.concat(lowerHull);
        }
        convexhull.makeHullPresorted = makeHullPresorted;
        function POINT_COMPARATOR(a, b) {
            if (a.x < b.x)
                return -1;
            else if (a.x > b.x)
                return +1;
            else if (a.y < b.y)
                return -1;
            else if (a.y > b.y)
                return +1;
            else
                return 0;
        }
        convexhull.POINT_COMPARATOR = POINT_COMPARATOR;
        return convexhull;
    })();

    function getAround(r1, r2, PAD, all = false) {
        let switchIndex = 0;
        let dots = [];
        if (r2.x + r2.width < r1.x) { // r2 is at left of r1
            if (r2.y + r2.height < r1.y) { // r2 is at the top of r1
                dots = [r1.x + r1.width + PAD, r1.y - PAD, r1.x + r1.width + PAD, r1.y + r1.height + PAD, r1.x - PAD, r1.y + r1.height + PAD, r2.x - PAD, r2.y + r2.height + PAD, r2.x - PAD, r2.y - PAD, r2.x + r2.width + PAD, r2.y - PAD];
                switchIndex = 3;
            } else if (r1.y + r1.height < r2.y) { // r2 is at the bottom of r1
                dots = [r1.x - PAD, r1.y - PAD, r1.x + r1.width + PAD, r1.y - PAD, r1.x + r1.width + PAD, r1.y + r1.height + PAD, r2.x + r2.width + PAD, r2.y + r2.height + PAD, r2.x - PAD, r2.y + r2.height + PAD, r2.x - PAD, r2.y - PAD];
                switchIndex = 3;
            } else { // vertical overlap between r1 and r2
                if (all || !(r1.y >= r2.y && r1.y <= r2.y + r2.height)) dots.push.apply(dots, [r1.x - PAD, r1.y - PAD]); // include bottom left corner
                dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y - PAD, r1.x + r1.width + PAD, r1.y + r1.height + PAD]);
                if (all || !(r1.y + r1.height >= r2.y && r1.y + r1.height <= r2.y + r2.height)) dots.push.apply(dots, [r1.x - PAD, r1.y + r1.height + PAD]); // include bottom left corner
                switchIndex = dots.length / 2;
                if (all || !(r2.y + r2.height >= r1.y && r2.y + r2.height <= r1.y + r1.height)) dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y + r2.height + PAD]); // include bottom left corner
                dots.push.apply(dots, [r2.x - PAD, r2.y + r2.height + PAD, r2.x - PAD, r2.y - PAD]);
                if (all || !(r2.y >= r1.y && r2.y <= r1.y + r1.height)) dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y - PAD]); // include bottom left corner
            }
        } else if (r1.x + r1.width < r2.x) { // r2 is at the right of r1
            if (r2.y + r2.height < r1.y) { // r2 is at the top of r1
                dots = [r1.x + r1.width + PAD, r1.y + r1.height + PAD, r1.x - PAD, r1.y + r1.height + PAD, r1.x - PAD, r1.y - PAD, r2.x - PAD, r2.y - PAD, r2.x + r2.width + PAD, r2.y - PAD, r2.x + r2.width + PAD, r2.y + r2.height + PAD];
                switchIndex = 3;
            } else if (r1.y + r1.height < r2.y) { // r2 is at the bottom of r1
                dots = [r1.x + r1.width + PAD, r1.y - PAD, r1.x - PAD, r1.y - PAD, r1.x - PAD, r1.y + r1.height + PAD, r2.x - PAD, r2.y + r2.height + PAD, r2.x + r2.width + PAD, r2.y + r2.height + PAD, r2.x + r2.width + PAD, r2.y - PAD];
                switchIndex = 3;
            } else { // vertical overlap between r1 and r2
                if (all || !(r1.y + r1.height >= r2.y && r1.y + r1.height <= r2.y + r2.height)) dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y + r1.height + PAD]); // include bottom left corner
                dots.push.apply(dots, [r1.x - PAD, r1.y + r1.height + PAD, r1.x - PAD, r1.y - PAD]);
                if (all || !(r1.y >= r2.y && r1.y <= r2.y + r2.height)) dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y - PAD]); // include bottom left corner
                switchIndex = dots.length / 2;
                if (all || !(r2.y >= r1.y && r2.y <= r1.y + r1.height)) dots.push.apply(dots, [r2.x - PAD, r2.y - PAD]); // include bottom left corner
                dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y - PAD, r2.x + r2.width + PAD, r2.y + r2.height + PAD]);
                if (all || !(r2.y + r2.height >= r1.y && r2.y + r2.height <= r1.y + r1.height)) dots.push.apply(dots, [r2.x - PAD, r2.y + r2.height + PAD]); // include bottom left corner
            }
        } else { // horizontal overlap between r1 and r2
            if (r2.y + r2.height < r1.y) { // r2 is at the top of r1
                if (all || !(r1.x + r1.width >= r2.x && r1.x + r1.width <= r2.x + r2.width)) dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y - PAD]); // include bottom left corner
                dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y + r1.height + PAD, r1.x - PAD, r1.y + r1.height + PAD]);
                if (all || !(r1.x >= r2.x && r1.x <= r2.x + r2.width)) dots.push.apply(dots, [r1.x - PAD, r1.y - PAD]); // include bottom left corner
                switchIndex = dots.length / 2;
                if (all || !(r2.x >= r1.x && r2.x <= r1.x + r1.width)) dots.push.apply(dots, [r2.x - PAD, r2.y + r2.height + PAD]); // include bottom left corner
                dots.push.apply(dots, [r2.x - PAD, r2.y - PAD, r2.x + r2.width + PAD, r2.y - PAD]);
                if (all || !(r2.x + r2.width >= r1.x && r2.x + r2.width <= r1.x + r1.width)) dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y + r2.height + PAD]); // include bottom left corner
            } else if (r1.y + r1.height < r2.y) { // r2 is at the bottom of r1
                if (all || !(r1.x >= r2.x && r1.x <= r2.x + r2.width)) dots.push.apply(dots, [r1.x - PAD, r1.y + r1.height + PAD]); // include bottom left corner
                dots.push.apply(dots, [r1.x - PAD, r1.y - PAD, r1.x + r1.width + PAD, r1.y - PAD]);
                if (all || !(r1.x + r1.width >= r2.x && r1.x + r1.width <= r2.x + r2.width)) dots.push.apply(dots, [r1.x + r1.width + PAD, r1.y + r1.height + PAD]); // include bottom left corner
                switchIndex = dots.length / 2;
                if (all || !(r2.x + r2.width >= r1.x && r2.x + r2.width <= r1.x + r1.width)) dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y - PAD]); // include bottom left corner
                dots.push.apply(dots, [r2.x + r2.width + PAD, r2.y + r2.height + PAD, r2.x - PAD, r2.y + r2.height + PAD]);
                if (all || !(r2.x >= r1.x && r2.x <= r1.x + r1.width)) dots.push.apply(dots, [r2.x - PAD, r2.y - PAD]); // include bottom left corner
            } else { // vertical overlap between r1 and r2
                let allDots = [{ x: r1.x - PAD, y: r1.y - PAD }, { x: r1.x + r1.width + PAD, y: r1.y - PAD }, { x: r1.x + r1.width + PAD, y: r1.y + r1.height + PAD }, { x: r1.x - PAD, y: r1.y + r1.height + PAD }, { x: r2.x - PAD, y: r2.y - PAD }, { x: r2.x + r2.width + PAD, y: r2.y - PAD }, { x: r2.x + r2.width + PAD, y: r2.y + r2.height + PAD }, { x: r2.x - PAD, y: r2.y + r2.height + PAD }];
                switchIndex = -1;
                let out = convexHull.makeHull(allDots);
                for (let i = 0; i < out.length; i++) {
                    dots.push(out[i].x, out[i].y);
                }
            }
        }

        return { dots, switchIndex }
    }

    function dotsToBezier(dots, smooth_value) {
        let bezier = [];

        if (dots.length > 0) {
            bezier.push(dots[0], dots[1]);
            for (let i = 0; i < dots.length; i += 2) {
                let x1 = dots[i];
                let y1 = dots[i + 1];
                let x2 = dots[(i + 2) % dots.length];
                let y2 = dots[(i + 3) % dots.length];
                let x0 = dots[(dots.length + i - 2) % dots.length];
                let y0 = dots[(dots.length + i - 1) % dots.length];
                let x3 = dots[(i + 4) % dots.length];
                let y3 = dots[(i + 5) % dots.length];

                let xc1 = (x0 + x1) / 2.0;
                let yc1 = (y0 + y1) / 2.0;
                let xc2 = (x1 + x2) / 2.0;
                let yc2 = (y1 + y2) / 2.0;
                let xc3 = (x2 + x3) / 2.0;
                let yc3 = (y2 + y3) / 2.0;
                let len1 = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
                let len2 = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                let len3 = Math.sqrt((x3 - x2) * (x3 - x2) + (y3 - y2) * (y3 - y2));

                let k1 = len1 / (len1 + len2);
                let k2 = len2 / (len2 + len3);

                let xm1 = xc1 + (xc2 - xc1) * k1;
                let ym1 = yc1 + (yc2 - yc1) * k1;

                let xm2 = xc2 + (xc3 - xc2) * k2;
                let ym2 = yc2 + (yc3 - yc2) * k2;

                // Resulting control points. Here smooth_value is mentioned
                // above coefficient K whose value should be in range [0...1].
                ctrl1_x = xm1 + (xc2 - xm1) * smooth_value + x1 - xm1;
                ctrl1_y = ym1 + (yc2 - ym1) * smooth_value + y1 - ym1;

                ctrl2_x = xm2 + (xc2 - xm2) * smooth_value + x2 - xm2;
                ctrl2_y = ym2 + (yc2 - ym2) * smooth_value + y2 - ym2;
                bezier.push(ctrl1_x, ctrl1_y, ctrl2_x, ctrl2_y, x2, y2);
            }
        }
        return bezier
    }

    function drawBezier(ctx, bezier) {
        if (bezier && bezier.length > 0) {
            ctx.moveTo(bezier[0], bezier[1]);
            for (let i = 2; i < bezier.length; i += 6) {
                ctx.bezierCurveTo(bezier[i], bezier[i + 1], bezier[i + 2], bezier[i + 3], bezier[i + 4], bezier[i + 5]);
            }
        }
    }

    let queryTypes = { "SELECT": true, "UNION": false, "UNION ALL": false, "INTERSECT": false, "EXCEPT": false };

    const exports = {
        getBbox, getClosest, distance, shiftFrom, shiftTo, shiftModel, isObject, convexHull, getAround, dotsToBezier, drawBezier, queryTypes, getBezierXY, toBezier
    }

    if (typeof window != "undefined") {
        for (let k in exports) window[k] = exports[k];
    }
    if (typeof module != "undefined" && module.exports) module.exports = exports;

})();