import "@testing-library/jest-dom/vitest"

// jsdom no implementa scrollIntoView; @radix-ui/react-select lo llama al abrir el listbox.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
