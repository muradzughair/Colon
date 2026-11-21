// Dependency-free Chromium regression checks for the presentation's actual DOM.
// Run after build-export.mjs, with the static preview workflow running.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { SLIDES } from "../slides.js";
import { auditPalette } from "./palette-audit.mjs";

const port = 9241;
const baseUrl = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/`
  : "http://127.0.0.1:5000/";
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/orefera-layout-${process.pid}`, "about:blank"
], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let pages;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (pages.some(page => page.type === "page")) break;
    } catch {}
    await sleep(100);
  }
  socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      message.error ? request.reject(message.error) : request.resolve(message.result);
      pending.delete(message.id);
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true, userGesture: true
    });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw Error(`Timed out: ${expression}`);
  };
  const jump = async index => {
    await evaluate(`document.querySelectorAll(".stage-marker")[${index}].click()`);
    await wait(`document.querySelector("#presentation").dataset.stage === "${index}"`);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: `${baseUrl}?presentation-check` });
  await wait('document.querySelector("#presentation")?.dataset.anchoredSites === "4"');
  await evaluate("document.fonts.ready");

  const sizes = process.argv.includes("--motion-only") ? [] : process.env.PRESENTATION_SIZES ? JSON.parse(process.env.PRESENTATION_SIZES) : [[1440, 900], [1366, 768], [1920, 1080], [1024, 600], [402, 874], [375, 667], [320, 568], [844, 390]];
  const layoutFailures = [];
  const paletteShades = new Set();
  let minimumContrast = Infinity;
  for (const [width, height] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 768
    });
    await sleep(120);
    let smallestScale = 1;
    for (let index = 0; index < SLIDES.length; index++) {
      await jump(index);
      const result = await evaluate(`(() => {
        const panel = document.querySelector("#slide-panel");
        const content = document.querySelector("#slide-content");
        const copy = content.querySelector(".slide-copy");
        const style = getComputedStyle(content);
        const box = content.getBoundingClientRect();
        const rect = copy?.getBoundingClientRect();
        const elements = copy ? [...copy.querySelectorAll("h1,p,li,.stat-value,.stat-unit")] : [];
        const textLines = [];
        if(copy) {
          const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
          while(walker.nextNode()) {
            if(!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            textLines.push(...range.getClientRects());
          }
        }
        return {
          text: content.textContent, visible: getComputedStyle(panel).display !== "none",
          scale: Number(panel.dataset.scale || 1),
          rect: rect?.toJSON(), contentBox: box.toJSON(),
          fitStyle: copy ? {
            scale:getComputedStyle(copy).getPropertyValue("--fit-scale"),
            unit:getComputedStyle(copy).getPropertyValue("--f"),
            title:getComputedStyle(copy.querySelector("h1")).fontSize,
            titleScale:getComputedStyle(copy.querySelector("h1")).getPropertyValue("--fit-scale"),
            titleUnit:getComputedStyle(copy.querySelector("h1")).getPropertyValue("--f"),
            rules:(()=>{
              const found=[],heading=copy.querySelector("h1");
              const scan=rules=>{for(const r of rules){
                if(r.conditionText && !matchMedia(r.conditionText).matches) continue;
                if(r.cssRules) scan(r.cssRules);
                if(r.selectorText && r.style.fontSize && heading.matches(r.selectorText)) found.push([r.selectorText,r.style.fontSize]);
              }};
              for(const sheet of document.styleSheets){try{scan(sheet.cssRules)}catch{}}
              return found;
            })(),
            sections:[...copy.children].map(e=>({class:e.className,height:e.getBoundingClientRect().height}))
          } : null,
          fits: !rect || rect.bottom <= box.bottom - parseFloat(style.paddingBottom) + 2,
          insideViewport: !rect || rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight - 45,
          childrenFit: elements.every(element => {
            const r = element.getBoundingClientRect();
            return r.left >= box.left - 1 && r.top >= box.top - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1;
          }),
          textLinesFit: textLines.every(r => r.left >= box.left - 1 && r.top >= box.top - 1 &&
            r.right <= box.right + 1 && r.bottom <= box.bottom + 1),
          scrollOffsets: [document.documentElement,document.body,document.querySelector("#presentation"),panel,content].map(element => {
            element.scrollTop = 10000;
            element.scrollLeft = 10000;
            return [element.scrollLeft,element.scrollTop];
          }),
          overflow: style.overflowY,
          documentFits: document.querySelector("#presentation").getBoundingClientRect().height <= innerHeight + 1,
          copyCount: content.children.length,
          motion: document.querySelector("#presentation").dataset.cameraMotion
        };
      })()`);
      const label = `${width}×${height}, slide ${index + 1} (${SLIDES[index].id})`;
      try {
      if(process.argv.includes("--palette-check")) {
        const palette = await evaluate(`(${auditPalette.toString()})()`);
        assert.equal(palette.layoutUnchanged,true,`Palette changed geometry or type: ${label}`);
        assert.deepEqual(palette.issues,[],`Text contrast below 4.5:1: ${label}: ${JSON.stringify(palette.issues)}`);
        assert.deepEqual(palette.darkCards,[],`A card still has a dark background: ${label}`);
        assert.ok(palette.checkedText > 0,`No readable text was audited: ${label}`);
        palette.shades.forEach(shade=>paletteShades.add(shade));
        minimumContrast=Math.min(minimumContrast,palette.minimumContrast);
      }
      assert.equal(result.documentFits, true, `Page exceeds viewport: ${label}`);
      assert.ok(!["auto", "scroll"].includes(result.overflow), `Scrollable copy: ${label}`);
      assert.equal(result.fits, true, `Copy overflows available height: ${label} ${JSON.stringify(result)}`);
      assert.equal(result.insideViewport, true, `Copy offscreen: ${label} ${JSON.stringify(result)}`);
      assert.equal(result.childrenFit, true, `Text clipped: ${label} ${JSON.stringify(result)}`);
      assert.equal(result.textLinesFit, true, `A text line extends outside the content area: ${label} ${JSON.stringify(result)}`);
      if(index !== 4) assert.ok(result.scale >= .8, `Text was reduced too much instead of reflowing: ${label} ${result.scale}`);
      assert.ok(result.scrollOffsets.every(([x,y]) => x === 0 && y === 0), `Scroll offsets allowed: ${label} ${JSON.stringify(result)}`);
      assert.equal(result.motion, "still", `Reduced motion ignored: ${label}`);
      if (index === 4) {
        assert.equal(result.copyCount, 0, `Demo must be empty: ${label}`);
        assert.equal(result.visible, false);
      } else {
        for (const text of [
          SLIDES[index].title, SLIDES[index].sub, SLIDES[index].body, SLIDES[index].note,
          ...(SLIDES[index].bullets || []),
          ...(SLIDES[index].team || []).flatMap(member => [member.name, member.role])
        ].filter(Boolean)) assert.ok(result.text.includes(text), `Missing copy: ${label}: ${text}`);
      }
      } catch (error) {
        layoutFailures.push(error.message);
      }
      smallestScale = Math.min(smallestScale, result.scale);
    }
    console.log(`${layoutFailures.some(error=>error.includes(`${width}×${height}`)) ? "FAIL" : "PASS"}: all ten slides, no scrolling or hidden copy at ${width}×${height}; minimum fit ${smallestScale}.`);
  }
  assert.equal(layoutFailures.length, 0, layoutFailures.join("\n"));
  if(process.argv.includes("--palette-check")) {
    assert.ok(paletteShades.size >= 5,"The deck should use coordinated complementary card shades.");
    console.log(`PASS: light card palette uses ${paletteShades.size} shades; minimum measured text contrast ${minimumContrast}:1; every slide's geometry and typography stayed identical.`);
  }

  // Exercise actual wheel input over the copy, not just overflow declarations.
  const wheelState = () => evaluate(`({
    slide:document.querySelector("#presentation").dataset.slideId,
    offsets:[document.documentElement,document.body,document.querySelector("#presentation"),document.querySelector("#slide-panel"),document.querySelector("#slide-content")].map(e=>[e.scrollLeft,e.scrollTop])
  })`);
  const beforeWheel = await wheelState();
  const wheelPoint = await evaluate(`(()=>{
    const r=document.querySelector("#slide-panel").getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...wheelPoint, deltaX: 0, deltaY: 900 });
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...wheelPoint, deltaX: 900, deltaY: 0 });
  assert.deepEqual(await wheelState(), beforeWheel);
  console.log("PASS: real vertical and horizontal wheel input neither scrolls the copy nor changes the slide.");

  if (!process.argv.includes("--layout-only")) {
  await send("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  await jump(1);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 320, y: 450 }] });
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 120, y: 450 }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait('document.querySelector("#presentation").dataset.stage === "2"');
  console.log("PASS: touch slide navigation still works without a scroll container.");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await jump(0);
  await evaluate('if(document.querySelector(".playback-toggle").getAttribute("aria-pressed")==="false") document.querySelector(".playback-toggle").click()');
  await wait('document.querySelector("#presentation").dataset.cameraMotion === "ambient"');
  const position = await evaluate('document.querySelector("#presentation").dataset.cameraPosition');
  const markerPosition = await evaluate('document.querySelector(".anatomy-marker").style.transform');
  await sleep(1800);
  assert.notEqual(await evaluate('document.querySelector("#presentation").dataset.cameraPosition'), position);
  assert.notEqual(await evaluate('document.querySelector(".anatomy-marker").style.transform'), markerPosition);
  const labels = await evaluate('[...document.querySelectorAll(".anatomy-marker")].filter(e => !e.hidden).map(e => e.textContent)');
  assert.ok(labels.some(text => text.includes("Cancer illustration") && text.includes("colon")));
  await evaluate('document.querySelector(".playback-toggle").click()');
  await sleep(200);
  const pausedPosition = await evaluate('document.querySelector("#presentation").dataset.cameraPosition');
  await sleep(500);
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.cameraPosition'), pausedPosition);
  await jump(3);
  await wait('document.querySelector("#presentation").dataset.cameraFlight === "0"');
  assert.equal(await evaluate('document.querySelector(".playback-toggle").getAttribute("aria-pressed")'), "false");
  await evaluate('document.querySelector(".playback-toggle").click()');
  await wait('document.querySelector("#presentation").dataset.cameraMotion === "ambient"');
  assert.ok(await evaluate('[...document.querySelectorAll(".anatomy-marker")].some(e=>!e.hidden && e.textContent.includes("Transverse colon"))'));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 1100, y: 450, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1180, y: 480, button: "left", buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 1180, y: 480, button: "left" });
  await wait('document.querySelector("#presentation").dataset.cameraMotion === "ambient"');
  assert.equal(await evaluate('document.querySelector(".playback-toggle").getAttribute("aria-pressed")'), "true");
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.stage'), "3");
  await jump(4);
  assert.equal(await evaluate('document.querySelectorAll(".anatomy-marker").length'), 0);
  assert.deepEqual(exceptions, []);
  console.log("PASS: moving camera, explicit pause, varied chapter flights, attached cancer labels, blank demo, no JavaScript exceptions.");
  await send("Page.navigate", { url: new URL("../index.html", import.meta.url).href });
  await wait('document.querySelector("#presentation")?.dataset.anchoredSites === "4" && document.querySelector(".slide-brand-mark")?.naturalWidth > 0');
  assert.equal(await evaluate('document.querySelectorAll(".stage-marker").length'), 10);
  assert.deepEqual(exceptions, []);
  console.log("PASS: standalone HTML opens directly with its embedded colon, logo, layout, and motion helpers.");

  // Drive the scene past the old 42-second slide boundary without a real-time
  // wait. Only the scene RAF is intercepted; fitting and browser painting stay native.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    // Rendering was exercised above. Skip GPU draws during the clock regression,
    // while still executing the actual scene, navigation, and camera code.
    for (const api of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
      if(api) for(const name of ["drawElements","drawArrays"]) api.prototype[name] = function(){};
    }
    const nativeFrame = window.requestAnimationFrame.bind(window);
    let sceneFrame, simulatedTime = performance.now();
    window.requestAnimationFrame = function(callback) {
      if(callback.name === "animate") { sceneFrame = callback; return 0; }
      return nativeFrame(callback);
    };
    window.advanceScene = function(frames) {
      for(let frame=0;frame<frames;frame++) {
        simulatedTime += 1000;
        sceneFrame(simulatedTime);
      }
    };
  ` });
  await send("Page.navigate", { url: `${baseUrl}?manual-clock-check#problem` });
  await wait('document.querySelector("#presentation")?.dataset.anchoredSites === "4"');
  console.log("Checking independent animation clock…");
  await evaluate("advanceScene(2)");
  const selectedSlide = await evaluate('document.querySelector("#presentation").dataset.slideId');
  const selectedSeek = await evaluate('document.querySelector(".timeline-seek").value');
  const beforeAnimation = await evaluate('document.querySelector("#presentation").dataset.cameraPosition');
  await evaluate("advanceScene(50)");
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.slideId'), selectedSlide);
  assert.equal(await evaluate('document.querySelector(".timeline-seek").value'), selectedSeek);
  assert.notEqual(await evaluate('document.querySelector("#presentation").dataset.cameraPosition'), beforeAnimation);
  await evaluate('document.querySelector(".playback-toggle").click(); advanceScene(1)');
  const heldCamera = await evaluate('document.querySelector("#presentation").dataset.cameraPosition');
  await evaluate("advanceScene(3)");
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.cameraPosition'), heldCamera);
  await evaluate('document.querySelector(".playback-toggle").click(); advanceScene(10)');
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.slideId'), selectedSlide);
  await jump(9);
  await evaluate("advanceScene(50)");
  assert.equal(await evaluate('document.querySelector("#presentation").dataset.slideId'), "the-ask");
  assert.equal(await evaluate('document.querySelector(".playback-toggle").getAttribute("aria-pressed")'), "true");
  assert.deepEqual(exceptions, []);
  console.log("PASS: over 50 simulated animation seconds do not change the slide or seek position; pause freezes motion, resume stays on the same slide, and the final slide never loops to the start.");
  }
} finally {
  socket?.close();
  browser.kill("SIGTERM");
}
