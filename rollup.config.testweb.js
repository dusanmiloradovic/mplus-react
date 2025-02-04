import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import replace from "rollup-plugin-replace";
import { string } from "rollup-plugin-string";
import react from "react";
import reactDom from "react-dom";

export default {
  input: "src/test-app.js",
  output: {
    file: "disttest/bundleweb.js",
    format: "iife",
    name: "mplusreact",
    sourcemap: true,
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true,
    }),
    commonjs({
      include: "node_modules/**",
      namedExports: {
        react: Object.keys(react),
        "react-dom": Object.keys(reactDom),
      },
    }),
    replace({
      "process.env.NODE_ENV": JSON.stringify("development"),
    }),
    babel({
      exclude: ["node_modules/**"],
    }),
    string({ include: "**/*.sql" }),
  ],
};
