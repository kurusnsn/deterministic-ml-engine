import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const headingOrderPlugin = {
  rules: {
    "heading-order": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Enforce a single h1 per page and prevent skipped heading levels.",
        },
        schema: [],
      },
      create(context) {
        let lastLevel = 0;
        let h1Count = 0;

        return {
          JSXOpeningElement(node) {
            if (node.name.type !== "JSXIdentifier") {
              return;
            }

            const match = /^h([1-6])$/.exec(node.name.name);
            if (!match) {
              return;
            }

            const level = Number(match[1]);
            if (level === 1) {
              h1Count += 1;
              if (h1Count > 1) {
                context.report({
                  node,
                  message: "Only one <h1> is allowed per page.",
                });
              }
            }

            if (lastLevel === 0 && level !== 1) {
              context.report({
                node,
                message:
                  "Headings should start with <h1> and follow order without skipping levels.",
              });
            } else if (lastLevel !== 0 && level > lastLevel + 1) {
              context.report({
                node,
                message: `Heading level should not jump from h${lastLevel} to h${level}.`,
              });
            }

            lastLevel = level;
          },
          "Program:exit"(node) {
            if (h1Count === 0) {
              context.report({
                node,
                message: "Each page should include a single <h1>.",
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "jsx-a11y/no-noninteractive-element-interactions": [
        "error",
        { handlers: ["onClick"] },
      ],
      "jsx-a11y/control-has-associated-label": [
        "error",
        { controlComponents: ["Button", "Input", "Textarea"], depth: 4 },
      ],
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either" }],
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "no-restricted-syntax": [
        "error",
        {
          "selector": "MemberExpression[property.name=/^NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)/]",
          "message": "Do not expose secrets with NEXT_PUBLIC_. Use a backend proxy instead."
        }
      ],
      "no-console":
        process.env.NODE_ENV === "production"
          ? ["error", { allow: ["error"] }]
          : ["warn", { allow: ["error"] }],
    },
  },
  {
    files: ["src/app/**/page.tsx"],
    plugins: {
      a11y: headingOrderPlugin,
    },
    rules: {
      "a11y/heading-order": "error",
    },
  },
];

export default eslintConfig;
