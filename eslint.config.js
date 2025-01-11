import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';


/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ['**/*.{js,mjs,cjs,ts,vue}'] },
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs['flat/essential'],
    { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            // '@typescript-eslint/no-var-requires': 'off',
            '@typescript-eslint/consistent-type-imports': 'error',
            semi: [
                'error',
                'always',
            ],
            'comma-dangle': [
                'warn',
                'always-multiline',
            ],
            quotes: [
                'warn',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                },
            ],
            indent: [
                'warn',
                4,
                {
                    SwitchCase: 1,
                },
            ],
            'vue/html-self-closing': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/html-indent': [
                'warn',
                4,
            ],
        },
    },
];