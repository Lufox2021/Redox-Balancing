const E=require('../src/engine.js'); const {BUILTIN_PROBLEMS}=require('../src/problems.js');
let bad=0;
for(const p of BUILTIN_PROBLEMS){
  try{
    const s=E.solveProblem(p.eq,p.medium);
    const inv=E.inventory(E.parseEquation(s.answerText));
    const ons=[...s.R,...s.P].map(x=>x.text+'{'+Object.entries(x.on).map(([e,v])=>e+E.fstr(v)).join(',')+'}').join(' ');
    console.log(p.id.padEnd(6), s.answerText, inv.atomsOK&&inv.chargeOK?'':'  <<UNBALANCED');
    console.log('       ox:',E.halfStage(s.oxHalf,6),' | red:',E.halfStage(s.redHalf,6));
    console.log('       ON:',ons,' oxEl',s.oxidizedEls,'redEl',s.reducedEls,'OA',s.oxidizingAgents,'RA',s.reducingAgents);
    // self-check: student typing the answer passes
    const c=E.checkOverall(s.answerText,s,s.medium); if(!c.ok){bad++;console.log('   CHECK FAIL',c.msgs);}
    for(const h of [s.oxHalf,s.redHalf]) for(const st of [3,4,5,6]){const r=E.checkHalf(E.halfStage(h,st),h,st); if(!r.ok){bad++;console.log('   HALF FAIL',st,E.halfStage(h,st),r.msgs);}}
  }catch(e){bad++;console.log(p.id,'ERROR',e.message);}
}
console.log('problems',BUILTIN_PROBLEMS.length,'failures',bad);
