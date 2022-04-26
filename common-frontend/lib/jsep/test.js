let jsep=require('./jsep.min.js');

let s='[1,2,3][this.text]+(coucou[0][0]+caca)*2+parseInt("2")^2 > (1 && !false)';
//s='(x++)*2'
//s='Text!="" && (Number>2 || parseInt(Radio))';

function toString(tree) {
    function parse(w) {
        if (w && w.type) return parser[w.type](w);
        return "";
    }
    let parser={
        BinaryExpression(t) {
            let o=[];
            function add(s) {
                if (s.type=='BinaryExpression' || s.type=='LogicalExpression') {
                    o.push("("+parse(s)+")");
                } else {
                    o.push(parse(s));
                }
            }
            add(t.left);
            o.push(t.operator);
            add(t.right);
            return o.join('');
        },
        LogicalExpression(t) {
            return parser.BinaryExpression(t);
        },
        MemberExpression(t) {
            if (t.computed) {
                return parse(t.object)+"["+parse(t.property)+"]";
            } else {
                return parse(t.object)+"."+parse(t.property);
            }
        },
        Identifier(t) {
            return t.name;
        },
        ThisExpression(t) {
            return "this";
        },
        CallExpression(t) {
            let o=[parse(t.callee)];
            o.push('(');
            for(let i=0; i<t.arguments.length; i++) {
                if (i>0) o.push(",");
                o.push(parse(t.arguments[i]));
            }
            o.push(')');
            return o.join('');
        },
        Literal(t) {
            return t.raw;
        },
        UnaryExpression(t) {
            if (t.prefix) {
                return t.operator+parse(t.argument);
            } else {
                return parse(t.argument)+t.operator;
            }
        },
        ArrayExpression(t) {
            let o=[];
            o.push('[');
            for(let i=0; i<t.elements.length; i++) {
                if (i>0) o.push(',');
                o.push(parse(t.elements[i]));
            }
            o.push(']');
            return o.join('');
        },
        Compound(t) {
            let o=[];
            for(let i=0; i<t.body.length; i++) {
                o.push(parse(t.body[i]));
            }
            return o.join('');
        }
    }
    return parse(tree);
}

function visitIdentifiers(tree,callback) {
    function visit(w) {
        if (w && w.type) return visitor[w.type](w);
        return "";
    }
    let visitor={
        BinaryExpression(t) {
            visit(t.left);
            visit(t.right);
        },
        LogicalExpression(t) {
            return visitor.BinaryExpression(t);
        },
        MemberExpression(t) {
            visit(t.object);
            visit(t.property);
        },
        Identifier(t) {
            t.name=callback(t.name);
        },
        ThisExpression(t) {
        },
        CallExpression(t) {
            for(let i=0; i<t.arguments.length; i++) {
                visit(t.arguments[i]);
            }
        },
        Literal(t) {
        },
        UnaryExpression(t) {
            visit(t.argument);
        },
        ArrayExpression(t) {
            for(let i=0; i<t.elements.length; i++) {
                visit(t.elements[i]);
            }
        },
        Compound(t) {
            for(let i=0; i<t.body.length; i++) {
                visit(t.body[i]);
            }
        }
    }
    return visit(tree);
}
/*
let tree=jsep(s);

console.log(JSON.stringify(tree,null,2));
visitIdentifiers(tree,function(name) {
    return "toto."+name;
});

console.log(toString(tree));
*/
/*
{
  "type": "BinaryExpression",
  "operator": "+",
  "left": {
    "type": "BinaryExpression",
    "operator": "+",
    "left": {
      "type": "Identifier",
      "name": "coucou"
    },
    "right": {
      "type": "BinaryExpression",
      "operator": "*",
      "left": {
        "type": "Identifier",
        "name": "caca"
      },
      "right": {
        "type": "Literal",
        "value": 2,
        "raw": "2"
      }
    }
  },
  "right": {
    "type": "CallExpression",
    "arguments": [
      {
        "type": "Literal",
        "value": "2",
        "raw": "\"2\""
      }
    ],
    "callee": {
      "type": "Identifier",
      "name": "parseInt"
    }
  }
}
*/


const dependencies = function (cond) {
    let ret = {};

    function loop(tree) {
        function visit(w, prefix) {
            if (w && w.type) return visitor[w.type](w, prefix);
            return "";
        }
        let visitor={
            BinaryExpression(t,p) {
                visit(t.left,p);
                visit(t.right,p);
            },
            LogicalExpression(t,p) {
                return visitor.BinaryExpression(t,p);
            },
            MemberExpression(t,p) {
                if (t.object.type=="Identifier" && t.property.type=="Identifier") {
                    ret[p+t.object.name+"."+t.property.name]=true;
                } else if (t.object.type=="MemberExpression" && t.object.computed==true && t.object.object.type=="Identifier" 
                && t.object.property.type=="Literal" && t.property.type=="Identifier") {
                    visit(t.property,t.object.object.name+"["+t.object.property.value+"].");
                }
            },
            Identifier(t,p) {
                ret[p+t.name]=true;
            },
            ThisExpression() {
            },
            CallExpression(t) {
                for(let i=0; i<t.arguments.length; i++) {
                    visit(t.arguments[i],"");
                }
            },
            Literal() {
            },
            UnaryExpression(t) {
                visit(t.argument,"");
            },
            ArrayExpression(t,p) {
                for(let i=0; i<t.elements.length; i++) {
                    visit(t.elements[i],p);
                }
            },
            Compound(t,p) {
                for(let i=0; i<t.body.length; i++) {
                    visit(t.body[i],p);
                }
            }
        }
        return visit(tree,"");
    }
    try {

      const data = jsep(cond);
      loop(data);
      return Object.keys(ret);
    } catch (e) {
      console.error(e);
      return [];
    }
  }


  let cond="Fragment.ShowText===true && Math.abs(-4)==4 && RepeatingGroup_68[1].ShowText";
// let cond="RepeatingGroup_68[1].ShowText";
  console.info(JSON.stringify(jsep(cond),null,2));

  let c=dependencies(cond);

  console.info(c);


  