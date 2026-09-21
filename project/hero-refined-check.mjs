import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3333";
const VPS = [
  {l:"320px",w:320,h:700},{l:"360px",w:360,h:780},
  {l:"390px",w:390,h:844},{l:"430px",w:430,h:932},
  {l:"1024px",w:1024,h:768},{l:"desktop",w:1280,h:800},
];
async function run() {
  const br = await chromium.launch({headless:true});
  const res = [];
  for (const vp of VPS) {
    const ctx = await br.newContext({viewport:{width:vp.w,height:vp.h}});
    const pg = await ctx.newPage();
    try { await pg.goto(BASE,{waitUntil:"load",timeout:40000}); }
    catch(_) { await pg.goto(BASE,{waitUntil:"domcontentloaded",timeout:20000}); }
    await pg.waitForTimeout(2000);
    const m = await pg.evaluate(() => {
      const hero = document.querySelector("section:first-of-type");
      const dept = document.getElementById("shop-by-department");
      const hR = hero ? hero.getBoundingClientRect() : null;
      const dR = dept ? dept.getBoundingClientRect() : null;
      return {
        heroH: hR ? Math.round(hR.height) : null,
        heroB: hR ? Math.round(hR.bottom) : null,
        depT:  dR ? Math.round(dR.top) : null,
        gap:   (hR&&dR) ? Math.round(dR.top - hR.bottom) : null,
        hScrl: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    const ss = path.join(__dirname, "hero-refined-"+vp.w+".png");
    await pg.screenshot({path:ss,clip:{x:0,y:0,width:vp.w,height:Math.min(vp.h*1.8,1400)}});
    res.push({vp:vp.l,...m,ss});
    await ctx.close();
  }
  await br.close();
  console.log("\n=== RESULTS ===\n");
  for (const r of res) {
    const ok = r.gap!==null && r.gap>=-5 && r.gap<300 && !r.hScrl;
    console.log("["+r.vp.padEnd(8)+"] "+(ok?"PASS":"ISSUE")+" | heroH="+r.heroH+"px gap="+r.gap+"px hScroll="+r.hScrl);
  }
  const mob = res.filter(r=>["320px","360px","390px","430px"].includes(r.vp));
  const desk = res.find(r=>r.vp==="desktop");
  const mobGapsOk   = mob.every(r=>r.gap!==null && r.gap>=-5 && r.gap<300 && !r.hScrl);
  const deskTall    = (desk?.heroH??0) > 500;
  const mobCompact  = mob.every(r=>(r.heroH??9999)<700);
  console.log("\nMobile gaps ok (all <300px, no overflow): "+mobGapsOk);
  console.log("Desktop hero tall (>500px): "+deskTall);
  console.log("Mobile heroes compact (<700px): "+mobCompact);
  console.log("FINAL: "+(mobGapsOk&&deskTall&&mobCompact?"PASS":"NEEDS REVIEW"));
}
run().catch(e=>{console.error("FATAL:",e.message);process.exit(1);});
