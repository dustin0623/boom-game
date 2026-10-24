import next from "eslint-config-next";

export default [
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
  ...next,
  {
    rules: {
      // These React Compiler diagnostics are not yet actionable across the
      // existing UI and are outside the Hive migration scope.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
];
