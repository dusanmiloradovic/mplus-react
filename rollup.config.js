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
      }
    }),
    babel({
      exclude: ["node_modules/**"]
    })
  ]
};
