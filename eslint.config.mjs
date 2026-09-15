import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // `gsap` se importa en un solo archivo y en ninguno mas.
  //
  // Es lo que hace que `prefers-reduced-motion` se respete en un `matchMedia`
  // unico en vez de en cada sitio de uso, y que el dia que GSAP sobre se lo
  // saque borrando un archivo. Va como lint y no como convencion a proposito:
  // lo unico que sostiene una regla asi por meses en un proyecto de una sola
  // persona es que falle sola.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/motion.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["gsap", "gsap/*", "@gsap/*"],
              message:
                "GSAP se importa solo en src/lib/motion.ts. Agrega ahi lo que necesites y usalo desde el modulo.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
