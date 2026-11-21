// This function is serialized into the regression browser; keep helpers local.
export function auditPalette() {
  const root = document.querySelector("#presentation");
  const paint = document.querySelector("#card-colors").sheet;
  const geometry = () => [...root.querySelectorAll("*")].map(element => {
    const r = element.getBoundingClientRect();
    const s = getComputedStyle(element);
    return [r.x,r.y,r.width,r.height,s.fontSize,s.fontWeight,s.lineHeight,s.display];
  });
  paint.disabled = true;
  const before = geometry();
  paint.disabled = false;
  const after = geometry();
  const layoutUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const rgba = value => {
    const numbers = value.match(/[\d.]+/g)?.map(Number) || [0,0,0,0];
    return [numbers[0],numbers[1],numbers[2],numbers[3] ?? 1];
  };
  const over = (fg,bg) => {
    const a = fg[3] + bg[3] * (1-fg[3]);
    return a ? [0,1,2].map(i=>(fg[i]*fg[3]+bg[i]*bg[3]*(1-fg[3]))/a).concat(a) : [0,0,0,0];
  };
  const background = element => {
    const chain = [];
    for(let ancestor=element;ancestor;ancestor=ancestor.parentElement) chain.unshift(ancestor);
    return chain.reduce((bg,node)=>over(rgba(getComputedStyle(node).backgroundColor),bg),[255,255,255,1]);
  };
  const luminance = color => {
    const rgb = color.slice(0,3).map(v=>{
      const x=v/255;
      return x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4;
    });
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const issues = [];
  let minimumContrast = Infinity;
  let checkedText = 0;
  const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if(!node.textContent.trim() || element.closest(".sr-only,[hidden],script,style")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    if(![...range.getClientRects()].some(r=>r.width>1 && r.height>1)) continue;
    const style = getComputedStyle(element);
    if(style.visibility !== "visible") continue;
    const bg = background(element);
    const foreground = over(rgba(style.color),bg);
    const a = luminance(foreground), b = luminance(bg);
    const contrast = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    minimumContrast = Math.min(minimumContrast,contrast);
    checkedText++;
    if(contrast < 4.5) issues.push({
      text:node.textContent.trim(), color:style.color,
      background:bg, contrast:Number(contrast.toFixed(2))
    });
  }
  const fills = [...root.querySelectorAll("#slide-panel .content-item,#slide-panel .slide-team li,#slide-panel .slide-stat,#slide-panel .story-intro")];
  const darkCards = fills.filter(element=>luminance(background(element))<.75).map(e=>e.className);
  return {
    layoutUnchanged,issues,darkCards,checkedText,
    minimumContrast:Number(minimumContrast.toFixed(2)),
    shades:[...new Set(fills.map(element=>getComputedStyle(element).backgroundColor))]
  };
}
