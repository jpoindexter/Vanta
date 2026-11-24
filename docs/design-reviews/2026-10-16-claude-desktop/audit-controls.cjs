const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const dir=__dirname;const source=fs.readFileSync(path.join(dir,'prototype/app.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'prototype/index.html'),'utf8');
const events=[];const context=vm.createContext({structuredClone,console,setTimeout,clearTimeout,localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(...args){events.push(args[0])},querySelector(){return {addEventListener(){}}}},window:{addEventListener(){}}});
// Register the authored UI definitions without starting a DOM or triggering actions.
vm.runInContext(source.replace(/render\(\);\s*$/,''),context,{timeout:2000});
const handlers=vm.runInContext('Object.keys(actions).sort()',context);
const literals=new Set([...source.matchAll(/data-action="([a-z][a-z0-9-]*)"/g),...html.matchAll(/data-action="([a-z][a-z0-9-]*)"/g)].map(m=>m[1]));
for(const m of source.matchAll(/btn\(\s*'[^']*'\s*,\s*'([a-z][a-z0-9-]*)'/g))literals.add(m[1]);
const unresolved=[...literals].filter(x=>!handlers.includes(x));
const result={kind:'structural handler audit; not behavior execution',handlers:handlers.length,distinctLiteralActionReferences:literals.size,unresolved,handlerNames:handlers,eventTypes:[...new Set(events)]};
fs.writeFileSync(path.join(dir,'evidence/control-binding-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({handlers:handlers.length,distinctLiteralActionReferences:literals.size,unresolved}));
if(unresolved.length)process.exitCode=1;
