import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3333";
const VPS = [
  {l:"320px",w:320,h:700},{l:"360px",w:360,h:780},{l:"390px",w:390,h:844},
  {l:"430px",w:430,h:932},{l:"768px",w:768,h:1024},{l:"1023px",w:1023,h:768},
  {l:"1024px",w:1024,h:768},{l:"desktop",w:1280,h:800}
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
        gap:   (hR&&dR) ? Math.round(dR.top - hR.bottom) : null,
        hScrl: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    const ss = path.join(__dirname, "hero-"+vp.w+".png");
    await pg.screenshot({path:ss, clip:{x:0,y:0,width:vp.w,height:Math.min(vp.h*1.8,1400)}});
    res.push({vp:vp.l, ...m, ss});
    await ctx.close();
  }
  await br.close();
  console.log("\n=== RESULTS ===\n");
  let allPass = true;
  for (const r of res) {
    const ok = r.gap!==null && r.gap>=-5 && r.gap<200 && !r.hScrl;
    if(!ok) allPass=false;
    console.log("["+r.vp.padEnd(8)+"] "+(ok?"PASS":"ISSUE")+" | heroH="+r.heroH+"px  gap="+r.gap+"px  hScroll="+r.hScrl+"  ss="+r.ss);
  }
  const dT = (res.find(r=>r.vp==="desktop")?.heroH??0) > 500;
  const m3 = (res.find(r=>r.vp==="320px")?.heroH??9999) < 600;
  console.log("\nDesktop hero tall (>500px): "+dT);
  console.log("Mobile 320px compact (<600px): "+m3);
  console.log("FINAL: "+(allPass&&dT&&m3?"PASS":"NEEDS REVIEW"));
}
run().catch(e=>{console.error("FATAL:",e.message);process.exit(1);});
