import pluginVue from "eslint-plugin-vue";
import vueTsEslintConfig from "@vue/eslint-config-typescript";
import oxlint from "eslint-plugin-oxlint";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";
import prettierPlugin from "eslint-plugin-prettier";

export default [
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },
  {
    name: "app/files-to-ignore",
    ignores: ["**/dist/**", "**/dist-ssr/**", "**/coverage/**"],
  },
  ...pluginVue.configs["flat/essential"],
  ...vueTsEslintConfig(),
  oxlint.configs["flat/recommended"],
  skipFormatting,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "prettier/prettier": [
        "error",
        {
          semi: true,
          singleQuote: false,
          printWidth: 150,
          bracketSameLine: true,
          htmlWhitespaceSensitivity: "ignore",
        },
      ],
    },
  },
];
