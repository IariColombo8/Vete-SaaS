import nextConfig from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Estas reglas nuevas de eslint-plugin-react-hooks (orientadas al React
      // Compiler) marcan como error patrones estándar de React que están en
      // todo este codebase (setState dentro de useEffect, refs inicializadas
      // en el primer render, etc.) — no son bugs reales, solo no son el
      // estilo que exige el compiler. Se desactivan hasta que el proyecto
      // decida adoptar el compiler a propósito.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    ignores: [
      "parte de kiosko/**",
      "z codigo de barra/**",
      "prompt receta/**",
      "v0 by Vercel - Build Full-Stack Web Apps with AI_files/**",
      ".claude/**",
    ],
  },
]

export default eslintConfig
