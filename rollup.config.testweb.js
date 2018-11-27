import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import replace from "rollup-plugin-replace";

export default {
  input: "src/test-app.js",
  output: {
    file: "disttest/bundleweb.js",
    format: "iife",
    name: "mplusreact",
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
//    replace({
//      "process.env.NODE_ENV": JSON.stringify("development")
//    }),
    babel({
      exclude: ["node_modules/**"]
    })
  ]
};
