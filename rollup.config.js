import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";

export default {
  input: "src/mplus-react.js",
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
    babel({
      exclude: ["node_modules/**"]
    })
  ]
};
