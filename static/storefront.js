"use strict";
(() => {
  const slides = Array.from(document.querySelectorAll(".hero-slide"));
  const dots = Array.from(document.querySelectorAll("[data-banner]"));
  let current = 0;
  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    dots.forEach((dot, i) => {
      dot.classList.toggle("selected", i === current);
      dot.setAttribute("aria-pressed", String(i === current));
    });
  }
  if (slides.length) {
    document.getElementById("slider-prev")?.addEventListener("click", () => show(current - 1));
    document.getElementById("slider-next")?.addEventListener("click", () => show(current + 1));
    dots.forEach((dot, i) => dot.addEventListener("click", () => show(i)));
    show(0);
  }
})();
