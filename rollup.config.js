let commonjs = require("rollup-plugin-commonjs");
let resolve = require("rollup-plugin-node-resolve");
let builtins = require("rollup-plugin-node-builtins");
let globals = require("rollup-plugin-node-globals");
let replace = require("rollup-plugin-replace");
let plugins = [
  replace({
    include: ["**/transit.js", "node_modules/uuid/**"],
    delimiters: ["", ""],
    values: {
      "crypto.randomBytes": "require('randombytes')",
      Buffer: "undefined"
    }
  }),
  resolve({
    browser: true
  }),
  globals(),
  builtins(),
  commonjs()
];

module.exports = {
  input: "demo.js",
  plugins,
  output: {
    name: "bundle",
    file: "bundle.js",
    format: "iife", // immediately-invoked function expression — suitable for <script> tags
    sourcemap: true
  }
};
