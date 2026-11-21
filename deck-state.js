/** Pure timing and configuration helpers shared by the deck engine and tests. */
export function createDeckState(slides) {
  if (!Array.isArray(slides) || slides.length === 0) throw new Error("SLIDES must contain at least one slide.");
  const ids = new Set();
  const starts = [];
  let duration = 0;
  slides.forEach((slide, index) => {
    if (!slide.id || ids.has(slide.id)) throw new Error(`Slide ${index + 1} needs a unique id.`);
    if (typeof slide.title !== "string" || !slide.title.trim()) throw new Error(`Slide ${index + 1} needs a title.`);
    if (!Number.isFinite(slide.duration) || slide.duration <= 0) throw new Error(`Slide ${index + 1} needs a positive duration.`);
    if (!slide.view || !Number.isFinite(slide.view.zoom) || slide.view.zoom <= 0) throw new Error(`Slide ${index + 1} needs a positive camera zoom.`);
    if (!["overview", "regional", 0, 1, 2, 3].includes(slide.view.site)) throw new Error(`Slide ${index + 1} has an invalid anatomical site.`);
    if (slide.bullets && (!Array.isArray(slide.bullets) || slide.bullets.length > 3)) throw new Error(`Slide ${index + 1} may contain at most three bullets.`);
    if (!Number.isFinite(slide.cancerTime) || slide.cancerTime < 0 || slide.cancerTime > 45000) throw new Error(`Slide ${index + 1} needs an illustrative cancerTime between 0 and 45000.`);
    ids.add(slide.id);
    starts.push(duration);
    duration += slide.duration * 1000;
  });
  function indexAt(time) {
    const safe = Math.min(duration, Math.max(0, Number.isFinite(time) ? time : 0));
    let index = slides.length - 1;
    while (index > 0 && safe < starts[index]) index -= 1;
    return index;
  }
  function cancerAt(time) {
    const index = indexAt(time);
    const slide = slides[index];
    const next = slides[index + 1] || slide;
    const fraction = Math.min(1, Math.max(0, (time - starts[index]) / (slide.duration * 1000)));
    const eased = fraction * fraction * (3 - 2 * fraction);
    return slide.cancerTime + (next.cancerTime - slide.cancerTime) * eased;
  }
  return { starts, duration, indexAt, cancerAt };
}
