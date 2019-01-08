import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import { eslint } from "rollup-plugin-eslint";

export default {
  input: "src/mplus-react.js",
  external: ["react", "react-dom", "react-multiple-contexts"],
  output: {
    file: "distrollup/bundle.js",
    format: "es",
    name: "react-mplus",
    sourcemap: true
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true
    }),
    commonjs({
      include: "node_modules/**"
    }),
    eslint({
      extends: ["eslint:recommended", "google"],
      envs: ["browser", "mocha"],
      useEslintrc: false,
      parser: "babel-eslint",
      parserOptions: {
        ecmaVersion: 6,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
          modules: true,
          experimentalObjectRestSpread: true
        }
      },
      rules: {
        // enable additional rules
        quotes: ["error", "double"],
        semi: ["error", "always"],

        // override default options for rules from base configurations
        "no-cond-assign": ["error", "always"],

        // disable rules from base configurations
        "no-console": "off"
      }
    }),
    babel({
      exclude: ["node_modules/**"]
    })
  ]
};
