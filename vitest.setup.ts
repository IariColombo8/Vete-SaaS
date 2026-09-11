import "@testing-library/jest-dom/vitest"

// jsdom no implementa scrollIntoView; @radix-ui/react-select lo llama al abrir el listbox.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom no implementa ResizeObserver; cmdk (el <Command> del selector de
// clientes) lo instancia al montar la lista.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
