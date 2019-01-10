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
      exclude: ["node_modules/**"]
    }),
    babel({
      exclude: ["node_modules/**"]
    })
  ]
};
